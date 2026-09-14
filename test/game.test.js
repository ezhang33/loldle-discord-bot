const test = require("node:test");
const assert = require("node:assert/strict");

const { find, search, compare, marks, champions, GREEN, RED, ORANGE, UP, DOWN } = require("../src/champions");
const { dayKey, previousDay, recentDays, pickIndex, msUntilNextDay, formatDuration } = require("../src/daily");
const { rankDay, rankPeriod, userStats } = require("../src/game");
const { open } = require("../src/db");

test("champion lookup is case-insensitive and handles punctuation", () => {
    assert.equal(find("ahri").name, "Ahri");
    assert.equal(find("KAI'SA").name, "Kai'Sa");
    assert.equal(find("  Nunu & Willump ").name, "Nunu & Willump");
    assert.equal(find("Not A Champ"), null);
});

test("search prefers prefix matches and caps at 25", () => {
    assert.equal(search("").length, 25);
    const results = search("ka").map((c) => c.name);
    assert.ok(results.every((n) => n.toLowerCase().includes("ka")));
    assert.ok(results.indexOf("Kai'Sa") < results.indexOf("Akali"));
});

test("compare marks exact, partial, and year direction", () => {
    const lux = find("Lux"); // F, Middle/Support, Human/Magicborn, Mana, Ranged, Demacia, 2010
    const self = compare(lux, lux);
    assert.equal(marks(self), GREEN.repeat(7));

    const garen = find("Garen"); // M, Top, Human, Manaless, Melee, Demacia, 2010
    const c = compare(garen, lux);
    const byLabel = Object.fromEntries(c.map((x) => [x.label, x.mark]));
    assert.equal(byLabel.Gender, RED);
    assert.equal(byLabel.Species, ORANGE); // Human shared, Magicborn not
    assert.equal(byLabel["Region(s)"], GREEN);
    assert.equal(byLabel["Release year"], GREEN);
    assert.equal(byLabel["Range type"], RED);

    const zeri = find("Zeri"); // 2022
    assert.equal(compare(zeri, lux).at(-1).mark, DOWN); // answer is older
    assert.equal(compare(lux, zeri).at(-1).mark, UP);
});

test("day keys respect the time zone and roll over at local midnight", () => {
    // 03:30 UTC on Jan 2 is still Jan 1 in New York.
    const t = new Date("2026-01-02T03:30:00Z");
    assert.equal(dayKey("America/New_York", t), "2026-01-01");
    assert.equal(dayKey("UTC", t), "2026-01-02");
    assert.equal(previousDay("2026-03-01"), "2026-02-28");
    assert.deepEqual(recentDays("UTC", 3, t), ["2026-01-02", "2026-01-01", "2025-12-31"]);
    // 03:30 UTC -> local 22:30 EST, so 1.5h until midnight.
    assert.equal(Math.round(msUntilNextDay("America/New_York", t) / 60000), 90);
});

test("daily pick is deterministic and varies by guild and day", () => {
    const a = pickIndex("seed", "g1", "2026-01-01", champions.length);
    assert.equal(pickIndex("seed", "g1", "2026-01-01", champions.length), a);
    const others = new Set([
        pickIndex("seed", "g2", "2026-01-01", champions.length),
        pickIndex("seed", "g1", "2026-01-02", champions.length),
        pickIndex("other", "g1", "2026-01-01", champions.length),
    ]);
    assert.ok(others.size > 1 || !others.has(a), "expected the pick to depend on its inputs");
});

test("formatDuration", () => {
    assert.equal(formatDuration(4000), "4s");
    assert.equal(formatDuration(125000), "2m 5s");
    assert.equal(formatDuration(3_700_000), "1h 1m");
});

const game = (user, status, guesses, started, finished, day = "2026-01-01") => ({
    user_id: user,
    status,
    guesses,
    started_at: started,
    finished_at: finished,
    day,
});

test("rankDay: fewest guesses, then fastest; gave-ups after; playing counted", () => {
    const { solved, gaveUp, playing } = rankDay([
        game("slow", "solved", 3, 0, 500),
        game("fast", "solved", 3, 0, 100),
        game("best", "solved", 2, 0, 900),
        game("quit", "gave_up", 5, 0, 50),
        game("wip", "playing", 1, 0, null),
    ]);
    assert.deepEqual(solved.map((g) => g.user_id), ["best", "fast", "slow"]);
    assert.deepEqual(gaveUp.map((g) => g.user_id), ["quit"]);
    assert.equal(playing, 1);
});

test("rankPeriod: most solves, then lowest average guesses", () => {
    const rows = rankPeriod([
        game("a", "solved", 2, 0, 10, "d1"),
        game("a", "solved", 4, 0, 10, "d2"),
        game("b", "solved", 1, 0, 10, "d1"),
        game("b", "gave_up", 9, 0, 10, "d2"),
        game("c", "solved", 5, 0, 10, "d1"),
        game("c", "solved", 5, 0, 10, "d2"),
    ]);
    assert.deepEqual(rows.map((r) => r.user_id), ["a", "c", "b"]);
    assert.equal(rows[0].avgGuesses, 3);
    assert.equal(rows[2].played, 2);
});

test("userStats: streaks and distribution", () => {
    const stats = userStats(
        [
            game("u", "solved", 3, 0, 10, "2026-01-01"),
            game("u", "solved", 7, 0, 10, "2026-01-02"),
            game("u", "gave_up", 4, 0, 10, "2026-01-03"),
            game("u", "solved", 2, 0, 10, "2026-01-05"),
            game("u", "solved", 2, 0, 10, "2026-01-06"),
        ],
        "2026-01-06"
    );
    assert.equal(stats.played, 5);
    assert.equal(stats.solved, 4);
    assert.equal(stats.currentStreak, 2);
    assert.equal(stats.bestStreak, 2);
    assert.equal(stats.distribution[2], 2);
    assert.equal(stats.distribution["7+"], 1);
    // Streak survives if today isn't played yet but yesterday was solved.
    assert.equal(userStats([game("u", "solved", 1, 0, 1, "2026-01-05")], "2026-01-06").currentStreak, 1);
    assert.equal(userStats([game("u", "solved", 1, 0, 1, "2026-01-04")], "2026-01-06").currentStreak, 0);
});

test("db: answer is pinned once per guild/day; game flow persists", () => {
    const db = open(":memory:");
    assert.equal(db.answerFor("g", "2026-01-01", "Ahri"), "Ahri");
    assert.equal(db.answerFor("g", "2026-01-01", "Zed"), "Ahri", "first stored answer wins");
    assert.equal(db.answerFor("g", "2026-01-02", "Zed"), "Zed");

    assert.equal(db.getGame("g", "2026-01-01", "u"), null);
    const g = db.startGame("g", "2026-01-01", "u", 1000);
    assert.equal(g.status, "playing");
    db.recordGuess("g", "2026-01-01", "u", 1, "Lux", 1100);
    db.recordGuess("g", "2026-01-01", "u", 2, "Ahri", 1200);
    db.finishGame("g", "2026-01-01", "u", "solved", 1200);
    const done = db.getGame("g", "2026-01-01", "u");
    assert.equal(done.guesses, 2);
    assert.equal(done.status, "solved");
    assert.deepEqual(db.guessesFor("g", "2026-01-01", "u").map((x) => x.champion), ["Lux", "Ahri"]);
    assert.equal(db.dayGames("g", "2026-01-01").length, 1);
    assert.equal(db.gamesInDays("g", ["2026-01-01", "2026-01-02"]).length, 1);
    assert.equal(db.allFinishedGames("other").length, 0);
    db.close();
});

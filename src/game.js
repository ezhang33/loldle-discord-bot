// Game rules and ranking, independent of Discord.
const { champions, find, compare, marks } = require("./champions");
const { dayKey, pickIndex, previousDay } = require("./daily");

function solveTime(game) {
    return game.finished_at - game.started_at;
}

// Today's answer for a guild. Deterministic from (seed, guild, day) and then
// pinned in the database so it never changes mid-day (e.g. after a data update).
function todaysAnswer(client, guildId) {
    const day = dayKey(client.config.timezone);
    const fallback = champions[pickIndex(client.config.seed, guildId, day, champions.length)].name;
    return { day, answer: find(client.db.answerFor(guildId, day, fallback)) };
}

// Each of the user's guesses so far with its comparison, in order.
function history(client, guildId, day, userId, answer) {
    return client.db.guessesFor(guildId, day, userId).map((g) => {
        const champion = find(g.champion);
        const comparison = compare(champion, answer);
        return { n: g.n, name: champion.name, comparison, marks: marks(comparison) };
    });
}

// Rank one day's games: solved first (fewest guesses, then fastest), then
// gave-ups (fewest guesses). Players still playing are excluded.
function rankDay(games) {
    const solved = games
        .filter((g) => g.status === "solved")
        .sort((a, b) => a.guesses - b.guesses || solveTime(a) - solveTime(b));
    const gaveUp = games.filter((g) => g.status === "gave_up").sort((a, b) => a.guesses - b.guesses);
    const playing = games.filter((g) => g.status === "playing").length;
    return { solved, gaveUp, playing };
}

// Aggregate finished games per user and rank: most solves, then lowest
// average guesses, then lowest average solve time.
function rankPeriod(games) {
    const byUser = new Map();
    for (const g of games) {
        let row = byUser.get(g.user_id);
        if (!row) {
            row = { user_id: g.user_id, played: 0, solved: 0, totalGuesses: 0, totalTime: 0 };
            byUser.set(g.user_id, row);
        }
        row.played++;
        if (g.status === "solved") {
            row.solved++;
            row.totalGuesses += g.guesses;
            row.totalTime += solveTime(g);
        }
    }
    return [...byUser.values()]
        .map((r) => ({
            ...r,
            avgGuesses: r.solved ? r.totalGuesses / r.solved : null,
            avgTime: r.solved ? r.totalTime / r.solved : null,
        }))
        .sort(
            (a, b) =>
                b.solved - a.solved ||
                (a.avgGuesses ?? Infinity) - (b.avgGuesses ?? Infinity) ||
                (a.avgTime ?? Infinity) - (b.avgTime ?? Infinity)
        );
}

// Personal stats from a user's finished games (sorted by day ascending).
function userStats(games, today) {
    const solved = games.filter((g) => g.status === "solved");
    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, "7+": 0 };
    for (const g of solved) distribution[g.guesses >= 7 ? "7+" : g.guesses]++;

    const solvedDays = new Set(solved.map((g) => g.day));
    // Current streak: consecutive solved days ending today or yesterday.
    let current = 0;
    let cursor = solvedDays.has(today) ? today : previousDay(today);
    while (solvedDays.has(cursor)) {
        current++;
        cursor = previousDay(cursor);
    }
    // Best streak over all solved days.
    let best = 0;
    for (const day of solvedDays) {
        if (solvedDays.has(previousDay(day))) continue; // not a streak start
        let length = 0;
        let d = day;
        while (solvedDays.has(d)) {
            length++;
            d = nextDay(d);
        }
        best = Math.max(best, length);
    }

    return {
        played: games.length,
        solved: solved.length,
        avgGuesses: solved.length ? solved.reduce((s, g) => s + g.guesses, 0) / solved.length : null,
        avgTime: solved.length ? solved.reduce((s, g) => s + solveTime(g), 0) / solved.length : null,
        currentStreak: current,
        bestStreak: best,
        distribution,
    };
}

function nextDay(day) {
    const d = new Date(`${day}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
}

module.exports = { todaysAnswer, history, rankDay, rankPeriod, userStats, solveTime };

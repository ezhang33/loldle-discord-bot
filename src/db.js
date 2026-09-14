const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const SCHEMA = `
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS daily_answers (
    guild_id  TEXT NOT NULL,
    day       TEXT NOT NULL,
    champion  TEXT NOT NULL,
    PRIMARY KEY (guild_id, day)
);

CREATE TABLE IF NOT EXISTS games (
    guild_id    TEXT    NOT NULL,
    day         TEXT    NOT NULL,
    user_id     TEXT    NOT NULL,
    guesses     INTEGER NOT NULL DEFAULT 0,
    status      TEXT    NOT NULL DEFAULT 'playing', -- playing | solved | gave_up
    started_at  INTEGER NOT NULL,
    finished_at INTEGER,
    PRIMARY KEY (guild_id, day, user_id)
);

CREATE TABLE IF NOT EXISTS guesses (
    guild_id   TEXT    NOT NULL,
    day        TEXT    NOT NULL,
    user_id    TEXT    NOT NULL,
    n          INTEGER NOT NULL,
    champion   TEXT    NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (guild_id, day, user_id, n)
);
`;

function open(dbPath) {
    if (dbPath !== ":memory:") fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    const db = new DatabaseSync(dbPath);
    db.exec(SCHEMA);

    const stmts = {
        getAnswer: db.prepare("SELECT champion FROM daily_answers WHERE guild_id = ? AND day = ?"),
        setAnswer: db.prepare("INSERT OR IGNORE INTO daily_answers (guild_id, day, champion) VALUES (?, ?, ?)"),
        getGame: db.prepare("SELECT * FROM games WHERE guild_id = ? AND day = ? AND user_id = ?"),
        startGame: db.prepare("INSERT INTO games (guild_id, day, user_id, started_at) VALUES (?, ?, ?, ?)"),
        addGuess: db.prepare("INSERT INTO guesses (guild_id, day, user_id, n, champion, created_at) VALUES (?, ?, ?, ?, ?, ?)"),
        bumpGuesses: db.prepare("UPDATE games SET guesses = guesses + 1 WHERE guild_id = ? AND day = ? AND user_id = ?"),
        finishGame: db.prepare("UPDATE games SET status = ?, finished_at = ? WHERE guild_id = ? AND day = ? AND user_id = ?"),
        guessesFor: db.prepare("SELECT n, champion FROM guesses WHERE guild_id = ? AND day = ? AND user_id = ? ORDER BY n"),
        dayGames: db.prepare("SELECT * FROM games WHERE guild_id = ? AND day = ?"),
        userGames: db.prepare("SELECT * FROM games WHERE guild_id = ? AND user_id = ? AND status != 'playing' ORDER BY day"),
    };

    return {
        // Returns the stored answer for the day, storing `fallback` first if none exists.
        answerFor(guildId, day, fallback) {
            stmts.setAnswer.run(guildId, day, fallback);
            return stmts.getAnswer.get(guildId, day).champion;
        },
        getGame(guildId, day, userId) {
            return stmts.getGame.get(guildId, day, userId) || null;
        },
        startGame(guildId, day, userId, now) {
            stmts.startGame.run(guildId, day, userId, now);
            return stmts.getGame.get(guildId, day, userId);
        },
        recordGuess(guildId, day, userId, n, champion, now) {
            stmts.addGuess.run(guildId, day, userId, n, champion, now);
            stmts.bumpGuesses.run(guildId, day, userId);
        },
        finishGame(guildId, day, userId, status, now) {
            stmts.finishGame.run(status, now, guildId, day, userId);
        },
        guessesFor(guildId, day, userId) {
            return stmts.guessesFor.all(guildId, day, userId);
        },
        dayGames(guildId, day) {
            return stmts.dayGames.all(guildId, day);
        },
        // Finished games in the given set of days, all users.
        gamesInDays(guildId, days) {
            if (days.length === 0) return [];
            const placeholders = days.map(() => "?").join(",");
            return db
                .prepare(`SELECT * FROM games WHERE guild_id = ? AND status != 'playing' AND day IN (${placeholders})`)
                .all(guildId, ...days);
        },
        allFinishedGames(guildId) {
            return db.prepare("SELECT * FROM games WHERE guild_id = ? AND status != 'playing'").all(guildId);
        },
        userGames(guildId, userId) {
            return stmts.userGames.all(guildId, userId);
        },
        close() {
            db.close();
        },
    };
}

module.exports = { open };

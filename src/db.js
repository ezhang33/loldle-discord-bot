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

-- Audit trail for /neeko (webhook impersonation), so "who posted that" is always answerable.
CREATE TABLE IF NOT EXISTS neeko_log (
    message_id  TEXT    PRIMARY KEY,
    guild_id    TEXT    NOT NULL,
    channel_id  TEXT    NOT NULL,
    webhook_id  TEXT    NOT NULL,
    actor_id    TEXT    NOT NULL,
    target_id   TEXT    NOT NULL,
    content     TEXT    NOT NULL,
    created_at  INTEGER NOT NULL,
    revealed_at INTEGER
);
`;

// Columns added after the table first shipped; ALTER is a no-op when present.
const MIGRATIONS = [
    "ALTER TABLE neeko_log ADD COLUMN revealed_at INTEGER",
];

function open(dbPath) {
    if (dbPath !== ":memory:") fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    const db = new DatabaseSync(dbPath);
    db.exec(SCHEMA);
    for (const sql of MIGRATIONS) {
        try {
            db.exec(sql);
        } catch (error) {
            if (!/duplicate column/.test(error.message)) throw error;
        }
    }

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
        addNeeko: db.prepare(
            "INSERT INTO neeko_log (message_id, guild_id, channel_id, webhook_id, actor_id, target_id, content, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        ),
        neekoByMessage: db.prepare("SELECT * FROM neeko_log WHERE message_id = ?"),
        neekoLastByActor: db.prepare("SELECT * FROM neeko_log WHERE guild_id = ? AND actor_id = ? ORDER BY created_at DESC LIMIT 1"),
        neekoRecent: db.prepare("SELECT * FROM neeko_log WHERE guild_id = ? ORDER BY created_at DESC LIMIT ?"),
        deleteNeeko: db.prepare("DELETE FROM neeko_log WHERE message_id = ?"),
        markNeekoRevealed: db.prepare("UPDATE neeko_log SET revealed_at = ? WHERE message_id = ? AND revealed_at IS NULL"),
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
        logNeeko(row) {
            stmts.addNeeko.run(row.messageId, row.guildId, row.channelId, row.webhookId, row.actorId, row.targetId, row.content, row.createdAt);
        },
        neekoByMessage(messageId) {
            return stmts.neekoByMessage.get(messageId) || null;
        },
        neekoLastByActor(guildId, actorId) {
            return stmts.neekoLastByActor.get(guildId, actorId) || null;
        },
        neekoRecent(guildId, limit) {
            return stmts.neekoRecent.all(guildId, limit);
        },
        deleteNeeko(messageId) {
            stmts.deleteNeeko.run(messageId);
        },
        markNeekoRevealed(messageId, now) {
            stmts.markNeekoRevealed.run(now, messageId);
        },
        close() {
            db.close();
        },
    };
}

module.exports = { open };

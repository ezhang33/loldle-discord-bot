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

CREATE TABLE IF NOT EXISTS pokedle_answers (
    guild_id  TEXT    NOT NULL,
    day       TEXT    NOT NULL,
    gen_from  INTEGER NOT NULL,
    gen_to    INTEGER NOT NULL,
    pokemon_id INTEGER NOT NULL,
    PRIMARY KEY (guild_id, day, gen_from, gen_to)
);

CREATE TABLE IF NOT EXISTS pokedle_ranges (
    guild_id   TEXT    NOT NULL,
    user_id    TEXT    NOT NULL,
    gen_from   INTEGER NOT NULL DEFAULT 1 CHECK (gen_from BETWEEN 1 AND 9),
    gen_to     INTEGER NOT NULL DEFAULT 9 CHECK (gen_to BETWEEN 1 AND 9),
    updated_at INTEGER NOT NULL,
    CHECK (gen_from <= gen_to),
    PRIMARY KEY (guild_id, user_id)
);

CREATE TABLE IF NOT EXISTS pokedle_games (
    guild_id    TEXT    NOT NULL,
    day         TEXT    NOT NULL,
    gen_from    INTEGER NOT NULL,
    gen_to      INTEGER NOT NULL,
    user_id     TEXT    NOT NULL,
    guesses     INTEGER NOT NULL DEFAULT 0,
    status      TEXT    NOT NULL DEFAULT 'playing',
    started_at  INTEGER NOT NULL,
    finished_at INTEGER,
    PRIMARY KEY (guild_id, day, gen_from, gen_to, user_id)
);

CREATE TABLE IF NOT EXISTS pokedle_guesses (
    guild_id   TEXT    NOT NULL,
    day        TEXT    NOT NULL,
    gen_from   INTEGER NOT NULL,
    gen_to     INTEGER NOT NULL,
    user_id    TEXT    NOT NULL,
    n          INTEGER NOT NULL,
    pokemon_id INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (guild_id, day, gen_from, gen_to, user_id, n)
);

CREATE TABLE IF NOT EXISTS gold_accounts (
    guild_id      TEXT    NOT NULL,
    user_id       TEXT    NOT NULL,
    bank_balance  INTEGER NOT NULL DEFAULT 1000,
    gold_balance  INTEGER NOT NULL DEFAULT 0 CHECK (gold_balance >= 0),
    created_at    INTEGER NOT NULL,
    updated_at    INTEGER NOT NULL,
    PRIMARY KEY (guild_id, user_id)
);

CREATE TABLE IF NOT EXISTS gold_transactions (
    id          TEXT PRIMARY KEY,
    guild_id    TEXT    NOT NULL,
    kind        TEXT    NOT NULL,
    actor_id    TEXT    NOT NULL,
    created_at  INTEGER NOT NULL,
    details     TEXT    NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS gold_ledger (
    transaction_id TEXT    NOT NULL,
    user_id        TEXT    NOT NULL,
    bank_delta     INTEGER NOT NULL DEFAULT 0,
    gold_delta     INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (transaction_id, user_id)
);

CREATE TABLE IF NOT EXISTS dice_bets (
    interaction_id TEXT PRIMARY KEY,
    guild_id       TEXT    NOT NULL,
    user_id        TEXT    NOT NULL,
    bet            INTEGER NOT NULL,
    mode           TEXT    NOT NULL CHECK (mode IN ('exact', 'avoid')),
    choice         INTEGER NOT NULL CHECK (choice BETWEEN 1 AND 6),
    rolled         INTEGER NOT NULL CHECK (rolled BETWEEN 1 AND 6),
    payout         INTEGER NOT NULL,
    created_at     INTEGER NOT NULL
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
        pokedleRange: db.prepare("SELECT gen_from, gen_to FROM pokedle_ranges WHERE guild_id = ? AND user_id = ?"),
        setPokedleRange: db.prepare("INSERT INTO pokedle_ranges (guild_id, user_id, gen_from, gen_to, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(guild_id, user_id) DO UPDATE SET gen_from=excluded.gen_from, gen_to=excluded.gen_to, updated_at=excluded.updated_at"),
        pokedleAnswer: db.prepare("SELECT pokemon_id FROM pokedle_answers WHERE guild_id = ? AND day = ? AND gen_from = ? AND gen_to = ?"),
        setPokedleAnswer: db.prepare("INSERT OR IGNORE INTO pokedle_answers (guild_id, day, gen_from, gen_to, pokemon_id) VALUES (?, ?, ?, ?, ?)"),
        pokedleGame: db.prepare("SELECT * FROM pokedle_games WHERE guild_id = ? AND day = ? AND gen_from = ? AND gen_to = ? AND user_id = ?"),
        startPokedleGame: db.prepare("INSERT INTO pokedle_games (guild_id, day, gen_from, gen_to, user_id, started_at) VALUES (?, ?, ?, ?, ?, ?)"),
        addPokedleGuess: db.prepare("INSERT INTO pokedle_guesses (guild_id, day, gen_from, gen_to, user_id, n, pokemon_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"),
        bumpPokedleGuesses: db.prepare("UPDATE pokedle_games SET guesses = guesses + 1 WHERE guild_id = ? AND day = ? AND gen_from = ? AND gen_to = ? AND user_id = ?"),
        finishPokedleGame: db.prepare("UPDATE pokedle_games SET status = ?, finished_at = ? WHERE guild_id = ? AND day = ? AND gen_from = ? AND gen_to = ? AND user_id = ?"),
        pokedleGuesses: db.prepare("SELECT n, pokemon_id FROM pokedle_guesses WHERE guild_id = ? AND day = ? AND gen_from = ? AND gen_to = ? AND user_id = ? ORDER BY n"),
        pokedleDayGames: db.prepare("SELECT * FROM pokedle_games WHERE guild_id = ? AND day = ? AND gen_from = ? AND gen_to = ?"),
        pokedleUserGames: db.prepare("SELECT * FROM pokedle_games WHERE guild_id = ? AND user_id = ? AND gen_from = ? AND gen_to = ? AND status != 'playing' ORDER BY day"),
        goldAccount: db.prepare("SELECT * FROM gold_accounts WHERE guild_id = ? AND user_id = ?"),
        insertGoldAccount: db.prepare("INSERT OR IGNORE INTO gold_accounts (guild_id, user_id, bank_balance, gold_balance, created_at, updated_at) VALUES (?, ?, 1000, 0, ?, ?)"),
        updateGoldAccount: db.prepare("UPDATE gold_accounts SET bank_balance = ?, gold_balance = ?, updated_at = ? WHERE guild_id = ? AND user_id = ?"),
        insertGoldTransaction: db.prepare("INSERT INTO gold_transactions (id, guild_id, kind, actor_id, created_at, details) VALUES (?, ?, ?, ?, ?, ?)"),
        insertGoldLedger: db.prepare("INSERT INTO gold_ledger (transaction_id, user_id, bank_delta, gold_delta) VALUES (?, ?, ?, ?)"),
        goldTransaction: db.prepare("SELECT * FROM gold_transactions WHERE id = ?"),
        diceBet: db.prepare("SELECT * FROM dice_bets WHERE interaction_id = ?"),
        insertDiceBet: db.prepare("INSERT INTO dice_bets (interaction_id, guild_id, user_id, bet, mode, choice, rolled, payout, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"),
        goldLeaderboard: db.prepare("SELECT user_id, bank_balance, gold_balance, bank_balance + gold_balance AS total FROM gold_accounts WHERE guild_id = ? ORDER BY total DESC, user_id LIMIT ?"),

    };

    function transaction(fn) {
        db.exec("BEGIN IMMEDIATE");
        try {
            const result = fn();
            db.exec("COMMIT");
            return result;
        } catch (error) {
            db.exec("ROLLBACK");
            throw error;
        }
    }

    function ensureGoldAccount(guildId, userId, now) {
        stmts.insertGoldAccount.run(guildId, userId, now, now);
        const row = stmts.goldAccount.get(guildId, userId);
        if (row.created_at === now && row.updated_at === now) {
            const openingId = `opening:${guildId}:${userId}`;
            if (!stmts.goldTransaction.get(openingId)) {
                stmts.insertGoldTransaction.run(openingId, guildId, "opening", userId, now, "Starting bank balance");
                stmts.insertGoldLedger.run(openingId, userId, 1000, 0);
            }
        }
        return row;
    }

    function applyTransaction({ id, guildId, kind, actorId, now, details = "", changes }) {
        stmts.insertGoldTransaction.run(id, guildId, kind, actorId, now, details);
        const results = [];
        for (const change of changes) {
            const account = ensureGoldAccount(guildId, change.userId, now);
            const bankBalance = account.bank_balance + change.bankDelta;
            const goldBalance = account.gold_balance + change.goldDelta;
            if (!Number.isSafeInteger(bankBalance) || !Number.isSafeInteger(goldBalance) || goldBalance < 0) {
                throw new Error("Balance would be outside the supported range.");
            }
            stmts.updateGoldAccount.run(bankBalance, goldBalance, now, guildId, change.userId);
            stmts.insertGoldLedger.run(id, change.userId, change.bankDelta, change.goldDelta);
            results.push(stmts.goldAccount.get(guildId, change.userId));
        }
        return results;
    }

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
        pokedleRange(guildId, userId) {
            return stmts.pokedleRange.get(guildId, userId) || { gen_from: 1, gen_to: 9 };
        },
        setPokedleRange(guildId, userId, genFrom, genTo, now = Date.now()) {
            stmts.setPokedleRange.run(guildId, userId, genFrom, genTo, now);
        },
        pokedleAnswerFor(guildId, day, genFrom, genTo, fallbackPokemonId) {
            stmts.setPokedleAnswer.run(guildId, day, genFrom, genTo, fallbackPokemonId);
            return stmts.pokedleAnswer.get(guildId, day, genFrom, genTo).pokemon_id;
        },
        getPokedleGame(guildId, day, genFrom, genTo, userId) {
            return stmts.pokedleGame.get(guildId, day, genFrom, genTo, userId) || null;
        },
        startPokedleGame(guildId, day, genFrom, genTo, userId, now) {
            stmts.startPokedleGame.run(guildId, day, genFrom, genTo, userId, now);
            return stmts.pokedleGame.get(guildId, day, genFrom, genTo, userId);
        },
        recordPokedleGuess(guildId, day, genFrom, genTo, userId, n, pokemonId, now) {
            stmts.addPokedleGuess.run(guildId, day, genFrom, genTo, userId, n, pokemonId, now);
            stmts.bumpPokedleGuesses.run(guildId, day, genFrom, genTo, userId);
        },
        finishPokedleGame(guildId, day, genFrom, genTo, userId, status, now) {
            stmts.finishPokedleGame.run(status, now, guildId, day, genFrom, genTo, userId);
        },
        pokedleGuesses(guildId, day, genFrom, genTo, userId) {
            return stmts.pokedleGuesses.all(guildId, day, genFrom, genTo, userId);
        },
        pokedleDayGames(guildId, day, genFrom, genTo) {
            return stmts.pokedleDayGames.all(guildId, day, genFrom, genTo);
        },
        pokedleGamesInDays(guildId, days, genFrom, genTo) {
            if (days.length === 0) return [];
            const placeholders = days.map(() => "?").join(",");
            return db.prepare(`SELECT * FROM pokedle_games WHERE guild_id = ? AND gen_from = ? AND gen_to = ? AND status != 'playing' AND day IN (${placeholders})`)
                .all(guildId, genFrom, genTo, ...days);
        },
        allPokedleFinishedGames(guildId, genFrom, genTo) {
            return db.prepare("SELECT * FROM pokedle_games WHERE guild_id = ? AND gen_from = ? AND gen_to = ? AND status != 'playing'")
                .all(guildId, genFrom, genTo);
        },
        pokedleUserGames(guildId, userId, genFrom, genTo) {
            return stmts.pokedleUserGames.all(guildId, userId, genFrom, genTo);
        },
        goldAccount(guildId, userId, now = Date.now()) {
            return transaction(() => ensureGoldAccount(guildId, userId, now));
        },
        goldMove({ id, guildId, kind, actorId, now = Date.now(), details = "", changes }) {
            return transaction(() => applyTransaction({ id, guildId, kind, actorId, now, details, changes }));
        },
        goldTransfer({ id, guildId, actorId, fromId, toId, amount, now = Date.now() }) {
            return transaction(() => {
                const from = ensureGoldAccount(guildId, fromId, now);
                ensureGoldAccount(guildId, toId, now);
                if (from.bank_balance < amount) throw new Error("Not enough in your bank to transfer that much.");
                return applyTransaction({ id, guildId, kind: "transfer", actorId, now, details: `to:${toId}`, changes: [
                    { userId: fromId, bankDelta: -amount, goldDelta: 0 },
                    { userId: toId, bankDelta: amount, goldDelta: 0 },
                ] });
            });
        },
        settleDice({ id, guildId, userId, bet, mode, choice, rolled, payout, now = Date.now() }) {
            return transaction(() => {
                const prior = stmts.diceBet.get(id);
                if (prior) return { prior: true, bet: prior, account: stmts.goldAccount.get(guildId, userId) };
                const account = ensureGoldAccount(guildId, userId, now);
                if (account.gold_balance < bet) throw new Error("Not enough Gold to cover that bet. Use `/gold borrow` first.");
                const won = mode === "exact" ? rolled === choice : rolled !== choice;
                const returned = won ? payout : 0;
                const [updated] = applyTransaction({ id, guildId, kind: "dice", actorId: userId, now, details: `${mode}:${choice};roll:${rolled};bet:${bet};payout:${returned}`, changes: [
                    { userId, bankDelta: 0, goldDelta: returned - bet },
                ] });
                stmts.insertDiceBet.run(id, guildId, userId, bet, mode, choice, rolled, returned, now);
                return { prior: false, won, account: updated, payout: returned };
            });
        },
        goldLeaderboard(guildId, limit = 10) {
            return stmts.goldLeaderboard.all(guildId, limit);
        },
        close() {
            db.close();
        },
    };
}

module.exports = { open };

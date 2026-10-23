const { pokemon, findById, inRange, compare, marks } = require("./pokemon");
const { dayKey, pickIndex } = require("./daily");
const { rankDay, rankPeriod, userStats, solveTime } = require("./game");

function validateRange(genFrom, genTo) {
    if (!Number.isInteger(genFrom) || !Number.isInteger(genTo) || genFrom < 1 || genTo > 9 || genFrom > genTo) {
        throw new RangeError("Generation range must be inclusive and between Gen 1 and Gen 9.");
    }
}

function todaysAnswer(client, guildId, userId) {
    const { gen_from: genFrom, gen_to: genTo } = client.db.pokedleRange(guildId, userId);
    validateRange(genFrom, genTo);
    const day = dayKey(client.config.timezone);
    const pool = pokemon.filter((p) => inRange(p, genFrom, genTo));
    const rangeKey = `${guildId}:pokedle:${genFrom}-${genTo}`;
    const fallback = pool[pickIndex(client.config.seed, rangeKey, day, pool.length)].id;
    const answer = findById(client.db.pokedleAnswerFor(guildId, day, genFrom, genTo, fallback));
    if (!answer || !inRange(answer, genFrom, genTo)) throw new Error("Stored Pokédle answer is not in the selected generation range.");
    return { day, genFrom, genTo, answer };
}

function history(client, guildId, day, genFrom, genTo, userId, answer) {
    return client.db.pokedleGuesses(guildId, day, genFrom, genTo, userId).map((row) => {
        const guess = findById(row.pokemon_id);
        const comparison = compare(guess, answer);
        return { n: row.n, name: guess.name, comparison, marks: marks(comparison) };
    });
}

module.exports = { validateRange, todaysAnswer, history, rankDay, rankPeriod, userStats, solveTime };

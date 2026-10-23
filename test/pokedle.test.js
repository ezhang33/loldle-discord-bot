const test = require("node:test");
const assert = require("node:assert/strict");
const { pokemon, find, findById, inRange, search, compare, marks, generationLabel } = require("../src/pokemon");
const { open } = require("../src/db");
const { todaysAnswer, validateRange } = require("../src/pokedleGame");

test("Pokédle dataset covers canonical species from Gen 1 through Gen 9", () => {
    assert.equal(pokemon.length, 1025);
    assert.equal(find("bulbasaur").generation, 1);
    assert.equal(find("Pecharunt").generation, 9);
    assert.equal(findById(25).name, "Pikachu");
    assert.equal(find("Mr. Mime").name, "Mr. Mime");
});

test("range filtering is inclusive and autocomplete only returns the selected range", () => {
    assert.equal(search("", 1, 1, 200).length, 151);
    assert.ok(search("", 1, 1, 200).every((p) => p.generation === 1));
    assert.deepEqual(search("bulb", 1, 1).map((p) => p.name), ["Bulbasaur"]);
    assert.deepEqual(search("bulba", 2, 9), []);
    assert.equal(generationLabel(1, 1), "Gen I");
    assert.equal(generationLabel(2, 5), "Gen II–V");
    assert.doesNotThrow(() => validateRange(1, 1));
    assert.throws(() => validateRange(5, 4), RangeError);
    assert.throws(() => validateRange(0, 9), RangeError);
    assert.throws(() => validateRange(1, 10), RangeError);
});

test("Pokédle comparison shows exact, partial and directional clues", () => {
    const answer = find("Bulbasaur");
    const guess = find("Ivysaur");
    const clues = compare(guess, answer);
    assert.equal(clues[0].mark, "🟩"); // same generation
    assert.equal(clues[1].mark, "🟩"); // same types
    assert.equal(clues[2].mark, "🟩"); // same color
    assert.equal(clues[5].mark, "⬇️"); // guessed taller; answer is shorter
    assert.equal(marks(clues), clues.map((c) => c.mark).join(""));
});

test("ranges persist per user and answers are pinned per server, date and range", () => {
    const db = open(":memory:");
    assert.deepEqual(db.pokedleRange("g", "u1"), { gen_from: 1, gen_to: 9 });
    db.setPokedleRange("g", "u1", 1, 1, 100);
    db.setPokedleRange("g", "u2", 2, 4, 100);
    assert.deepEqual({ ...db.pokedleRange("g", "u1") }, { gen_from: 1, gen_to: 1 });
    assert.deepEqual({ ...db.pokedleRange("g", "u2") }, { gen_from: 2, gen_to: 4 });
    assert.equal(db.pokedleAnswerFor("g", "2026-10-23", 1, 1, 25), 25);
    assert.equal(db.pokedleAnswerFor("g", "2026-10-23", 1, 1, 1), 25);
    assert.equal(db.pokedleAnswerFor("g", "2026-10-23", 2, 4, 151), 151);
    assert.equal(db.pokedleAnswerFor("other", "2026-10-23", 1, 1, 4), 4);
    db.close();
});

test("same range resolves to the same daily answer for different players", () => {
    const db = open(":memory:");
    db.setPokedleRange("g", "u1", 3, 5, 100);
    db.setPokedleRange("g", "u2", 3, 5, 100);
    const client = { db, config: { timezone: "America/Los_Angeles", seed: "test-seed" } };
    const first = todaysAnswer(client, "g", "u1");
    const second = todaysAnswer(client, "g", "u2");
    assert.equal(first.day, second.day);
    assert.equal(first.answer.id, second.answer.id);
    assert.ok(inRange(first.answer, 3, 5));
    db.close();
});

test("Pokédle games and guesses are isolated by generation range", () => {
    const db = open(":memory:");
    db.startPokedleGame("g", "d", 1, 1, "u", 1);
    db.recordPokedleGuess("g", "d", 1, 1, "u", 1, 25, 2);
    assert.equal(db.getPokedleGame("g", "d", 1, 1, "u").guesses, 1);
    assert.equal(db.getPokedleGame("g", "d", 2, 2, "u"), null);
    assert.deepEqual(db.pokedleGuesses("g", "d", 1, 1, "u").map((g) => g.pokemon_id), [25]);
    assert.equal(db.pokedleDayGames("g", "d", 1, 1).length, 1);
    db.finishPokedleGame("g", "d", 1, 1, "u", "solved", 3);
    assert.equal(db.allPokedleFinishedGames("g", 1, 1).length, 1);
    assert.equal(db.allPokedleFinishedGames("g", 2, 2).length, 0);
    db.close();
});

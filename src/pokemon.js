const raw = require("../pokemonData.json");

const GREEN = "🟩";
const RED = "🟥";
const ORANGE = "🟧";
const UP = "⬆️";
const DOWN = "⬇️";
const generations = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"];

const pokemon = raw.map((p) => ({
    ...p,
    color: p.color || "Unknown",
    habitat: p.habitat || "Unknown",
    shape: p.shape || "Unknown",
}));
const byId = new Map(pokemon.map((p) => [p.id, p]));
const byName = new Map(pokemon.map((p) => [normalize(p.name), p]));

function normalize(value) {
    return String(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

function find(name) {
    return byName.get(normalize(name)) || null;
}

function findById(id) {
    return byId.get(Number(id)) || null;
}

function inRange(p, genFrom, genTo) {
    return p.generation >= genFrom && p.generation <= genTo;
}

function search(query, genFrom = 1, genTo = 9, limit = 25) {
    const q = normalize(query);
    const pool = pokemon.filter((p) => inRange(p, genFrom, genTo));
    if (!q) return pool.slice(0, limit);
    const starts = pool.filter((p) => normalize(p.name).startsWith(q));
    const contains = pool.filter((p) => !normalize(p.name).startsWith(q) && normalize(p.name).includes(q));
    return [...starts, ...contains].slice(0, limit);
}

function compareExact(a, b) {
    return a === b ? GREEN : RED;
}

function compareList(a, b) {
    const left = [...a].sort();
    const right = [...b].sort();
    if (JSON.stringify(left) === JSON.stringify(right)) return GREEN;
    return a.some((x) => b.includes(x)) ? ORANGE : RED;
}

// Up/down indicate the direction from the guess toward the answer.
function compareNumber(guess, answer) {
    if (guess === answer) return GREEN;
    return guess > answer ? DOWN : UP;
}

function formatHeight(decimetres) {
    return `${(decimetres / 10).toLocaleString("en", { maximumFractionDigits: 1 })} m`;
}

function formatWeight(hectograms) {
    return `${(hectograms / 10).toLocaleString("en", { maximumFractionDigits: 1 })} kg`;
}

function compare(guess, answer) {
    return [
        { label: "Generation", value: `Gen ${generations[guess.generation]}`, mark: compareNumber(guess.generation, answer.generation) },
        { label: "Type(s)", value: guess.types.join(", "), mark: compareList(guess.types, answer.types) },
        { label: "Color", value: guess.color, mark: compareExact(guess.color, answer.color) },
        { label: "Habitat", value: guess.habitat, mark: compareExact(guess.habitat, answer.habitat) },
        { label: "Shape", value: guess.shape, mark: compareExact(guess.shape, answer.shape) },
        { label: "Height", value: formatHeight(guess.height), mark: compareNumber(guess.height, answer.height) },
        { label: "Weight", value: formatWeight(guess.weight), mark: compareNumber(guess.weight, answer.weight) },
        { label: "Legendary / Mythical", value: guess.mythical ? "Mythical" : guess.legendary ? "Legendary" : "Neither", mark: compareExact(`${guess.legendary}:${guess.mythical}`, `${answer.legendary}:${answer.mythical}`) },
    ];
}

function marks(comparison) {
    return comparison.map((item) => item.mark).join("");
}

function generationLabel(from, to) {
    return from === to ? `Gen ${generations[from]}` : `Gen ${generations[from]}–${generations[to]}`;
}

const LEGEND = "Generation · Type · Color · Habitat · Shape · Height · Weight · Legendary/Mythical";

module.exports = {
    pokemon,
    find,
    findById,
    inRange,
    search,
    compare,
    marks,
    generationLabel,
    generations,
    LEGEND,
    GREEN,
    RED,
    ORANGE,
    UP,
    DOWN,
};

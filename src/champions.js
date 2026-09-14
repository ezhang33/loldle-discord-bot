const raw = require("../championData.json");

const GREEN = "🟩";
const RED = "🟥";
const ORANGE = "🟧";
const UP = "⬆️";
const DOWN = "⬇️";

const GENDER_LABEL = { F: "Female", M: "Male", X: "Other" };

const champions = raw
    .map((c) => ({
        name: c.championName,
        gender: c.gender,
        positions: c.positions,
        species: c.species,
        resource: c.resource,
        rangeType: c.range_type,
        regions: c.regions,
        releaseYear: new Date(c.release_date).getUTCFullYear(),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

const byLowerName = new Map(champions.map((c) => [c.name.toLowerCase(), c]));

function find(name) {
    return byLowerName.get(String(name).trim().toLowerCase()) || null;
}

// Prefix matches first, then substring matches. Discord allows 25 choices.
function search(query, limit = 25) {
    const q = String(query).trim().toLowerCase();
    if (!q) return champions.slice(0, limit);
    const starts = champions.filter((c) => c.name.toLowerCase().startsWith(q));
    const contains = champions.filter(
        (c) => !c.name.toLowerCase().startsWith(q) && c.name.toLowerCase().includes(q)
    );
    return [...starts, ...contains].slice(0, limit);
}

function compareExact(a, b) {
    return a === b ? GREEN : RED;
}

function compareList(a, b) {
    const sortedA = [...a].sort();
    const sortedB = [...b].sort();
    if (JSON.stringify(sortedA) === JSON.stringify(sortedB)) return GREEN;
    return a.some((x) => b.includes(x)) ? ORANGE : RED;
}

function compareYear(a, b) {
    if (a === b) return GREEN;
    return a > b ? DOWN : UP;
}

// Per-attribute feedback for `guess` against `answer`, in LoLdle column order.
function compare(guess, answer) {
    return [
        { label: "Gender", value: GENDER_LABEL[guess.gender] || guess.gender, mark: compareExact(guess.gender, answer.gender) },
        { label: "Position(s)", value: guess.positions.join(", "), mark: compareList(guess.positions, answer.positions) },
        { label: "Species", value: guess.species.join(", "), mark: compareList(guess.species, answer.species) },
        { label: "Resource", value: guess.resource, mark: compareExact(guess.resource, answer.resource) },
        { label: "Range type", value: guess.rangeType.join(", "), mark: compareList(guess.rangeType, answer.rangeType) },
        { label: "Region(s)", value: guess.regions.join(", "), mark: compareList(guess.regions, answer.regions) },
        { label: "Release year", value: String(guess.releaseYear), mark: compareYear(guess.releaseYear, answer.releaseYear) },
    ];
}

// Compact one-line summary of a comparison, e.g. 🟥🟧🟩🟩🟥🟥⬆️
function marks(comparison) {
    return comparison.map((c) => c.mark).join("");
}

const LEGEND = "Gender · Position · Species · Resource · Range · Region · Year";

module.exports = { champions, find, search, compare, marks, LEGEND, GREEN, RED, ORANGE, UP, DOWN };

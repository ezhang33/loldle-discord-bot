const { randomInt } = require("node:crypto");

// Fair gross payouts include the returned stake. Bets must be multiples of 5
// so the 6/5 avoid payout is always an exact whole number of Gold.
function payoutFor(bet, mode) {
    if (!Number.isSafeInteger(bet) || bet <= 0) throw new RangeError("bet must be a positive safe integer");
    if (bet % 5 !== 0) throw new RangeError("bet must be a multiple of 5");
    if (mode === "exact") return bet * 6;
    if (mode === "avoid") return (bet * 6) / 5;
    throw new RangeError("unknown dice mode");
}

function rollDie() {
    return randomInt(1, 7);
}

module.exports = { payoutFor, rollDie };

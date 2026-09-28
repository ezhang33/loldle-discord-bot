const { randomInt } = require("node:crypto");

// Fair gross payouts include the returned stake. Bets must be multiples of 5
// so the 6/5 avoid payout is always an exact whole number of Gold.
function payoutFor(bet, mode) {
    if (!Number.isSafeInteger(bet) || bet < 0) throw new RangeError("bet must be a non-negative safe integer");
    if (bet % 5 !== 0) throw new RangeError("bet must be a multiple of 5");
    const payout = mode === "exact" ? bet * 6 : mode === "avoid" ? (bet * 6) / 5 : null;
    if (payout === null) throw new RangeError("unknown dice mode");
    if (!Number.isSafeInteger(payout)) throw new RangeError("bet is above the safe payout range");
    return payout;
}

function rollDie() {
    return randomInt(1, 7);
}

module.exports = { payoutFor, rollDie };

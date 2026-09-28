const test = require("node:test");
const assert = require("node:assert/strict");
const { payoutFor } = require("../src/economy");
const { open } = require("../src/db");

test("dice payouts are fair for both choices and include the returned stake", () => {
    assert.equal(payoutFor(0, "exact"), 0);
    assert.equal(payoutFor(0, "avoid"), 0);
    assert.equal(payoutFor(100, "exact"), 600);
    assert.equal(payoutFor(100, "avoid"), 120);
    assert.equal(payoutFor(10, "avoid"), 12);
    assert.equal((payoutFor(100, "exact") - 100) / 6 - (5 * 100) / 6, 0);
    assert.equal((5 * (payoutFor(100, "avoid") - 100)) / 6 - 100 / 6, 0);
    assert.throws(() => payoutFor(-5, "exact"), RangeError);
    assert.throws(() => payoutFor(12, "avoid"), /multiple of 5/);
    assert.throws(() => payoutFor(Number.MAX_SAFE_INTEGER - 1, "exact"), /safe payout range/);
    assert.throws(() => payoutFor(100, "unknown"), RangeError);
});

test("Gold accounts start once and borrowing has no account-level cap", () => {
    const db = open(":memory:");
    assert.deepEqual(
        (({ bank_balance, gold_balance }) => [bank_balance, gold_balance])(db.goldAccount("g", "u", 100)),
        [1000, 0]
    );
    db.goldMove({
        id: "borrow-1", guildId: "g", kind: "borrow", actorId: "u", now: 101,
        changes: [{ userId: "u", bankDelta: -100, goldDelta: 100 }],
    });
    db.goldMove({
        id: "borrow-2", guildId: "g", kind: "borrow", actorId: "u", now: 102,
        changes: [{ userId: "u", bankDelta: -2000, goldDelta: 2000 }],
    });
    const account = db.goldAccount("g", "u", 103);
    assert.equal(account.bank_balance, -1100);
    assert.equal(account.gold_balance, 2100);
    db.close();
});

test("Bank transfers are atomic and do not let a player transfer borrowed funds", () => {
    const db = open(":memory:");
    db.goldAccount("g", "a", 100);
    const [from, to] = db.goldTransfer({
        id: "transfer-1", guildId: "g", actorId: "a", fromId: "a", toId: "b", amount: 250, now: 200,
    });
    assert.equal(from.bank_balance, 750);
    assert.equal(to.bank_balance, 1250);
    db.goldMove({
        id: "borrow", guildId: "g", kind: "borrow", actorId: "a", now: 201,
        changes: [{ userId: "a", bankDelta: -1000, goldDelta: 1000 }],
    });
    assert.throws(
        () => db.goldTransfer({ id: "transfer-2", guildId: "g", actorId: "a", fromId: "a", toId: "b", amount: 1, now: 202 }),
        /Not enough in your bank/
    );
    db.close();
});

test("cashout and dice settlement update Gold and Bank and record one bet", () => {
    const db = open(":memory:");
    db.goldAccount("g", "u", 1);
    db.goldMove({
        id: "borrow", guildId: "g", kind: "borrow", actorId: "u", now: 2,
        changes: [{ userId: "u", bankDelta: -100, goldDelta: 100 }],
    });
    const settled = db.settleDice({
        id: "bet-1", guildId: "g", userId: "u", bet: 100, mode: "exact", choice: 4, rolled: 4, payout: 600, now: 3,
    });
    assert.equal(settled.won, true);
    assert.equal(settled.account.gold_balance, 600);
    const duplicate = db.settleDice({
        id: "bet-1", guildId: "g", userId: "u", bet: 100, mode: "exact", choice: 4, rolled: 1, payout: 600, now: 4,
    });
    assert.equal(duplicate.prior, true);
    const [account] = db.goldMove({
        id: "cashout", guildId: "g", kind: "cashout", actorId: "u", now: 5,
        changes: [{ userId: "u", bankDelta: 600, goldDelta: -600 }],
    });
    assert.equal(account.bank_balance, 1500);
    assert.equal(account.gold_balance, 0);
    assert.throws(
        () => db.settleDice({ id: "bet-2", guildId: "g", userId: "u", bet: 10, mode: "avoid", choice: 1, rolled: 1, payout: 11, now: 6 }),
        /Not enough Gold/
    );
    db.close();
});

test("owner adjustment can increase or decrease Bank below zero", () => {
    const db = open(":memory:");
    db.goldMove({
        id: "adjust-1", guildId: "g", kind: "owner_adjustment", actorId: "owner", now: 1,
        changes: [{ userId: "u", bankDelta: -2000, goldDelta: 0 }],
    });
    db.goldMove({
        id: "adjust-2", guildId: "g", kind: "owner_adjustment", actorId: "owner", now: 2,
        changes: [{ userId: "u", bankDelta: 50, goldDelta: 0 }],
    });
    assert.equal(db.goldAccount("g", "u", 3).bank_balance, -950);
    db.close();
});

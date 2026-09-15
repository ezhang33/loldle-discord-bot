// In-memory rate limits for the chatbot: a per-user sliding window and a
// global daily cap so a runaway conversation can't burn through the LLM
// budget. State is lost on restart, which is fine — it's a brake, not a ledger.
class ChatLimits {
    constructor({ perUserPerMinute, dailyCap }) {
        this.perUserPerMinute = perUserPerMinute;
        this.dailyCap = dailyCap;
        this.userHits = new Map(); // userId -> timestamps (ms) within the last minute
        this.day = null;
        this.dayCount = 0;
    }

    /** Returns null if allowed (and records the hit), otherwise the reason. */
    check(userId, day, now = Date.now()) {
        if (day !== this.day) {
            this.day = day;
            this.dayCount = 0;
        }
        if (this.dayCount >= this.dailyCap) return "daily";

        const hits = (this.userHits.get(userId) || []).filter((t) => now - t < 60_000);
        if (hits.length >= this.perUserPerMinute) {
            this.userHits.set(userId, hits);
            return "user";
        }
        hits.push(now);
        this.userHits.set(userId, hits);
        this.dayCount++;
        return null;
    }
}

module.exports = { ChatLimits };

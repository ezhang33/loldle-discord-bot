const crypto = require("node:crypto");

// Calendar date (YYYY-MM-DD) in the given time zone. One puzzle per day key.
function dayKey(timezone, date = new Date()) {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(date);
}

// Previous calendar date of a YYYY-MM-DD string (pure date arithmetic).
function previousDay(day) {
    const d = new Date(`${day}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
}

// The last `count` day keys, most recent first (today included).
function recentDays(timezone, count, now = new Date()) {
    const days = [dayKey(timezone, now)];
    while (days.length < count) days.push(previousDay(days[days.length - 1]));
    return days;
}

// Milliseconds until the day key changes (i.e. until the next puzzle).
function msUntilNextDay(timezone, now = new Date()) {
    const today = dayKey(timezone, now);
    let lo = now.getTime();
    let hi = lo + 36 * 60 * 60 * 1000;
    while (hi - lo > 1000) {
        const mid = Math.floor((lo + hi) / 2);
        if (dayKey(timezone, new Date(mid)) === today) lo = mid;
        else hi = mid;
    }
    return hi - now.getTime();
}

// Deterministic champion index for a (guild, day) pair.
function pickIndex(seed, guildId, day, count) {
    const hash = crypto.createHash("sha256").update(`${seed}:${guildId}:${day}`).digest();
    return hash.readUInt32BE(0) % count;
}

function formatDuration(ms) {
    const totalSeconds = Math.max(0, Math.round(ms / 1000));
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}

module.exports = { dayKey, previousDay, recentDays, msUntilNextDay, pickIndex, formatDuration };

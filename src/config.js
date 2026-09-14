const fs = require("node:fs");
const path = require("node:path");

const envPath = path.resolve(process.cwd(), ".env");
if (fs.existsSync(envPath)) process.loadEnvFile(envPath);

function required(name) {
    const value = process.env[name];
    if (!value) {
        console.error(`Missing required environment variable ${name} (see .env.example)`);
        process.exit(1);
    }
    return value;
}

module.exports = {
    token: required("DISCORD_TOKEN"),
    clientId: required("CLIENT_ID"),
    guildId: process.env.GUILD_ID || null,
    timezone: process.env.TIMEZONE || "America/New_York",
    dbPath: process.env.DB_PATH || path.resolve(process.cwd(), "data", "loldle.sqlite"),
    seed: process.env.DAILY_SEED || "loldle-discord-bot",
};

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
    timezone: process.env.TIMEZONE || "America/Los_Angeles",
    dbPath: process.env.DB_PATH || path.resolve(process.cwd(), "data", "loldle.sqlite"),
    seed: process.env.DAILY_SEED || "loldle-discord-bot",
    ownerId: process.env.OWNER_ID || null,
    // The @mention chatbot. Disabled unless CHAT_API_KEY is set.
    chat: process.env.CHAT_API_KEY
        ? {
              apiUrl: process.env.CHAT_API_URL || "https://models.relace.ai/v1/chat/completions",
              apiKey: process.env.CHAT_API_KEY,
              model: process.env.CHAT_MODEL || "z-ai/glm-5.3-flash",
              name: process.env.CHAT_NAME || "Faker",
              images: (process.env.CHAT_IMAGES || "true") !== "false",
              reasoningEffort: process.env.CHAT_REASONING_EFFORT ?? "low",
              contextMessages: Number(process.env.CHAT_CONTEXT_MESSAGES) || 12,
              perUserPerMinute: Number(process.env.CHAT_USER_PER_MINUTE) || 5,
              dailyCap: Number(process.env.CHAT_DAILY_CAP) || 500,
          }
        : null,
};

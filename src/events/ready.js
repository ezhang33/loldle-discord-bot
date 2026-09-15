const { Events } = require("discord.js");

module.exports = {
    name: Events.ClientReady,
    once: true,
    async execute(client) {
        console.log(`Logged in as ${client.user.tag}`);
        const body = [...client.commands.values()].map((c) => c.data.toJSON());
        try {
            if (client.config.guildId) {
                await client.application.commands.set(body, client.config.guildId);
                console.log(`Registered ${body.length} slash commands in guild ${client.config.guildId}`);
            } else {
                await client.application.commands.set(body);
                console.log(`Registered ${body.length} global slash commands (may take up to an hour to appear)`);
            }
        } catch (error) {
            console.error("Failed to register slash commands:", error);
        }
        console.log(`Daily puzzle rolls over at midnight ${client.config.timezone}; database at ${client.config.dbPath}`);
        const chat = client.config.chat;
        console.log(
            chat
                ? `Chatbot "${chat.name}" enabled: ${chat.model} via ${chat.apiUrl}${chat.images ? " (images on)" : ""}`
                : "Chatbot disabled (set CHAT_API_KEY to enable)"
        );
    },
};

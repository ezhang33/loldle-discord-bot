const { Events } = require("discord.js");
const { REVEAL_EMOJI, revealLine } = require("../commands/neeko");

// React 🦎 to a /neeko message and the bot unmasks who really sent it, once.
module.exports = {
    name: Events.MessageReactionAdd,
    // discord.js emits (reaction, user, details), so take the client from the reaction.
    async execute(reaction, user) {
        const client = reaction.client;
        if (user.bot || reaction.emoji.name !== REVEAL_EMOJI) return;
        const row = client.db.neekoByMessage(reaction.message.id);
        if (!row || row.revealed_at) return;

        client.db.markNeekoRevealed(row.message_id, Date.now());
        try {
            const message = reaction.message.partial ? await reaction.message.fetch() : reaction.message;
            await message.reply({ content: revealLine(row), allowedMentions: { parse: [] } });
            console.log(`/neeko reveal by ${user.username} on ${row.message_id}`);
        } catch (error) {
            console.warn("neeko reveal failed:", error.message);
        }
    },
};

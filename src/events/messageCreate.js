const { Events } = require("discord.js");
const { dayKey } = require("../daily");
const { systemPrompt } = require("../chat/persona");
const { buildMessages } = require("../chat/context");
const { complete, ChatProviderError } = require("../chat/provider");
const { ChatLimits } = require("../chat/limits");

let limits = null;

/** Is this message addressed to the bot: an @mention, or a reply to it? */
async function isAddressedToBot(message, botUserId) {
    if (message.mentions.users.has(botUserId) && !message.mentions.everyone) return true;
    if (message.reference?.messageId) {
        const parent = await message.fetchReference().catch(() => null);
        if (parent?.author?.id === botUserId) return true;
    }
    return false;
}

function chunk(text, size = 2000) {
    const parts = [];
    let rest = text;
    while (rest.length > size) {
        let cut = rest.lastIndexOf("\n", size);
        if (cut < size / 2) cut = rest.lastIndexOf(" ", size);
        if (cut < size / 2) cut = size;
        parts.push(rest.slice(0, cut));
        rest = rest.slice(cut).trimStart();
    }
    if (rest) parts.push(rest);
    return parts;
}

module.exports = {
    name: Events.MessageCreate,
    async execute(message, client) {
        const chat = client.config.chat;
        if (!chat || !message.inGuild() || message.author.bot || message.system) return;
        const botUserId = client.user.id;
        if (!(await isAddressedToBot(message, botUserId))) return;

        limits ??= new ChatLimits(chat);
        const blocked = limits.check(message.author.id, dayKey(client.config.timezone));
        if (blocked === "user") {
            await message.react("⏳").catch(() => {});
            return;
        }
        if (blocked === "daily") {
            await message.reply({ content: "I'm done talking for today. Scrims tomorrow.", allowedMentions: { parse: [] } }).catch(() => {});
            return;
        }

        const typing = setInterval(() => message.channel.sendTyping().catch(() => {}), 8000);
        message.channel.sendTyping().catch(() => {});
        try {
            const before = await message.channel.messages
                .fetch({ limit: chat.contextMessages, before: message.id })
                .catch(() => new Map());
            const history = [...before.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
            history.push(message);

            // Images only from the message that pinged us and the one it replies to.
            const imageMessageIds = new Set([message.id]);
            if (message.reference?.messageId) imageMessageIds.add(message.reference.messageId);

            const messages = [
                {
                    role: "system",
                    content: systemPrompt({ name: chat.name, guildName: message.guild.name, canSeeImages: chat.images }),
                },
                ...buildMessages(history, { botUserId, botName: chat.name, images: chat.images, imageMessageIds }),
            ];

            const started = Date.now();
            const { text, usage } = await complete(chat, messages);
            console.log(
                `chat: ${message.author.username} in #${message.channel.name} -> ${text.length} chars, ` +
                    `${usage?.prompt_tokens ?? "?"}+${usage?.completion_tokens ?? "?"} tok, ${Date.now() - started}ms`
            );

            const parts = chunk(text || "...");
            await message.reply({ content: parts[0], allowedMentions: { repliedUser: true, parse: [] } });
            for (const part of parts.slice(1)) {
                await message.channel.send({ content: part, allowedMentions: { parse: [] } });
            }
        } catch (error) {
            if (error instanceof ChatProviderError && error.rateLimited) {
                console.warn("chat: provider rate-limited");
                await message.reply({ content: "Give me a second, too many people talking at once.", allowedMentions: { parse: [] } }).catch(() => {});
            } else {
                console.error("chat failed:", error);
                await message.react("❌").catch(() => {});
            }
        } finally {
            clearInterval(typing);
        }
    },
};

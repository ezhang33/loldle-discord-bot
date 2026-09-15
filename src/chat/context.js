// Turns recent Discord messages into an OpenAI-style message list.

const MAX_IMAGES = 4;
const MAX_TEXT_PER_MESSAGE = 1500;

function isImage(attachment) {
    return typeof attachment.contentType === "string" && attachment.contentType.startsWith("image/");
}

/** Message text with <@id> mentions of known users rendered as @Name. */
function renderText(message, botUserId, botName) {
    let text = message.content || "";
    text = text.replace(/<@!?(\d+)>/g, (tag, id) => {
        if (id === botUserId) return `@${botName}`;
        const user = message.mentions?.users?.get(id);
        return user ? `@${user.displayName ?? user.username}` : tag;
    });
    if (!text && message.attachments?.size) text = "(sent an attachment)";
    if (!text && message.embeds?.length) text = "(sent an embed)";
    if (!text && message.stickers?.size) text = "(sent a sticker)";
    return text.slice(0, MAX_TEXT_PER_MESSAGE);
}

/**
 * @param history  oldest-first array of discord.js Messages ending with the trigger
 * @param opts     { botUserId, botName, images: bool, imageMessageIds: Set<string> }
 */
function buildMessages(history, { botUserId, botName, images, imageMessageIds = new Set() }) {
    const out = [];
    let imagesLeft = images ? MAX_IMAGES : 0;

    for (const m of history) {
        const fromBot = m.author?.id === botUserId;
        const text = renderText(m, botUserId, botName);
        if (fromBot) {
            if (text) out.push({ role: "assistant", content: text });
            continue;
        }
        const author = m.member?.displayName ?? m.author?.displayName ?? m.author?.username ?? "someone";
        const line = `${author} (<@${m.author?.id}>): ${text}`;

        const attachImages =
            imagesLeft > 0 && imageMessageIds.has(m.id)
                ? [...(m.attachments?.values?.() ?? [])].filter(isImage).slice(0, imagesLeft)
                : [];
        if (attachImages.length === 0) {
            out.push({ role: "user", content: line });
            continue;
        }
        imagesLeft -= attachImages.length;
        out.push({
            role: "user",
            content: [
                { type: "text", text: line },
                ...attachImages.map((a) => ({ type: "image_url", image_url: { url: a.url } })),
            ],
        });
    }
    return out;
}

module.exports = { buildMessages, renderText, isImage };

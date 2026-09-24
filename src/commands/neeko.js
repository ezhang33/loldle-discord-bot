const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits, ChannelType } = require("discord.js");

// /neeko — post a message that looks like it came from another member, via a
// channel webhook (Discord shows the member's name/avatar plus an APP badge).
// Open to everyone, with a per-user cooldown and a full audit log.

const WEBHOOK_NAME = "Neeko";
const MAX_PER_HOUR = 3;
const MAX_LENGTH = 500;

async function getWebhook(channel, client) {
    // Threads post through their parent channel's webhook.
    const host = channel.isThread() ? channel.parent : channel;
    const hooks = await host.fetchWebhooks();
    const own = hooks.find((h) => h.owner?.id === client.user.id && h.name === WEBHOOK_NAME);
    return own ?? host.createWebhook({ name: WEBHOOK_NAME, reason: "/neeko impersonation" });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("neeko")
        .setDescription("Shapeshift: post a message as another member")
        .addSubcommand((sub) =>
            sub
                .setName("as")
                .setDescription("Post a message as someone else")
                .addUserOption((o) => o.setName("user").setDescription("Who to impersonate").setRequired(true))
                .addStringOption((o) =>
                    o.setName("message").setDescription("What they 'said'").setRequired(true).setMaxLength(MAX_LENGTH)
                )
        )
        .addSubcommand((sub) => sub.setName("undo").setDescription("Delete your most recent /neeko message"))
        .addSubcommand((sub) =>
            sub
                .setName("reveal")
                .setDescription("Who really sent a /neeko message?")
                .addStringOption((o) => o.setName("message_id").setDescription("Right-click the message > Copy Message ID").setRequired(true))
        )
        .addSubcommand((sub) => sub.setName("log").setDescription("Owner only: recent /neeko activity")),

    async execute(interaction, client) {
        const sub = interaction.options.getSubcommand();
        if (sub === "as") return post(interaction, client);
        if (sub === "undo") return undo(interaction, client);
        if (sub === "reveal") return reveal(interaction, client);
        if (sub === "log") return log(interaction, client);
    },
};

async function post(interaction, client) {
    const guildId = interaction.guildId;
    const actor = interaction.user;
    const target = interaction.options.getMember("user");
    const raw = interaction.options.getString("message");
    const channel = interaction.channel;

    const ephemeral = (content) => interaction.reply({ content, flags: MessageFlags.Ephemeral });

    if (!target) return ephemeral("I can't find that member in this server.");
    if (target.user.bot) return ephemeral("Neeko doesn't imitate bots. Only people.");
    if (target.id === actor.id) return ephemeral("That's just... talking. Pick someone else.");
    if (![ChannelType.GuildText, ChannelType.PublicThread, ChannelType.PrivateThread].includes(channel.type)) {
        return ephemeral("Neeko can only shapeshift in text channels and threads.");
    }

    const me = interaction.guild.members.me;
    const host = channel.isThread() ? channel.parent : channel;
    if (!host.permissionsFor(me)?.has(PermissionFlagsBits.ManageWebhooks)) {
        return ephemeral("I need the **Manage Webhooks** permission in this channel to do that.");
    }

    // No mass pings or pinging third parties through someone else's face.
    if (/@(everyone|here)/.test(raw) || /<@[!&]?\d+>/.test(raw)) {
        return ephemeral("No pings while shapeshifted. Plain text only.");
    }

    const now = Date.now();
    const used = client.db.neekoCountSince(guildId, actor.id, now - 3_600_000);
    if (used >= MAX_PER_HOUR) {
        return ephemeral(`Neeko is tired. You've shapeshifted ${MAX_PER_HOUR} times this hour; try again later.`);
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
        const webhook = await getWebhook(channel, client);
        const sent = await webhook.send({
            content: raw,
            username: target.displayName,
            avatarURL: target.displayAvatarURL({ size: 256, extension: "png" }),
            threadId: channel.isThread() ? channel.id : undefined,
            allowedMentions: { parse: [] },
        });
        client.db.logNeeko({
            messageId: sent.id,
            guildId,
            channelId: channel.id,
            webhookId: webhook.id,
            actorId: actor.id,
            targetId: target.id,
            content: raw,
            createdAt: now,
        });
        console.log(`/neeko by ${actor.username} as ${target.user.username} in #${channel.name}: ${raw}`);
        await interaction.editReply(`Shapeshifted. (${MAX_PER_HOUR - used - 1} left this hour · \`/neeko undo\` to take it back)`);
    } catch (error) {
        console.error("/neeko failed:", error);
        await interaction.editReply("The disguise slipped. Couldn't post that.");
    }
}

async function undo(interaction, client) {
    const row = client.db.neekoLastByActor(interaction.guildId, interaction.user.id);
    if (!row) return interaction.reply({ content: "You have nothing to undo.", flags: MessageFlags.Ephemeral });
    try {
        const channel = await client.channels.fetch(row.channel_id);
        const webhook = await getWebhook(channel, client);
        await webhook.deleteMessage(row.message_id, channel.isThread() ? channel.id : undefined);
    } catch (error) {
        // Already deleted (or webhook gone) — drop the log row either way.
        if (error?.code !== 10008) console.warn("/neeko undo:", error.message);
    }
    client.db.deleteNeeko(row.message_id);
    await interaction.reply({ content: "Poof. Message deleted.", flags: MessageFlags.Ephemeral });
}

async function reveal(interaction, client) {
    const id = interaction.options.getString("message_id").trim();
    const row = /^\d{17,20}$/.test(id) ? client.db.neekoByMessage(id) : null;
    if (!row) {
        return interaction.reply({ content: "That isn't a /neeko message (or it was undone).", flags: MessageFlags.Ephemeral });
    }
    await interaction.reply({
        content: `That was <@${row.actor_id}> wearing <@${row.target_id}>'s face.`,
        allowedMentions: { parse: [] },
    });
}

async function log(interaction, client) {
    if (!client.config.ownerId || interaction.user.id !== client.config.ownerId) {
        return interaction.reply({ content: "Owner only.", flags: MessageFlags.Ephemeral });
    }
    const rows = client.db.neekoRecent(interaction.guildId, 15);
    if (rows.length === 0) return interaction.reply({ content: "No /neeko activity yet.", flags: MessageFlags.Ephemeral });
    const lines = rows.map(
        (r) => `<t:${Math.floor(r.created_at / 1000)}:R> <@${r.actor_id}> as <@${r.target_id}> in <#${r.channel_id}>: ${r.content.slice(0, 80)}`
    );
    await interaction.reply({ content: lines.join("\n").slice(0, 1990), flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
}

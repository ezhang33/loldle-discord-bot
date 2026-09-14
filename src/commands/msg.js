const { SlashCommandBuilder, ChannelType, MessageFlags, PermissionFlagsBits } = require("discord.js");

// Owner-only: send a message as the bot. Hidden from everyone else's command
// list via default member permissions, and hard-checked against OWNER_ID.
module.exports = {
    data: new SlashCommandBuilder()
        .setName("msg")
        .setDescription("Send a message as the bot (owner only)")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption((option) => option.setName("message").setDescription("What to say").setRequired(true))
        .addChannelOption((option) =>
            option
                .setName("channel")
                .setDescription("Where to send it (default: this channel)")
                .addChannelTypes(
                    ChannelType.GuildText,
                    ChannelType.GuildAnnouncement,
                    ChannelType.PublicThread,
                    ChannelType.PrivateThread
                )
        ),

    async execute(interaction, client) {
        if (!client.config.ownerId || interaction.user.id !== client.config.ownerId) {
            await interaction.reply({ content: "❌ Only the bot owner can use this.", flags: MessageFlags.Ephemeral });
            return;
        }

        const message = interaction.options.getString("message");
        const target = interaction.options.getChannel("channel") || interaction.channel;

        const canSend = target.permissionsFor(interaction.guild.members.me)?.has(PermissionFlagsBits.SendMessages);
        if (!canSend) {
            await interaction.reply({
                content: `❌ I don't have permission to send messages in ${target}.`,
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        await target.send(message);
        await interaction.reply({
            content: target.id === interaction.channelId ? "✅ Sent." : `✅ Sent to ${target}.`,
            flags: MessageFlags.Ephemeral,
        });
        console.log(`/msg by ${interaction.user.username} in ${interaction.guild.name} → #${target.name}: ${message}`);
    },
};

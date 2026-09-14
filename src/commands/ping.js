const { SlashCommandBuilder, MessageFlags } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder().setName("ping").setDescription("Check that the bot is alive"),

    async execute(interaction, client) {
        const sent = await interaction.reply({ content: "Pinging…", flags: MessageFlags.Ephemeral, withResponse: true });
        const roundTrip = sent.resource.message.createdTimestamp - interaction.createdTimestamp;
        await interaction.editReply(`Pong! Round trip ${roundTrip}ms · gateway ${Math.round(client.ws.ping)}ms`);
    },
};

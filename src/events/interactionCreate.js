const { Events, MessageFlags } = require("discord.js");

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction, client) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;

        if (interaction.isAutocomplete()) {
            try {
                await command.autocomplete(interaction, client);
            } catch (error) {
                console.error(`Autocomplete for /${interaction.commandName} failed:`, error);
            }
            return;
        }

        if (!interaction.isChatInputCommand()) return;

        if (!interaction.inGuild()) {
            await interaction.reply({ content: "LoLdle only works inside a server.", flags: MessageFlags.Ephemeral });
            return;
        }

        try {
            await command.execute(interaction, client);
        } catch (error) {
            console.error(`/${interaction.commandName} failed:`, error);
            const payload = { content: "Something went wrong running that command.", flags: MessageFlags.Ephemeral };
            if (interaction.replied || interaction.deferred) await interaction.followUp(payload).catch(() => {});
            else await interaction.reply(payload).catch(() => {});
        }
    },
};

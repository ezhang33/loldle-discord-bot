const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const { payoutFor, rollDie } = require("../economy");

const MIN_BET = 0;

module.exports = {
    data: new SlashCommandBuilder()
        .setName("dice")
        .setDescription("Bet playable Gold on a six-sided die")
        .addIntegerOption((o) => o.setName("bet").setDescription("Gold to wager").setRequired(true).setMinValue(MIN_BET))
        .addStringOption((o) => o.setName("mode").setDescription("Choose an exact roll or a number to avoid").setRequired(true)
            .addChoices({ name: "Exact number (1 in 6; 6x total payout)", value: "exact" }, { name: "Avoid this number (5 in 6; 1.2x total payout)", value: "avoid" }))
        .addIntegerOption((o) => o.setName("number").setDescription("Pick a number from 1 to 6").setRequired(true).setMinValue(1).setMaxValue(6)),

    async execute(interaction, client) {
        const bet = interaction.options.getInteger("bet");
        const mode = interaction.options.getString("mode");
        const choice = interaction.options.getInteger("number");
        if (bet % 5 !== 0) {
            await interaction.reply({ content: "For fair payouts, bets must be in multiples of 5 Gold.", flags: MessageFlags.Ephemeral });
            return;
        }
        const rolled = rollDie();
        let result;
        try {
            result = client.db.settleDice({
                id: interaction.id,
                guildId: interaction.guildId,
                userId: interaction.user.id,
                bet,
                mode,
                choice,
                rolled,
                payout: payoutFor(bet, mode),
                now: Date.now(),
            });
        } catch (error) {
            await interaction.reply({ content: error.message, flags: MessageFlags.Ephemeral });
            return;
        }

        if (result.prior) {
            await interaction.reply({ content: "That dice bet was already settled.", flags: MessageFlags.Ephemeral });
            return;
        }
        const won = result.won;
        const net = result.payout - bet;
        const explanation = bet === 0
            ? "Free roll; no Gold wagered."
            : won
              ? `Won **${result.payout.toLocaleString()} Gold total** (net +${net.toLocaleString()}).`
              : `Lost **${bet.toLocaleString()} Gold**.`;
        await interaction.reply({
            content: `**${interaction.member.displayName}** ${bet === 0 ? "rolled" : `bet ${bet.toLocaleString()} Gold to ${mode === "exact" ? "roll" : "avoid"}`} **${choice}**. Die: **${rolled}**. ${explanation}\nPlayable Gold: **${result.account.gold_balance.toLocaleString()}**.`,
            allowedMentions: { parse: [] },
        });
    },
};

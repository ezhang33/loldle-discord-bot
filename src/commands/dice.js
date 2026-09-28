const { SlashCommandBuilder, MessageFlags, EmbedBuilder } = require("discord.js");
const { payoutFor, rollDie } = require("../economy");

const MIN_BET = 0;
const DIE_FACES = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣"];

module.exports = {
    data: new SlashCommandBuilder()
        .setName("dice")
        .setDescription("Guess a die result and wager playable Gold")
        .addIntegerOption((o) => o.setName("bet").setDescription("Gold to wager").setRequired(true).setMinValue(MIN_BET))
        .addStringOption((o) => o.setName("mode").setDescription("Guess exactly or pick a number to avoid").setRequired(true)
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

        const net = result.payout - bet;
        const guess = mode === "exact" ? `to guess **${choice}**` : `to guess it won't be **${choice}**`;
        const outcome = bet === 0
            ? "⚪ Free roll — no Gold wagered."
            : result.won
              ? `🟢 Won **${net.toLocaleString()} Gold** profit (${result.payout.toLocaleString()} returned including stake).`
              : `🔴 Lost **${bet.toLocaleString()} Gold**.`;
        const color = bet === 0 ? 0x808080 : result.won ? 0x2ecc71 : 0xe74c3c;
        const embed = new EmbedBuilder()
            .setColor(color)
            .setDescription(
                `🎲 **${interaction.member.displayName}** bet ${bet.toLocaleString()} Gold ${guess}. Die: ${DIE_FACES[rolled - 1]}.\n${outcome}\n\nPlayable Gold: **${result.account.gold_balance.toLocaleString()}**.`
            );

        await interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
    },
};

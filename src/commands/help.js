const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require("discord.js");
const { LEGEND, GREEN, ORANGE, RED, UP, DOWN } = require("../champions");
const { nextPuzzleIn } = require("../format");

module.exports = {
    data: new SlashCommandBuilder().setName("help").setDescription("How to play LoLdle here"),

    async execute(interaction, client) {
        const embed = new EmbedBuilder()
            .setColor(0xc89b3c)
            .setTitle("How to play LoLdle")
            .setDescription(
                "Everyone in the server gets the **same champion** each day. Guess it in as few tries as you can — " +
                    "your guesses are only visible to you, and the channel is told when you finish."
            )
            .addFields(
                {
                    name: "Commands",
                    value: [
                        "`/guess <champion>` — make a guess (autocomplete helps with spelling)",
                        "`/giveup` — reveal the answer; counts as a miss for the day",
                        "`/leaderboard [period]` — today, last 7 days, or all time",
                        "`/stats [player]` — averages, streaks, and guess distribution",
                    ].join("\n"),
                },
                {
                    name: "Reading the clues",
                    value: [
                        `${GREEN} exact match · ${ORANGE} partial match (lists) · ${RED} no match`,
                        `${UP} answer released later · ${DOWN} answer released earlier`,
                        `Columns: ${LEGEND}`,
                    ].join("\n"),
                },
                {
                    name: "Scoring",
                    value: "Daily rank: fewest guesses, ties broken by time from first guess to solve. Weekly and all-time: most solves, then average guesses.",
                }
            )
            .setFooter({
                text: `${nextPuzzleIn(client.config.timezone)} Based on loldle.net and Peter DeVries' Discord LoLdle bot (MIT).`,
            });

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    },
};

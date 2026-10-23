const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require("discord.js");
const { LEGEND, GREEN, ORANGE, RED, UP, DOWN } = require("../champions");
const { nextPuzzleIn } = require("../format");

module.exports = {
    data: new SlashCommandBuilder().setName("help").setDescription("How to play LoLdle here"),

    async execute(interaction, client) {
        const embed = new EmbedBuilder()
            .setColor(0xc89b3c)
            .setTitle("Games in this server")
            .setDescription(
                "Play LoLdle or Pokédle with private guesses and shared daily answers. LoLdle has one answer per server; Pokédle has one answer per generation range."
            )
            .addFields(
                {
                    name: "Commands",
                    value: [
                        "`/guess <champion>` — LoLdle guess (autocomplete helps with spelling)",
                        "`/pokedle range [from] [to]` — view or set your inclusive Gen 1–9 range (default Gen 1–9)",
                        "`/pokedle guess <Pokémon>` — guess today's Pokémon; same answer for everyone in your range",
                        "`/pokedle giveup`, `/pokedle leaderboard [period]`, `/pokedle stats [player]`",
                        "`/giveup` — reveal the answer; counts as a miss for the day",
                        "`/leaderboard [period]` — today, last 7 days, or all time",
                        "`/stats [player]` — averages, streaks, and guess distribution",
                        "`/gold balance` — check playable Gold and your Bank; `/gold borrow` and `/gold cashout` move between them",
                        "`/dice` — wager playable Gold on a die roll; `/gold leaderboard` shows net balances",
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

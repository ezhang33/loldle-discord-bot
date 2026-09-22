const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const { find, search, compare, LEGEND } = require("../champions");
const { todaysAnswer, history } = require("../game");
const { formatDuration } = require("../daily");
const { historyLines, breakdown, answerSummary, finishedRecap, shareGrid, nextPuzzleIn, plural, announce } = require("../format");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("guess")
        .setDescription("Guess today's LoLdle champion")
        .addStringOption((option) =>
            option.setName("champion").setDescription("Champion name").setRequired(true).setAutocomplete(true)
        ),

    async autocomplete(interaction) {
        const focused = interaction.options.getFocused();
        await interaction.respond(search(focused).map((c) => ({ name: c.name, value: c.name })));
    },

    async execute(interaction, client) {
        const guildId = interaction.guildId;
        const userId = interaction.user.id;
        const now = Date.now();
        const { day, answer } = todaysAnswer(client, guildId);

        const guess = find(interaction.options.getString("champion"));
        if (!guess) {
            await interaction.reply({
                content: `**${interaction.options.getString("champion")}** isn't a champion I know. Pick one from the autocomplete list.`,
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        let game = client.db.getGame(guildId, day, userId);
        if (game && game.status !== "playing") {
            await interaction.reply({
                content: finishedRecap(game, answer, history(client, guildId, day, userId, answer), client.config.timezone),
                flags: MessageFlags.Ephemeral,
            });
            return;
        }
        if (!game) game = client.db.startGame(guildId, day, userId, now);

        const previous = client.db.guessesFor(guildId, day, userId);
        if (previous.some((g) => g.champion.toLowerCase() === guess.name.toLowerCase())) {
            await interaction.reply({
                content: `You already guessed **${guess.name}** today.\n\n${historyLines(history(client, guildId, day, userId, answer))}`,
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        const n = previous.length + 1;
        client.db.recordGuess(guildId, day, userId, n, guess.name, now);
        const comparison = compare(guess, answer);
        const entries = history(client, guildId, day, userId, answer);

        if (guess.name === answer.name) {
            client.db.finishGame(guildId, day, userId, "solved", now);
            const elapsed = formatDuration(now - game.started_at);
            await interaction.reply({
                content:
                    `🎉 You solved today's LoLdle in **${n}** ${plural(n, "guess", "guesses")} (${elapsed})! The answer was **${answer.name}**.\n${answerSummary(answer)}\n\n` +
                    `${historyLines(entries)}\n\nCheck \`/leaderboard\` to see how you rank. ${nextPuzzleIn(client.config.timezone)}`,
                flags: MessageFlags.Ephemeral,
            });
            await announce(
                interaction,
                `🏆 <@${userId}> solved today's LoLdle in **${n}** ${plural(n, "guess", "guesses")} (${elapsed})!\n${shareGrid(entries)}`
            );
            return;
        }

        await interaction.reply({
            content:
                `**Guess ${n}: ${guess.name}**\n${breakdown(comparison)}\n\n` +
                `${LEGEND}\n${historyLines(entries)}\n\nKeep going with \`/guess\`, or \`/giveup\` to see the answer.`,
            flags: MessageFlags.Ephemeral,
        });
    },
};

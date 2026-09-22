const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const { todaysAnswer, history } = require("../game");
const { historyLines, answerSummary, finishedRecap, nextPuzzleIn, plural, announce } = require("../format");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("giveup")
        .setDescription("Give up on today's LoLdle and see the answer (counts as a miss)"),

    async execute(interaction, client) {
        const guildId = interaction.guildId;
        const userId = interaction.user.id;
        const { day, answer } = todaysAnswer(client, guildId);
        const game = client.db.getGame(guildId, day, userId);

        if (!game) {
            await interaction.reply({
                content: "You haven't started today's LoLdle yet. Make a guess first with `/guess`.",
                flags: MessageFlags.Ephemeral,
            });
            return;
        }
        if (game.status !== "playing") {
            await interaction.reply({
                content: finishedRecap(game, answer, history(client, guildId, day, userId, answer), client.config.timezone),
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        client.db.finishGame(guildId, day, userId, "gave_up", Date.now());
        const entries = history(client, guildId, day, userId, answer);
        await interaction.reply({
            content:
                `🏳️ You gave up after **${game.guesses}** ${plural(game.guesses, "guess", "guesses")}. The answer was **${answer.name}**.\n${answerSummary(answer)}\n\n` +
                `${historyLines(entries)}\n\n${nextPuzzleIn(client.config.timezone)}`,
            flags: MessageFlags.Ephemeral,
        });
        await announce(
            interaction,
            `🏳️ <@${userId}> gave up on today's LoLdle after **${game.guesses}** ${plural(game.guesses, "guess", "guesses")}.`
        );
    },
};

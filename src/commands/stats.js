const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { userStats } = require("../game");
const { dayKey, formatDuration } = require("../daily");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("stats")
        .setDescription("LoLdle stats for you or another player")
        .addUserOption((option) => option.setName("player").setDescription("Whose stats (default: you)")),

    async execute(interaction, client) {
        const target = interaction.options.getUser("player") || interaction.user;
        const games = client.db.userGames(interaction.guildId, target.id);
        const stats = userStats(games, dayKey(client.config.timezone));

        const embed = new EmbedBuilder()
            .setColor(0xc89b3c)
            .setTitle(`LoLdle stats — ${target.displayName ?? target.username}`)
            .setThumbnail(target.displayAvatarURL());

        if (stats.played === 0) {
            embed.setDescription("No finished games yet. Start with `/guess`!");
        } else {
            const rate = Math.round((stats.solved / stats.played) * 100);
            embed.addFields(
                { name: "Played", value: String(stats.played), inline: true },
                { name: "Solved", value: `${stats.solved} (${rate}%)`, inline: true },
                { name: "Avg guesses", value: stats.avgGuesses === null ? "—" : stats.avgGuesses.toFixed(2), inline: true },
                { name: "Avg time", value: stats.avgTime === null ? "—" : formatDuration(stats.avgTime), inline: true },
                { name: "Current streak", value: `${stats.currentStreak} 🔥`, inline: true },
                { name: "Best streak", value: String(stats.bestStreak), inline: true },
                { name: "Guess distribution", value: distributionBars(stats.distribution) }
            );
        }

        await interaction.reply({ embeds: [embed] });
    },
};

function distributionBars(distribution) {
    const max = Math.max(1, ...Object.values(distribution));
    return Object.entries(distribution)
        .map(([bucket, count]) => {
            const bar = "█".repeat(Math.round((count / max) * 12));
            return `\`${bucket.padStart(2)}\` ${bar} ${count}`;
        })
        .join("\n");
}

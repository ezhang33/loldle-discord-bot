const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { rankDay, rankPeriod, solveTime } = require("../game");
const { dayKey, recentDays, formatDuration } = require("../daily");
const { nextPuzzleIn, plural } = require("../format");

const MEDALS = ["🥇", "🥈", "🥉"];

module.exports = {
    data: new SlashCommandBuilder()
        .setName("leaderboard")
        .setDescription("See who's winning at LoLdle")
        .addStringOption((option) =>
            option
                .setName("period")
                .setDescription("Which leaderboard (default: today)")
                .addChoices(
                    { name: "Today", value: "today" },
                    { name: "This week (last 7 days)", value: "week" },
                    { name: "All time", value: "alltime" }
                )
        ),

    async execute(interaction, client) {
        const guildId = interaction.guildId;
        const period = interaction.options.getString("period") || "today";
        const tz = client.config.timezone;

        const embed = new EmbedBuilder().setColor(0xc89b3c); // League gold

        if (period === "today") {
            const day = dayKey(tz);
            const { solved, gaveUp, playing } = rankDay(client.db.dayGames(guildId, day));
            embed.setTitle(`LoLdle leaderboard — ${day}`);
            const lines = solved.map(
                (g, i) =>
                    `${MEDALS[i] || `**${i + 1}.**`} <@${g.user_id}> — **${g.guesses}** ${plural(g.guesses, "guess", "guesses")} · ${formatDuration(solveTime(g))}`
            );
            for (const g of gaveUp) lines.push(`🏳️ <@${g.user_id}> — gave up after ${g.guesses}`);
            if (lines.length === 0) lines.push("Nobody has finished today's LoLdle yet. Be the first with `/guess`!");
            embed.setDescription(lines.join("\n"));
            const footer = [playing > 0 ? `${playing} still playing` : null, nextPuzzleIn(tz)].filter(Boolean).join(" · ");
            embed.setFooter({ text: footer });
        } else {
            const games =
                period === "week" ? client.db.gamesInDays(guildId, recentDays(tz, 7)) : client.db.allFinishedGames(guildId);
            const rows = rankPeriod(games);
            embed.setTitle(period === "week" ? "LoLdle leaderboard — last 7 days" : "LoLdle leaderboard — all time");
            const lines = rows.slice(0, 20).map((r, i) => {
                const avg = r.avgGuesses === null ? "—" : `avg **${r.avgGuesses.toFixed(1)}** guesses`;
                const time = r.avgTime === null ? "" : ` · avg ${formatDuration(r.avgTime)}`;
                return `${MEDALS[i] || `**${i + 1}.**`} <@${r.user_id}> — **${r.solved}**/${r.played} solved · ${avg}${time}`;
            });
            if (lines.length === 0) lines.push("No finished games yet. Start with `/guess`!");
            embed.setDescription(lines.join("\n"));
            embed.setFooter({ text: "Ranked by solves, then average guesses, then average time" });
        }

        await interaction.reply({ embeds: [embed], allowedMentions: { users: [] } });
    },
};

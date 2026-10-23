const { SlashCommandBuilder, MessageFlags, EmbedBuilder } = require("discord.js");
const { pokemon, find, findById, inRange, search, compare, marks, generationLabel, LEGEND } = require("../pokemon");
const { validateRange, todaysAnswer, history, rankDay, rankPeriod, userStats, solveTime } = require("../pokedleGame");
const { dayKey, recentDays, msUntilNextDay, formatDuration } = require("../daily");

const MEDALS = ["🥇", "🥈", "🥉"];
const one = (n, singular, plural) => (n === 1 ? singular : plural);

function historyLines(entries) {
    return entries.map((e) => `\`${String(e.n).padStart(2, "0")}\.\` ${e.marks} ${e.name}`).join("\n");
}

function breakdown(items) {
    return items.map((item) => `${item.mark} ${item.label}: ${item.value}`).join("\n");
}

function answerSummary(answer) {
    return breakdown(compare(answer, answer));
}

function nextPuzzleIn(timezone) {
    return `Next Pokédle in ${formatDuration(msUntilNextDay(timezone))}.`;
}

function finishedRecap(game, answer, entries, timezone, range) {
    const head = game.status === "solved"
        ? `You already solved today's ${range} Pokédle in **${game.guesses}** ${one(game.guesses, "guess", "guesses")} (${formatDuration(game.finished_at - game.started_at)}).`
        : `You gave up on today's ${range} Pokédle after **${game.guesses}** ${one(game.guesses, "guess", "guesses")}.`;
    return `${head}\nThe answer was **${answer.name}**.\n${answerSummary(answer)}\n\n${historyLines(entries)}\n\n${nextPuzzleIn(timezone)}`;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("pokedle")
        .setDescription("Play the daily Pokémon guessing game")
        .addSubcommand((sub) =>
            sub.setName("range").setDescription("View or set your generation range")
                .addIntegerOption((o) => o.setName("from").setDescription("First generation (1–9)").setMinValue(1).setMaxValue(9))
                .addIntegerOption((o) => o.setName("to").setDescription("Last generation (1–9)").setMinValue(1).setMaxValue(9))
        )
        .addSubcommand((sub) =>
            sub.setName("guess").setDescription("Guess today's Pokémon")
                .addStringOption((o) => o.setName("pokemon").setDescription("Pokémon name").setRequired(true).setAutocomplete(true))
        )
        .addSubcommand((sub) => sub.setName("giveup").setDescription("Reveal today's answer and finish your game"))
        .addSubcommand((sub) =>
            sub.setName("leaderboard").setDescription("Leaderboard for your generation range")
                .addStringOption((o) => o.setName("period").setDescription("Which leaderboard")
                    .addChoices({ name: "Today", value: "today" }, { name: "This week", value: "week" }, { name: "All time", value: "alltime" }))
        )
        .addSubcommand((sub) => sub.setName("stats").setDescription("Pokédle stats for you or another player")
            .addUserOption((o) => o.setName("player").setDescription("Whose stats (default: you)"))),

    async autocomplete(interaction, client) {
        const range = client.db.pokedleRange(interaction.guildId, interaction.user.id);
        const focused = interaction.options.getFocused();
        await interaction.respond(search(focused, range.gen_from, range.gen_to).map((p) => ({ name: p.name, value: p.name })));
    },

    async execute(interaction, client) {
        const sub = interaction.options.getSubcommand();
        if (sub === "range") return showOrSetRange(interaction, client);
        if (sub === "guess") return guess(interaction, client);
        if (sub === "giveup") return giveup(interaction, client);
        if (sub === "leaderboard") return leaderboard(interaction, client);
        if (sub === "stats") return stats(interaction, client);
    },
};

async function showOrSetRange(interaction, client) {
    const from = interaction.options.getInteger("from");
    const to = interaction.options.getInteger("to");
    const current = client.db.pokedleRange(interaction.guildId, interaction.user.id);
    if (from === null && to === null) {
        await interaction.reply({
            content: `Your Pokédle range is **${generationLabel(current.gen_from, current.gen_to)}**. Set it with \`/pokedle range from:<1–9> to:<1–9>\`. Same server + day + range means the same answer.`,
            flags: MessageFlags.Ephemeral,
        });
        return;
    }
    if (from === null || to === null) {
        await interaction.reply({ content: "Set both `from` and `to` generations.", flags: MessageFlags.Ephemeral });
        return;
    }
    try {
        validateRange(from, to);
    } catch {
        await interaction.reply({ content: "`from` must be less than or equal to `to` (generations 1–9).", flags: MessageFlags.Ephemeral });
        return;
    }
    client.db.setPokedleRange(interaction.guildId, interaction.user.id, from, to, Date.now());
    await interaction.reply({
        content: `Your Pokédle range is now **${generationLabel(from, to)}**. The daily answer is shared with everyone in this server using the same range.`,
        flags: MessageFlags.Ephemeral,
    });
}

async function guess(interaction, client) {
    const { day, genFrom, genTo, answer } = todaysAnswer(client, interaction.guildId, interaction.user.id);
    const rangeLabel = generationLabel(genFrom, genTo);
    const typed = interaction.options.getString("pokemon");
    const chosen = find(typed);
    if (!chosen || !inRange(chosen, genFrom, genTo)) {
        await interaction.reply({ content: `**${typed}** isn't in your ${rangeLabel} Pokédle range. Choose a Pokémon from autocomplete.`, flags: MessageFlags.Ephemeral });
        return;
    }

    let game = client.db.getPokedleGame(interaction.guildId, day, genFrom, genTo, interaction.user.id);
    if (game && game.status !== "playing") {
        const entries = history(client, interaction.guildId, day, genFrom, genTo, interaction.user.id, answer);
        await interaction.reply({ content: finishedRecap(game, answer, entries, client.config.timezone, rangeLabel), flags: MessageFlags.Ephemeral });
        return;
    }
    if (!game) game = client.db.startPokedleGame(interaction.guildId, day, genFrom, genTo, interaction.user.id, Date.now());

    const previous = client.db.pokedleGuesses(interaction.guildId, day, genFrom, genTo, interaction.user.id);
    if (previous.some((row) => findById(row.pokemon_id)?.id === chosen.id)) {
        await interaction.reply({
            content: `You already guessed **${chosen.name}** for ${rangeLabel} today.\n\n${historyLines(history(client, interaction.guildId, day, genFrom, genTo, interaction.user.id, answer))}`,
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    const now = Date.now();
    const n = previous.length + 1;
    client.db.recordPokedleGuess(interaction.guildId, day, genFrom, genTo, interaction.user.id, n, chosen.id, now);
    const entries = history(client, interaction.guildId, day, genFrom, genTo, interaction.user.id, answer);
    if (chosen.id === answer.id) {
        client.db.finishPokedleGame(interaction.guildId, day, genFrom, genTo, interaction.user.id, "solved", now);
        await interaction.reply({
            content: `🎉 You solved today's ${rangeLabel} Pokédle in **${n}** ${one(n, "guess", "guesses")} (${formatDuration(now - game.started_at)})! The answer was **${answer.name}**.\n${answerSummary(answer)}\n\n${historyLines(entries)}\n\nCheck \`/pokedle leaderboard\` for this range's standings. ${nextPuzzleIn(client.config.timezone)}`,
            flags: MessageFlags.Ephemeral,
        });
        await interaction.channel?.send({
            content: `🏆 <@${interaction.user.id}> solved today's ${rangeLabel} Pokédle in **${n}** ${one(n, "guess", "guesses")}!\n${LEGEND}\n${entries.map((entry) => entry.marks).join("\n")}`,
            allowedMentions: { users: [] },
        }).catch((error) => console.warn("Could not announce Pokédle solve:", error.message));
        return;
    }

    await interaction.reply({
        content: `**Guess ${n}: ${chosen.name}**\n${breakdown(compare(chosen, answer))}\n\n${historyLines(entries)}\n\nKeep going with \`/pokedle guess\`, or \`/pokedle giveup\` to see the answer.`,
        flags: MessageFlags.Ephemeral,
    });
}

async function giveup(interaction, client) {
    const { day, genFrom, genTo, answer } = todaysAnswer(client, interaction.guildId, interaction.user.id);
    const range = generationLabel(genFrom, genTo);
    const game = client.db.getPokedleGame(interaction.guildId, day, genFrom, genTo, interaction.user.id);
    if (!game) {
        await interaction.reply({ content: "Make a Pokédle guess first, then use `/pokedle giveup` if you want to reveal it.", flags: MessageFlags.Ephemeral });
        return;
    }
    if (game.status !== "playing") {
        await interaction.reply({ content: finishedRecap(game, answer, history(client, interaction.guildId, day, genFrom, genTo, interaction.user.id, answer), client.config.timezone, range), flags: MessageFlags.Ephemeral });
        return;
    }
    client.db.finishPokedleGame(interaction.guildId, day, genFrom, genTo, interaction.user.id, "gave_up", Date.now());
    const entries = history(client, interaction.guildId, day, genFrom, genTo, interaction.user.id, answer);
    await interaction.reply({ content: `The ${range} answer was **${answer.name}**.\n${answerSummary(answer)}\n\n${historyLines(entries)}\n\n${nextPuzzleIn(client.config.timezone)}`, flags: MessageFlags.Ephemeral });
}

async function leaderboard(interaction, client) {
    const { gen_from: from, gen_to: to } = client.db.pokedleRange(interaction.guildId, interaction.user.id);
    const range = generationLabel(from, to);
    const period = interaction.options.getString("period") || "today";
    const day = dayKey(client.config.timezone);
    const embed = new EmbedBuilder().setColor(0x3b82f6).setTitle(`Pokédle leaderboard · ${range}`);
    if (period === "today") {
        const { solved, gaveUp, playing } = rankDay(client.db.pokedleDayGames(interaction.guildId, day, from, to));
        const lines = solved.map((g, i) => `${MEDALS[i] || `**${i + 1}.**`} <@${g.user_id}> — **${g.guesses}** ${one(g.guesses, "guess", "guesses")} · ${formatDuration(solveTime(g))}`);
        for (const game of gaveUp) lines.push(`🏳️ <@${game.user_id}> — gave up after ${game.guesses}`);
        if (!lines.length) lines.push(`No one has finished today's ${range} puzzle yet. Be the first!`);
        embed.setDescription(lines.join("\n"));
        embed.setFooter({ text: [playing ? `${playing} still playing` : null, nextPuzzleIn(client.config.timezone)].filter(Boolean).join(" · ") });
    } else {
        const days = period === "week" ? recentDays(client.config.timezone, 7) : null;
        const games = days
            ? client.db.pokedleGamesInDays(interaction.guildId, days, from, to)
            : client.db.allPokedleFinishedGames(interaction.guildId, from, to);
        const rows = rankPeriod(games).slice(0, 20).map((r, i) => {
            const avg = r.avgGuesses === null ? "—" : `avg **${r.avgGuesses.toFixed(1)}** guesses`;
            return `${MEDALS[i] || `**${i + 1}.**`} <@${r.user_id}> — **${r.solved}**/${r.played} solved · ${avg}`;
        });
        embed.setTitle(`Pokédle ${period === "week" ? "weekly" : "all-time"} leaderboard · ${range}`)
            .setDescription(rows.length ? rows.join("\n") : "No finished games for this range yet.")
            .setFooter({ text: "Ranked by solves, then average guesses" });
    }
    await interaction.reply({ embeds: [embed], allowedMentions: { users: [] } });
}

async function stats(interaction, client) {
    const target = interaction.options.getUser("player") || interaction.user;
    const { gen_from: from, gen_to: to } = client.db.pokedleRange(interaction.guildId, target.id);
    const games = client.db.pokedleUserGames(interaction.guildId, target.id, from, to);
    const result = userStats(games, dayKey(client.config.timezone));
    const embed = new EmbedBuilder().setColor(0x3b82f6)
        .setTitle(`Pokédle stats · ${generationLabel(from, to)} · ${target.displayName ?? target.username}`)
        .setThumbnail(target.displayAvatarURL());
    if (result.played === 0) {
        embed.setDescription("No finished Pokédle games in this range yet. Use `/pokedle guess` to start.");
    } else {
        const rate = Math.round((result.solved / result.played) * 100);
        embed.addFields(
            { name: "Played", value: String(result.played), inline: true },
            { name: "Solved", value: `${result.solved} (${rate}%)`, inline: true },
            { name: "Avg guesses", value: result.avgGuesses === null ? "—" : result.avgGuesses.toFixed(2), inline: true },
            { name: "Current streak", value: `${result.currentStreak} 🔥`, inline: true },
            { name: "Best streak", value: String(result.bestStreak), inline: true }
        );
    }
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

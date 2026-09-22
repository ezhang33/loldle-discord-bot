// Message text shared by several commands.
const { LEGEND, compare } = require("./champions");
const { msUntilNextDay, formatDuration } = require("./daily");

function nextPuzzleIn(timezone) {
    return `Next LoLdle in ${formatDuration(msUntilNextDay(timezone))}.`;
}

// Lines like "`3.` Ahri 🟥🟧🟩🟩🟥🟥⬆️" for each past guess.
function historyLines(entries) {
    return entries.map((e) => `\`${String(e.n).padStart(2)}.\` ${e.marks} ${e.name}`).join("\n");
}

// Full attribute breakdown of one comparison.
function breakdown(comparison) {
    return comparison.map((c) => `${c.mark} ${c.label}: ${c.value}`).join("\n");
}

// The answer's attributes, one per line, shown once the answer is revealed.
function answerSummary(answer) {
    return compare(answer, answer)
        .map((c) => `${c.label}: ${c.value}`)
        .join("\n");
}

// Recap shown to a player who has already finished today.
function finishedRecap(game, answer, entries, timezone) {
    const head =
        game.status === "solved"
            ? `You already solved today's LoLdle in **${game.guesses}** ${plural(game.guesses, "guess", "guesses")} (${formatDuration(game.finished_at - game.started_at)}).`
            : `You gave up on today's LoLdle after **${game.guesses}** ${plural(game.guesses, "guess", "guesses")}.`;
    return `${head}\nThe answer was **${answer.name}**.\n${answerSummary(answer)}\n\n${historyLines(entries)}\n\n${nextPuzzleIn(timezone)}`;
}

// Spoiler-free grid for the public channel, Wordle-share style.
function shareGrid(entries) {
    return `${LEGEND}\n${entries.map((e) => e.marks).join("\n")}`;
}

// Post a public message to the channel a command was used in. Silently
// skipped if the bot can't send there (missing permission, thread archived...).
async function announce(interaction, content) {
    try {
        await interaction.channel?.send({ content, allowedMentions: { users: [] } });
    } catch (error) {
        console.warn(`Could not announce in channel ${interaction.channelId}:`, error.message);
    }
}

function plural(n, one, many) {
    return n === 1 ? one : many;
}

module.exports = { nextPuzzleIn, historyLines, breakdown, answerSummary, finishedRecap, shareGrid, announce, plural };

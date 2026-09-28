const { SlashCommandBuilder, MessageFlags, EmbedBuilder } = require("discord.js");

const INITIAL_BANK = 1000;
const MAX_ACTION = Number.MAX_SAFE_INTEGER;

module.exports = {
    data: new SlashCommandBuilder()
        .setName("gold")
        .setDescription("Manage your server Gold")
        .addSubcommand((s) =>
            s.setName("balance").setDescription("Check your Bank and playable Gold")
                .addUserOption((o) => o.setName("user").setDescription("Check another player's balance"))
        )
        .addSubcommand((s) =>
            s.setName("borrow").setDescription("Move Gold from your Bank into your playable stack (Bank can go negative)")
                .addIntegerOption((o) => o.setName("amount").setDescription("Amount to move into play").setRequired(true).setMinValue(1).setMaxValue(MAX_ACTION))
        )
        .addSubcommand((s) =>
            s.setName("cashout").setDescription("Move playable Gold back into your Bank")
                .addIntegerOption((o) => o.setName("amount").setDescription("Amount to cash out").setRequired(true).setMinValue(1).setMaxValue(MAX_ACTION))
        )
        .addSubcommand((s) =>
            s.setName("transfer").setDescription("Transfer Bank balance to another player")
                .addUserOption((o) => o.setName("user").setDescription("Who to send Gold to").setRequired(true))
                .addIntegerOption((o) => o.setName("amount").setDescription("Amount to transfer").setRequired(true).setMinValue(1).setMaxValue(MAX_ACTION))
        )
        .addSubcommand((s) =>
            s.setName("adjust").setDescription("Owner only: add or subtract from a player's Bank")
                .addUserOption((o) => o.setName("user").setDescription("Player to adjust").setRequired(true))
                .addIntegerOption((o) => o.setName("amount").setDescription("Positive adds; negative subtracts").setRequired(true).setMinValue(-MAX_ACTION).setMaxValue(MAX_ACTION))
                .addStringOption((o) => o.setName("reason").setDescription("Why the balance is changing").setRequired(true).setMaxLength(200))
        )
        .addSubcommand((s) => s.setName("leaderboard").setDescription("See the richest players by net balance")),

    async execute(interaction, client) {
        const sub = interaction.options.getSubcommand();
        const guildId = interaction.guildId;
        const actorId = interaction.user.id;
        const now = Date.now();

        if (sub === "balance") {
            const subject = interaction.options.getUser("user") || interaction.user;
            const account = client.db.goldAccount(guildId, subject.id, now);
            const embed = new EmbedBuilder()
                .setColor(0xc89b3c)
                .setTitle(subject.id === actorId ? "Your Gold" : `${subject.username}'s Gold`)
                .addFields(
                    { name: "Gold available to play", value: account.gold_balance.toLocaleString(), inline: true },
                    { name: "Bank", value: account.bank_balance.toLocaleString(), inline: true },
                    { name: "Net balance", value: (account.gold_balance + account.bank_balance).toLocaleString(), inline: true }
                )
                .setFooter({ text: `Starting Bank: ${INITIAL_BANK} Gold · no daily top-ups · no borrowing limit` });
            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            return;
        }

        if (sub === "leaderboard") {
            const rows = client.db.goldLeaderboard(guildId, 15);
            const lines = rows.map((r, i) => `${i + 1}. <@${r.user_id}> — **${r.total.toLocaleString()}** net (Bank ${r.bank_balance.toLocaleString()} · Gold ${r.gold_balance.toLocaleString()})`);
            const embed = new EmbedBuilder()
                .setColor(0xc89b3c)
                .setTitle("Gold leaderboard")
                .setDescription(lines.length ? lines.join("\n") : "No accounts yet. Use `/gold balance` to start.")
                .setFooter({ text: "Ranked by Bank + playable Gold" });
            await interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
            return;
        }

        if (sub === "adjust") {
            if (!client.config.ownerId || actorId !== client.config.ownerId) {
                await interaction.reply({ content: "Owner only.", flags: MessageFlags.Ephemeral });
                return;
            }
            const user = interaction.options.getUser("user");
            const amount = interaction.options.getInteger("amount");
            const reason = interaction.options.getString("reason");
            if (user.bot || amount === 0) {
                await interaction.reply({ content: "Choose a human player and a non-zero adjustment.", flags: MessageFlags.Ephemeral });
                return;
            }
            const [account] = client.db.goldMove({
                id: interaction.id,
                guildId,
                kind: "owner_adjustment",
                actorId,
                now,
                details: `target:${user.id};reason:${reason}`,
                changes: [{ userId: user.id, bankDelta: amount, goldDelta: 0 }],
            });
            await interaction.reply({ content: `Adjusted <@${user.id}>'s Bank by ${amount > 0 ? "+" : ""}${amount.toLocaleString()} Gold. Bank: **${account.bank_balance.toLocaleString()}**.`, flags: MessageFlags.Ephemeral, allowedMentions: { users: [user.id] } });
            return;
        }

        if (sub === "transfer") {
            const user = interaction.options.getUser("user");
            const amount = interaction.options.getInteger("amount");
            if (user.bot || user.id === actorId) {
                await interaction.reply({ content: "Choose another human player.", flags: MessageFlags.Ephemeral });
                return;
            }
            try {
                const [from, to] = client.db.goldTransfer({
                    id: interaction.id, guildId, actorId, fromId: actorId, toId: user.id, amount, now,
                });
                await interaction.reply({ content: `Transferred **${amount.toLocaleString()} Gold** to <@${user.id}>. Your Bank: **${from.bank_balance.toLocaleString()}**.`, flags: MessageFlags.Ephemeral, allowedMentions: { users: [user.id] } });
                return;
            } catch (error) {
                await interaction.reply({ content: error.message, flags: MessageFlags.Ephemeral });
                return;
            }
        }

        const amount = interaction.options.getInteger("amount");
        const account = client.db.goldAccount(guildId, actorId, now);
        if (sub === "borrow") {
            const [updated] = client.db.goldMove({
                id: interaction.id, guildId, kind: "borrow", actorId, now,
                details: `amount:${amount}`,
                changes: [{ userId: actorId, bankDelta: -amount, goldDelta: amount }],
            });
            await interaction.reply({ content: `Moved **${amount.toLocaleString()} Gold** into your playable stack. Gold: **${updated.gold_balance.toLocaleString()}** · Bank: **${updated.bank_balance.toLocaleString()}**.`, flags: MessageFlags.Ephemeral });
            return;
        }
        if (sub === "cashout") {
            if (account.gold_balance < amount) {
                await interaction.reply({ content: `You only have **${account.gold_balance.toLocaleString()} playable Gold**.`, flags: MessageFlags.Ephemeral });
                return;
            }
            const [updated] = client.db.goldMove({
                id: interaction.id, guildId, kind: "cashout", actorId, now,
                details: `amount:${amount}`,
                changes: [{ userId: actorId, bankDelta: amount, goldDelta: -amount }],
            });
            await interaction.reply({ content: `Cashed out **${amount.toLocaleString()} Gold**. Gold: **${updated.gold_balance.toLocaleString()}** · Bank: **${updated.bank_balance.toLocaleString()}**.`, flags: MessageFlags.Ephemeral });
        }
    },
};

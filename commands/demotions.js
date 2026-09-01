const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../database/db.js');
const demotionScheduler = require('../services/demotionScheduler.js');
const { truncateText } = require('../utils/text.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('demotions')
        .setDescription('View and manage active demotions')
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List all active demotions in this server'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('restore')
                .setDescription('Manually restore a user\'s role early')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('The user to restore')
                        .setRequired(true))
                .addRoleOption(option =>
                    option.setName('role')
                        .setDescription('The role to restore (optional - restores all if not specified)')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('history')
                .setDescription('View demotion history for a user')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('The user to check history for')
                        .setRequired(true)))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    async execute(interaction) {
        // Defer reply immediately to prevent timeout
        await interaction.deferReply();

        // Only the server owner and approved users (from .env) can use this command
        const approvedIds = (process.env.APPROVED_USER_IDS || '').split(',').map(id => id.trim()).filter(Boolean);
        const allowedUsers = [interaction.guild.ownerId, ...approvedIds];
        if (!allowedUsers.includes(interaction.user.id)) {
            return interaction.editReply({
                content: `❌ You don't have permission to use this command!`
            });
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'list') {
            await handleList(interaction);
        } else if (subcommand === 'restore') {
            await handleRestore(interaction);
        } else if (subcommand === 'history') {
            await handleHistory(interaction);
        }
    }
};

async function handleList(interaction) {
    const activeDemotions = db.prepare(`
        SELECT * FROM demotions 
        WHERE guild_id = ? AND restored = 0 
        ORDER BY restore_at ASC
    `).all(interaction.guild.id);

    if (activeDemotions.length === 0) {
        return interaction.editReply({ content: '✅ No active demotions in this server!' });
    }

    const embed = new EmbedBuilder()
        .setTitle('⬇️ Active Demotions')
        .setColor(0xFF6B6B)
        .setTimestamp();

    let description = '';
    const now = Date.now();
    
    for (const demotion of activeDemotions.slice(0, 10)) {
        const user = await interaction.client.users.fetch(demotion.user_id).catch(() => null);
        const demotedBy = await interaction.client.users.fetch(demotion.demoted_by).catch(() => null);
        
        // Calculate time remaining
        const timeRemaining = demotion.restore_at - now;
        let restoreDisplay;
        
        if (timeRemaining <= 0) {
            restoreDisplay = '✅ **Done** (restoring soon)';
        } else {
            // Show both relative time and exact time
            restoreDisplay = `<t:${Math.floor(demotion.restore_at / 1000)}:R> (<t:${Math.floor(demotion.restore_at / 1000)}:t>)`;
        }
        
        description += `**${user ? user.tag : 'Unknown User'}**\n`;
        description += `└ Role: **${demotion.role_name}**\n`;
        description += `└ Restores: ${restoreDisplay}\n`;
        description += `└ By: ${demotedBy ? demotedBy.tag : 'Unknown'}\n`;
        description += `└ Reason: ${truncateText(demotion.reason || 'None', 160)}\n\n`;

        if (demotion.last_error) {
            const retryAt = demotion.next_attempt_at
                ? `<t:${Math.floor(demotion.next_attempt_at / 1000)}:R>`
                : 'soon';
            description += `⚠️ Last restore attempt failed; retrying ${retryAt}.\n\n`;
        }
    }

    if (activeDemotions.length > 10) {
        description += `*Showing the first 10 of ${activeDemotions.length} active demotions.*`;
    }

    embed.setDescription(description);
    embed.setFooter({ text: `${activeDemotions.length} active demotion(s)` });

    await interaction.editReply({ embeds: [embed] });
}

async function handleRestore(interaction) {
    const targetUser = interaction.options.getUser('user');
    const role = interaction.options.getRole('role');

    // Find active demotions for this user
    let demotions;
    if (role) {
        demotions = db.prepare(`
            SELECT * FROM demotions 
            WHERE user_id = ? AND guild_id = ? AND role_id = ? AND restored = 0
        `).all(targetUser.id, interaction.guild.id, role.id);
    } else {
        demotions = db.prepare(`
            SELECT * FROM demotions 
            WHERE user_id = ? AND guild_id = ? AND restored = 0
        `).all(targetUser.id, interaction.guild.id);
    }

    if (demotions.length === 0) {
        return interaction.editReply({ 
            content: `❌ No active demotions found for ${targetUser.tag}${role ? ` with role **${role.name}**` : ''}!`
        });
    }

    const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    if (!targetMember) {
        return interaction.editReply({ content: '❌ User is no longer in the server!' });
    }

    let restoredCount = 0;
    const restoredRoles = [];
    const failedRoles = [];

    for (const demotion of demotions) {
        const result = await demotionScheduler.restoreDemotion(demotion, {
            auditReason: `Early restoration by ${interaction.user.tag}`,
            notifyUser: false
        });

        if (result.restored) {
            restoredRoles.push(demotion.role_name);
            restoredCount++;
        } else {
            failedRoles.push(demotion.role_name);
        }
    }

    demotionScheduler.scheduleNextDemotionCheck();

    const resultLines = [`✅ Restored ${restoredCount} role(s) to ${targetUser.tag}.`];
    if (restoredRoles.length > 0) {
        resultLines.push(`**Restored:** ${restoredRoles.join(', ')}`);
    }
    if (failedRoles.length > 0) {
        resultLines.push(`⚠️ **Still pending:** ${failedRoles.join(', ')}. Automatic retries remain scheduled.`);
    }

    await interaction.editReply({
        content: truncateText(resultLines.join('\n'), 1900),
        allowedMentions: { parse: [] }
    });

    if (restoredRoles.length > 0) {
        try {
            await targetMember.send(
                truncateText(
                    `Your demotion has been lifted early. Your role(s) **${restoredRoles.join(', ')}** ` +
                    `in **${interaction.guild.name}** were restored by ${interaction.user.tag}.`,
                    1900
                )
            );
        } catch {
            // DMs may be disabled.
        }
    }
}

async function handleHistory(interaction) {
    const targetUser = interaction.options.getUser('user');

    const history = db.prepare(`
        SELECT * FROM demotions 
        WHERE user_id = ? AND guild_id = ? 
        ORDER BY demoted_at DESC 
        LIMIT 10
    `).all(targetUser.id, interaction.guild.id);

    if (history.length === 0) {
        return interaction.editReply({ content: `📜 No demotion history found for ${targetUser.tag}!` });
    }

    const embed = new EmbedBuilder()
        .setTitle(`📜 Demotion History: ${targetUser.tag}`)
        .setColor(0x5865F2)
        .setThumbnail(targetUser.displayAvatarURL())
        .setTimestamp();

    let description = '';
    for (const record of history) {
        const demotedBy = await interaction.client.users.fetch(record.demoted_by).catch(() => null);
        const status = record.restored ? '✅ Restored' : '⏳ Active';
        
        description += `**${record.role_name}** - ${status}\n`;
        description += `└ Demoted: <t:${Math.floor(record.demoted_at / 1000)}:R>\n`;
        description += `└ By: ${demotedBy ? demotedBy.tag : 'Unknown'}\n`;
        description += `└ Reason: ${truncateText(record.reason || 'None', 160)}\n\n`;
    }

    embed.setDescription(description);
    embed.setFooter({ text: `Showing last ${history.length} demotion(s)` });

    await interaction.editReply({ embeds: [embed] });
}

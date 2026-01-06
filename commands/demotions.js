const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../database/db.js');

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

        // Only server owner can use this command
        if (interaction.guild.ownerId !== interaction.user.id) {
            return interaction.editReply({ 
                content: `❌ Only the server owner can use this command!`
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
    
    for (const demotion of activeDemotions) {
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
        description += `└ Reason: ${demotion.reason || 'None'}\n\n`;
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

    for (const demotion of demotions) {
        const roleToRestore = interaction.guild.roles.cache.get(demotion.role_id);
        
        // Mark as restored in database FIRST (prevents protection from interfering)
        db.prepare('UPDATE demotions SET restored = 1 WHERE id = ?').run(demotion.id);
        
        if (roleToRestore) {
            try {
                await targetMember.roles.add(roleToRestore, `Early restoration by ${interaction.user.tag}`);
                restoredRoles.push(demotion.role_name);
                restoredCount++;
            } catch (err) {
                console.error(`[Demotions] Failed to restore role ${demotion.role_name}:`, err);
            }
        }
    }

    await interaction.editReply({
        content: `✅ Restored ${restoredCount} role(s) to ${targetUser.tag}: **${restoredRoles.join(', ')}**`
    });

    // Try to DM the user
    try {
        await targetMember.send(`✅ Your demotion has been lifted early! Your role(s) **${restoredRoles.join(', ')}** in **${interaction.guild.name}** have been restored by ${interaction.user.tag}.`);
    } catch (dmError) {
        // DMs disabled
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
        description += `└ Reason: ${record.reason || 'None'}\n\n`;
    }

    embed.setDescription(description);
    embed.setFooter({ text: `Showing last ${history.length} demotion(s)` });

    await interaction.editReply({ embeds: [embed] });
}

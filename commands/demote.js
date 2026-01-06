const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../database/db.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('demote')
        .setDescription('Temporarily demote a user by removing a role for a set duration')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to demote')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('role')
                .setDescription('The role to temporarily remove (type to search)')
                .setRequired(true)
                .setAutocomplete(true))
        .addIntegerOption(option =>
            option.setName('hours')
                .setDescription('Number of hours (0-720)')
                .setRequired(false)
                .setMinValue(0)
                .setMaxValue(720))
        .addIntegerOption(option =>
            option.setName('minutes')
                .setDescription('Number of minutes (0-59)')
                .setRequired(false)
                .setMinValue(0)
                .setMaxValue(59))
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for the demotion')
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    async autocomplete(interaction) {
        const focusedOption = interaction.options.getFocused(true);
        
        if (focusedOption.name === 'role') {
            const userOption = interaction.options.get('user');
            const searchTerm = focusedOption.value.toLowerCase();
            
            if (!userOption || !userOption.value) {
                // No user selected yet, show a hint
                return interaction.respond([
                    { name: '⚠️ Select a user first to see their roles', value: 'none' }
                ]);
            }
            
            try {
                const member = await interaction.guild.members.fetch(userOption.value).catch(() => null);
                
                if (!member) {
                    return interaction.respond([
                        { name: '❌ User not found in server', value: 'none' }
                    ]);
                }
                
                // Get the user's roles (excluding @everyone)
                const userRoles = member.roles.cache
                    .filter(role => role.id !== interaction.guild.id) // Exclude @everyone
                    .filter(role => role.name.toLowerCase().includes(searchTerm))
                    .sort((a, b) => b.position - a.position) // Sort by position (highest first)
                    .first(25); // Discord limit is 25 choices
                
                if (userRoles.length === 0) {
                    return interaction.respond([
                        { name: searchTerm ? 'No matching roles found' : 'User has no roles to demote', value: 'none' }
                    ]);
                }
                
                return interaction.respond(
                    userRoles.map(role => ({
                        name: role.name,
                        value: role.id
                    }))
                );
            } catch (error) {
                console.error('[Autocomplete] Error fetching roles:', error);
                return interaction.respond([]);
            }
        }
    },

    async execute(interaction) {
        // Defer reply immediately to prevent timeout
        await interaction.deferReply();

        // Only server owner can use this command
        if (interaction.guild.ownerId !== interaction.user.id) {
            return interaction.editReply({ 
                content: `❌ Only the server owner can use this command!`
            });
        }

        const targetUser = interaction.options.getUser('user');
        const roleId = interaction.options.getString('role');
        const hours = interaction.options.getInteger('hours') || 0;
        const minutes = interaction.options.getInteger('minutes') || 0;
        const reason = interaction.options.getString('reason') || 'No reason provided';

        // Validate role selection
        if (!roleId || roleId === 'none') {
            return interaction.editReply({ content: '❌ Please select a valid role from the autocomplete suggestions!' });
        }

        // Get the role object
        const role = interaction.guild.roles.cache.get(roleId);
        if (!role) {
            return interaction.editReply({ content: '❌ Role not found! Please select a role from the suggestions.' });
        }

        // Prevent self-demotion
        if (targetUser.id === interaction.user.id) {
            return interaction.editReply({ 
                content: '❌ You cannot demote yourself! That would be... awkward.'
            });
        }

        // Validate that at least some duration is provided
        if (hours === 0 && minutes === 0) {
            return interaction.editReply({ content: '❌ You must specify at least some duration (hours and/or minutes)!' });
        }

        // Get the member object
        const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

        if (!targetMember) {
            return interaction.editReply({ content: '❌ That user is not in the server!' });
        }

        // Check if user has the role
        if (!targetMember.roles.cache.has(role.id)) {
            return interaction.editReply({ content: `❌ ${targetUser.tag} doesn't have the **${role.name}** role!` });
        }

        // Check if bot can manage this role (role hierarchy)
        const botMember = interaction.guild.members.me;
        if (role.position >= botMember.roles.highest.position) {
            return interaction.editReply({ content: '❌ I cannot manage this role! It\'s higher than or equal to my highest role.' });
        }

        // Note: We removed the user hierarchy check so Founding Fathers can demote each other

        // Check if there's already an active demotion for this user and role
        const existingDemotion = db.prepare(`
            SELECT * FROM demotions 
            WHERE user_id = ? AND guild_id = ? AND role_id = ? AND restored = 0
        `).get(targetUser.id, interaction.guild.id, role.id);

        if (existingDemotion) {
            const restoreTime = new Date(existingDemotion.restore_at).toLocaleString();
            return interaction.editReply({ 
                content: `❌ ${targetUser.tag} is already demoted from **${role.name}**! Their role will be restored at ${restoreTime}`
            });
        }

        // Calculate restore time (hours + minutes in milliseconds)
        const now = Date.now();
        const totalMilliseconds = (hours * 60 * 60 * 1000) + (minutes * 60 * 1000);
        const restoreAt = now + totalMilliseconds;

        try {
            // Remove the role
            await targetMember.roles.remove(role, `Timed demotion by ${interaction.user.tag}: ${reason}`);

            // Save to database
            db.prepare(`
                INSERT INTO demotions (user_id, guild_id, role_id, role_name, demoted_by, reason, demoted_at, restore_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                targetUser.id,
                interaction.guild.id,
                role.id,
                role.name,
                interaction.user.id,
                reason,
                now,
                restoreAt
            );

            // Format duration display
            let durationParts = [];
            const totalHours = hours + (minutes / 60);
            
            if (totalHours >= 24) {
                const days = Math.floor(totalHours / 24);
                durationParts.push(`${days} day${days > 1 ? 's' : ''}`);
            }
            
            const displayHours = hours % 24;
            if (displayHours > 0) {
                durationParts.push(`${displayHours} hour${displayHours > 1 ? 's' : ''}`);
            }
            
            if (minutes > 0) {
                durationParts.push(`${minutes} minute${minutes > 1 ? 's' : ''}`);
            }
            
            const durationDisplay = durationParts.join(' ');

            await interaction.editReply({
                content: `⬇️ **Demotion Successful!**\n\n` +
                    `**User:** ${targetUser.tag}\n` +
                    `**Role Removed:** ${role.name}\n` +
                    `**Duration:** ${durationDisplay}\n` +
                    `**Restore Time:** <t:${Math.floor(restoreAt / 1000)}:F>\n` +
                    `**Reason:** ${reason}\n\n` +
                    `Their role will be automatically restored when the time is up.`
            });

            console.log(`[Demotion] ${targetUser.tag} demoted from ${role.name} for ${hours}h ${minutes}m by ${interaction.user.tag}`);

        } catch (error) {
            console.error('[Demotion] Error:', error);
            await interaction.editReply({ content: '❌ Failed to demote user. Check my permissions!' });
        }
    }
};

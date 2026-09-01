
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Ban a user from the server')
        .addUserOption(option => 
            option.setName('target')
                .setDescription('The user to ban')
                .setRequired(true))
        .addStringOption(option => 
            option.setName('reason')
                .setDescription('Reason for banning')
                .setRequired(false)
                .setMaxLength(500))
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
    async execute(interaction) {
        const target = interaction.options.getUser('target');
        const reason = interaction.options.getString('reason') || 'No reason provided';
        
        // Check if the bot can ban the target
        const targetMember = await interaction.guild.members.fetch(target.id).catch(() => null);
        
        if (!targetMember) {
            return interaction.reply({ content: 'That user is not in the cult!', ephemeral: true });
        }
        
        if (!targetMember.bannable) {
            return interaction.reply({ content: 'I cannot ban this user! They may have higher permissions than me.', ephemeral: true });
        }
        
        // Attempt to ban the user
        try {
            await interaction.guild.members.ban(target, { reason });
            await interaction.reply({
                content: `Successfully banned **${target.tag}** from the server.\nReason: ${reason}`,
                allowedMentions: { parse: [] }
            });
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: 'There was an error trying to ban this user!', ephemeral: true });
        }
    },
};

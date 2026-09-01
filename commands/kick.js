const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Banish a person from the cult')
    .addUserOption(option =>
        option.setName('user')
            .setDescription('The user to kick')
            .setRequired(true))
    .addStringOption(option => 
        option.setName('reason')
            .setDescription('Reason for kicking')
            .setRequired(false)
            .setMaxLength(500))
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
async execute(interaction) {
    const target = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'No Reason Provided';

    const targetMember = await interaction.guild.members.fetch(target.id).catch(() => null);

    if (!targetMember) {
        return interaction.reply({ content: 'That user is not in the cult!', ephemeral: true});
    }

    if (!targetMember.kickable) {
        return interaction.reply({ content: 'How dare you try to kick someone with higher power!', ephemeral: false});
    }

    try {
        await targetMember.kick(reason);
        await interaction.reply({
            content: `Successfully kicked **${target.tag}** from the cult.\nReason: ${reason}`,
            allowedMentions: { parse: [] }
        });
    } catch (error) {
        console.error(error);
        await interaction.reply({ content: 'There was an error trying to kick this user!', ephemeral: true})
    }
  },
};

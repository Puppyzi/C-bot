const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('hoi4drought')
        .setDescription('Hoi4 Drought'),
    async execute(interaction) {
        await interaction.reply('https://cdn.discordapp.com/attachments/1067172890581139549/1544090135782494248/hoi4drought.gif');
    },
};
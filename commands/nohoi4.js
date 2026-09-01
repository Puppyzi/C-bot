const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    guildOnly: true,
    data: new SlashCommandBuilder()
        .setName('nohoi4')
        .setDescription('SO THERE IS NO HOI 4 TODAY'),
    async execute(interaction) {
        await interaction.reply('https://tenor.com/view/hoi4-thereishoi-gif-25764147');
    },
};

const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    guildOnly: true,
    data: new SlashCommandBuilder()
        .setName('hoi4assemble')
        .setDescription("HOI4'ERs.... Assemble"),
    async execute(interaction) {
        await interaction.reply('https://cdn.discordapp.com/attachments/1067172890581139549/1540429827121610772/hoi4assemble.gif');
    },
};

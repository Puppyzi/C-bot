const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('commands')
        .setDescription('Lists all Cult-bot commands'),
    async execute(interaction) {
        // Dynamically generate command list from registered commands
        const commands = interaction.client.commands;
        
        const commandList = commands.map(cmd => {
            return `**/${cmd.data.name}** - ${cmd.data.description}`;
        }).join('\n');

        const embed = new EmbedBuilder()
            .setTitle('🤖 Cult-bot Commands')
            .setDescription(commandList)
            .setColor(0x5865F2)
            .setFooter({ text: `${commands.size} commands available` })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    },
};
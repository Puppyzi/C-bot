require('dotenv').config();

const path = require('path');
const { REST, Routes } = require('discord.js');
const { loadCommands } = require('./utils/commandLoader.js');
const { requireEnvironmentVariables } = require('./utils/environment.js');

async function deployCommands() {
    requireEnvironmentVariables(['BOT_TOKEN', 'CLIENT_ID']);

    const commandsPath = path.join(__dirname, 'commands');
    const body = loadCommands(commandsPath).map(command => command.data.toJSON());
    const rest = new REST().setToken(process.env.BOT_TOKEN);

    if (process.env.GUILD_ID) {
        console.log(`Deploying ${body.length} commands to guild ${process.env.GUILD_ID}...`);
        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body }
        );
    } else {
        console.log(`Deploying ${body.length} commands globally...`);
        await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body });
    }

    console.log('Slash commands deployed successfully.');
}

if (require.main === module) {
    deployCommands().catch(error => {
        console.error('Failed to deploy slash commands:', error);
        process.exitCode = 1;
    });
}

module.exports = { deployCommands };

require('dotenv').config();

const path = require('path');
const { REST, Routes } = require('discord.js');
const { loadCommands } = require('./utils/commandLoader.js');
const { requireEnvironmentVariables } = require('./utils/environment.js');

function partitionCommands(commands) {
    return {
        globalCommands: commands.filter(command => !command.guildOnly),
        guildCommands: commands.filter(command => command.guildOnly)
    };
}

async function deployCommands() {
    requireEnvironmentVariables(['BOT_TOKEN', 'CLIENT_ID']);

    const commandsPath = path.join(__dirname, 'commands');
    const { globalCommands, guildCommands } = partitionCommands(loadCommands(commandsPath));
    const globalBody = globalCommands.map(command => command.data.toJSON());
    const guildBody = guildCommands.map(command => command.data.toJSON());
    const rest = new REST().setToken(process.env.BOT_TOKEN);
    const deployments = [];

    console.log(`Deploying ${globalBody.length} global commands...`);
    deployments.push(
        rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: globalBody })
    );

    if (guildBody.length > 0 && process.env.GUILD_ID) {
        console.log(`Deploying ${guildBody.length} server-specific commands to guild ${process.env.GUILD_ID}...`);
        deployments.push(rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body: guildBody }
        ));
    } else if (guildBody.length > 0) {
        console.warn(
            `Skipping ${guildBody.length} server-specific commands because GUILD_ID is not configured.`
        );
    }

    await Promise.all(deployments);
    console.log('Slash commands deployed successfully.');
}

if (require.main === module) {
    deployCommands().catch(error => {
        console.error('Failed to deploy slash commands:', error);
        process.exitCode = 1;
    });
}

module.exports = { deployCommands, partitionCommands };

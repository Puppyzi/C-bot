const fs = require('fs');
const path = require('path');

function loadCommands(commandsPath) {
    const commands = [];
    const commandFiles = fs.readdirSync(commandsPath)
        .filter(file => file.endsWith('.js'))
        .sort();

    for (const file of commandFiles) {
        const command = require(path.join(commandsPath, file));
        if (!command.data || typeof command.execute !== 'function') {
            throw new Error(`Command ${file} is missing a required data or execute property.`);
        }
        commands.push(command);
    }

    return commands;
}

module.exports = { loadCommands };

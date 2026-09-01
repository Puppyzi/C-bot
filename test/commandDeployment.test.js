const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { partitionCommands } = require('../deploy-commands.js');
const { loadCommands } = require('../utils/commandLoader.js');

test('HOI4 commands are guild-only and all other commands remain global', () => {
    const commands = loadCommands(path.join(__dirname, '..', 'commands'));
    const { globalCommands, guildCommands } = partitionCommands(commands);

    assert.deepEqual(
        guildCommands.map(command => command.data.name).sort(),
        ['hoi4assemble', 'hoi4drought', 'nohoi4']
    );
    assert.equal(globalCommands.some(command => command.guildOnly), false);
    assert.equal(globalCommands.some(command => command.data.name === 'ping'), true);
});

require('dotenv').config();
const path = require('path');
const db = require('./database/db.js');
const demotionScheduler = require('./services/demotionScheduler.js');
const { loadCommands } = require('./utils/commandLoader.js');
const { reportOptionalFeatureConfiguration, requireEnvironmentVariables } = require('./utils/environment.js');

const { 
    Client, 
    GatewayIntentBits, 
    Partials, 
    Collection,
    ActivityType,
    PresenceUpdateStatus,
    Events,
    MessageFlags
} = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ],
    partials: [
        Partials.Channel,
        Partials.Message,
        Partials.User,
        Partials.GuildMember
    ]
});

client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
for (const command of loadCommands(commandsPath)) {
    client.commands.set(command.data.name, command);
}

client.once(Events.ClientReady, () => {
    console.log(`Ready! Logged in as ${client.user.tag}`);

    const statusType = process.env.BOT_STATUS || 'online';
    const activityType = process.env.ACTIVITY_TYPE || ''; //constant activity_type should be 'Playing'.
    const activityName = process.env.ACTIVITY_NAME || ''; //constant should be 'Discord'

    const activityTypeMap = {
        'PLAYING': ActivityType.Playing,
        'WATCHING': ActivityType.Watching,
        'LISTENING': ActivityType.Listening,
        'STREAMING': ActivityType.Streaming,
        'COMPETING': ActivityType.Competing
    };

    const statusMap = {
        'online': PresenceUpdateStatus.Online,
        'idle': PresenceUpdateStatus.Idle,
        'dnd': PresenceUpdateStatus.DoNotDisturb,
        'invisible': PresenceUpdateStatus.Invisible
    };

    const presence = {
        status: statusMap[statusType] || PresenceUpdateStatus.Online,
        activities: []
    };

    if (activityName && activityTypeMap[activityType] !== undefined) {
        presence.activities.push({
            name: activityName,
            type: activityTypeMap[activityType]
        });
    }

    client.user.setPresence(presence);
    
    console.log(`Bot status set to: ${statusType}`);
    console.log(`Activity set to: ${activityType} ${activityName}`);

    demotionScheduler.startDemotionScheduler(client);
    console.log('[Demotions] Smart scheduler started.');
});

// Handle autocomplete interactions
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isAutocomplete()) return;
    
    const command = client.commands.get(interaction.commandName);
    if (!command || !command.autocomplete) return;
    
    try {
        await command.autocomplete(interaction);
    } catch (error) {
        console.error(`[Autocomplete] Error in ${interaction.commandName}:`, error);
    }
});

client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);

    if (!command) {
        // console.error(`No command matching ${interaction.commandName} was found.`)
        return;
    }

    try {
        console.log(`[${new Date().toISOString()}] Executing ${interaction.commandName} for user ${interaction.user.id}...`);
        await command.execute(interaction);
    } catch (error) {
        console.error(`[${new Date().toISOString()}] Error executing ${interaction.commandName}:`, error);
        try {
            if (interaction.deferred) {
                await interaction.editReply({ content: 'There was an error while executing this command!' });
            } else if (!interaction.replied) {
                await interaction.reply({
                    content: 'There was an error while executing this command!',
                    flags: MessageFlags.Ephemeral
                });
            }
        } catch (replyError) {
            console.error(`[${new Date().toISOString()}] Failed to send error reply:`, replyError);
        }
    }
});

// message event for testing
client.on("messageCreate", msg => {
    if (msg.author.bot) return; // Ignore bot messages
    if (msg.content.toLowerCase() === "july 17th") {
        msg.reply("Nothing ever happens")
    }
});

client.on("guildMemberAdd", member => {
    const channel = member.guild.channels.cache.find(ch => ch.name === "没问题"); // Replace with your channel name in double " "
    if (channel) {
        channel.send(`Welcome ${member.user.tag} to The cult!\nPlease read the rules in #rules.`);
    }
});

client.on("guildMemberUpdate", async (oldMember, newMember) => {
    // Find roles that were ADDED (in new but not in old)
    const addedRoles = newMember.roles.cache.filter(role => !oldMember.roles.cache.has(role.id));
    
    if (addedRoles.size === 0) return; // No roles added, ignore
    
    // Check each added role against active demotions
    for (const [roleId, role] of addedRoles) {
        // Skip if this demotion is being restored by the bot
        if (demotionScheduler.isRestoring(newMember.id, roleId)) {
            continue; // Bot is restoring this, don't interfere
        }

        const activeDemotion = db.prepare(`
            SELECT * FROM demotions 
            WHERE user_id = ? AND guild_id = ? AND role_id = ? AND restored = 0
        `).get(newMember.id, newMember.guild.id, roleId);
        
        if (activeDemotion) {
            // Check if time has expired - if so, don't remove (let the checker handle it)
            if (activeDemotion.restore_at <= Date.now()) {
                continue; // Time's up, don't interfere
            }

            // This role should not be given back yet!
            try {
                await newMember.roles.remove(role, 'Demotion still active - role automatically removed');
                console.log(`[Demotion Protection] Removed ${role.name} from ${newMember.user.tag} - demotion still active`);
                
                // Calculate remaining time
                const remainingMs = activeDemotion.restore_at - Date.now();
                const remainingMins = Math.ceil(remainingMs / (60 * 1000));
                const remainingHours = Math.floor(remainingMins / 60);
                const mins = remainingMins % 60;
                
                let timeDisplay = '';
                if (remainingHours > 0) timeDisplay += `${remainingHours}h `;
                timeDisplay += `${mins}m`;
                
                // Try to find the audit log to see who tried to add the role
                try {
                    const auditLogs = await newMember.guild.fetchAuditLogs({
                        type: 25, // MEMBER_ROLE_UPDATE
                        limit: 1
                    });
                    const logEntry = auditLogs.entries.first();
                    
                    if (logEntry && logEntry.target.id === newMember.id && logEntry.executor.id !== client.user.id) {
                        // Notify the person who tried to give the role back
                        const executor = logEntry.executor;
                        try {
                            await executor.send(
                                `⚠️ **Demotion Protection**\n\n` +
                                `You tried to give **${role.name}** to **${newMember.user.tag}** in **${newMember.guild.name}**, ` +
                                `but they are currently demoted from that role.\n\n` +
                                `**Time remaining:** ${timeDisplay}\n` +
                                `**Reason:** ${activeDemotion.reason || 'No reason provided'}\n\n` +
                                `Use \`/demotions restore\` if you want to end the demotion early.`
                            );
                        } catch (dmErr) {
                            // Can't DM, that's fine
                        }
                    }
                } catch (auditErr) {
                    // Can't fetch audit logs, might not have permission
                }
                
            } catch (err) {
                console.error(`[Demotion Protection] Failed to remove role:`, err);
            }
        }
    }
});

let isShuttingDown = false;

function shutdown(reason, exitCode = 0) {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`[Shutdown] ${reason}`);
    demotionScheduler.stopDemotionScheduler();
    client.destroy();
    process.exitCode = exitCode;
}

process.once('SIGINT', () => shutdown('SIGINT received.'));
process.once('SIGTERM', () => shutdown('SIGTERM received.'));
process.on('uncaughtException', error => {
    console.error(`[${new Date().toISOString()}] Uncaught exception:`, error);
    shutdown('Fatal uncaught exception.', 1);
});
process.on('unhandledRejection', error => {
    console.error(`[${new Date().toISOString()}] Unhandled rejection:`, error);
    shutdown('Fatal unhandled rejection.', 1);
});

async function start() {
    requireEnvironmentVariables(['BOT_TOKEN']);
    reportOptionalFeatureConfiguration();
    await db.initDatabase();
    await client.login(process.env.BOT_TOKEN);
}

if (require.main === module) {
    start().catch(error => {
        console.error('Failed to start Cult-bot:', error);
        shutdown('Startup failed.', 1);
    });
}

module.exports = { client, shutdown, start };

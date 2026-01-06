require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');
// Use dynamic import for node-fetch
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

// Database
const db = require('./database/db.js');

// Added global error handlers to prevent crashes
process.on('uncaughtException', (err) => {
    console.error(`[${new Date().toISOString()}] Uncaught Exception:`, err);
});
process.on('unhandledRejection', (err) => {
    console.error(`[${new Date().toISOString()}] Unhandled Rejection:`, err);
});

const deployCommands = async () => {
    try {
        const commands = [];

        const commandFiles = fs.readdirSync(path.join(__dirname, 'commands')).filter(file => file.endsWith('.js'));

        for (const file of commandFiles) {
            const command = require(`./commands/${file}`);
            if ('data' in command && 'execute' in command) {
                commands.push(command.data.toJSON());
            } else {
                console.log(`WARNING: The command at ${file} is missing a required 'data' or 'execute' property.`);
            }
        }
    

    const rest = new REST().setToken(process.env.BOT_TOKEN);

    console.log(`Started refreshing application slash commands globally.`);

    const data = await rest.put(
        Routes.applicationCommands(process.env.CLIENT_ID),
        { body: commands },
    );

    console.log('Successfully reloaded all commands!');
    } catch (error) {
        console.error('Error deploying commands:', error)
    }
}

const { 
    Client, 
    GatewayIntentBits, 
    Partials, 
    Collection,
    ActivityType,
    PresenceUpdateStatus,
    Events
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
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);

    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
    } else {
        console.log(`The Command ${filePath} is missing a required "data" or "execute" property.`)
    }
}

// cooldown for rapid commands
const cooldowns = new Map();    

client.once(Events.ClientReady, async () => {
    // Initialize database first
    await db.initDatabase();
    
    console.log(`Ready! Logged in as ${client.user.tag}`);

    //Deploy Commands
    await deployCommands();
    console.log(`Commands deployed globally.`);

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

    client.user.setPresence({
        status: statusMap[statusType],
        activities: [{
            name: activityName,
            type: activityTypeMap[activityType]
        }]
    });
    
    console.log(`Bot status set to: ${statusType}`);
    console.log(`Activity set to: ${activityType} ${activityName}`);

    // Start demotion restoration checker (runs every 10 seconds)
    setInterval(() => checkDemotions(client), 10 * 1000);
    console.log('[Demotions] Auto-restore task started (checks every 10 seconds).');
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

    // cooldown check to prevent rapid commands
    const now = Date.now();
    const cooldownAmount = 5000; // 5-second cooldown per user
    const userId = interaction.user.id;
    if (cooldowns.has(userId)) {
        const expirationTime = cooldowns.get(userId);
        if (now < expirationTime) {
            const timeLeft = (expirationTime - now) / 1000;
            try {
                await interaction.reply({ content: `Please wait ${timeLeft.toFixed(1)} seconds before using /${interaction.commandName} again.`, flags: 64 });
            } catch (err) {
                console.error(`[${new Date().toISOString()}] Failed to send cooldown reply:`, err);
            }
            return;
        }
    }
    cooldowns.set(userId, now + cooldownAmount);
    setTimeout(() => cooldowns.delete(userId), cooldownAmount);

    try {
        console.log(`[${new Date().toISOString()}] Executing ${interaction.commandName} for user ${interaction.user.id}...`);
        await command.execute(interaction);
    } catch (error) {
        console.error(`[${new Date().toISOString()}] Error executing ${interaction.commandName}:`, error);
        try {
            if (interaction.deferred) {
                await interaction.editReply({ content: 'There was an error while executing this command!' });
            } else if (!interaction.replied) {
                await interaction.reply({ content: 'There was an error while executing this command!', flags: 64 });
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

// Demotion protection - prevents manually giving back roles during active demotion
// Track which demotions are currently being restored (to prevent protection from interfering)
const restoringDemotions = new Set();
// Lock to prevent multiple checkDemotions from running simultaneously
let isCheckingDemotions = false;

client.on("guildMemberUpdate", async (oldMember, newMember) => {
    // Find roles that were ADDED (in new but not in old)
    const addedRoles = newMember.roles.cache.filter(role => !oldMember.roles.cache.has(role.id));
    
    if (addedRoles.size === 0) return; // No roles added, ignore
    
    // Check each added role against active demotions
    for (const [roleId, role] of addedRoles) {
        // Skip if this demotion is being restored by the bot
        const demotionKey = `${newMember.id}-${roleId}`;
        if (restoringDemotions.has(demotionKey)) {
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

// Function to check and restore demoted users
async function checkDemotions(client) {
    // Prevent multiple simultaneous executions
    if (isCheckingDemotions) {
        return;
    }
    isCheckingDemotions = true;

    try {
        const now = Date.now();
        
        // Get all demotions that should be restored
        const expiredDemotions = db.prepare(`
            SELECT * FROM demotions WHERE restore_at <= ? AND restored = 0
        `).all(now);

        for (const demotion of expiredDemotions) {
            const demotionKey = `${demotion.user_id}-${demotion.role_id}`;
            
            // Skip if already being processed (shouldn't happen with lock, but extra safety)
            if (restoringDemotions.has(demotionKey)) {
                continue;
            }
            
            // Mark as restoring to prevent protection from interfering
            restoringDemotions.add(demotionKey);
            
            // Mark as restored in database FIRST to prevent re-processing
            db.prepare('UPDATE demotions SET restored = 1 WHERE id = ?').run(demotion.id);

            try {
                const guild = await client.guilds.fetch(demotion.guild_id).catch(() => null);
                if (!guild) {
                    console.log(`[Demotions] Guild ${demotion.guild_id} not found.`);
                    restoringDemotions.delete(demotionKey);
                    continue;
                }

                const member = await guild.members.fetch(demotion.user_id).catch(() => null);
                if (!member) {
                    console.log(`[Demotions] User ${demotion.user_id} not found in guild.`);
                    restoringDemotions.delete(demotionKey);
                    continue;
                }

                const role = guild.roles.cache.get(demotion.role_id);
                if (!role) {
                    console.log(`[Demotions] Role ${demotion.role_id} no longer exists.`);
                    restoringDemotions.delete(demotionKey);
                    continue;
                }

                // Restore the role
                await member.roles.add(role, 'Timed demotion expired - role restored automatically');

                console.log(`[Demotions] Restored ${role.name} to ${member.user.tag} in ${guild.name}`);

                // Try to DM the user
                try {
                    await member.send(`✅ Your temporary demotion has ended! Your **${role.name}** role in **${guild.name}** has been restored.`);
                } catch (dmError) {
                    // User has DMs disabled, that's fine
                }

            } catch (error) {
                console.error(`[Demotions] Error restoring demotion ${demotion.id}:`, error);
            } finally {
                // Clean up the tracking set after a short delay
                setTimeout(() => restoringDemotions.delete(demotionKey), 5000);
            }
        }
    } finally {
        isCheckingDemotions = false;
    }
}

client.login(process.env.BOT_TOKEN);
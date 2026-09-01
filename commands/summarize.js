const {
    ChannelType,
    MessageFlags,
    PermissionsBitField,
    SlashCommandBuilder
} = require('discord.js');
const { chunkLines } = require('../utils/text.js');

const HUGGING_FACE_URL = 'https://api-inference.huggingface.co/models/facebook/bart-large-cnn';
const MAX_CHUNK_LENGTH = 3500;

async function fetchMessagesSince(channel, cutoff) {
    const messages = [];
    let before;

    while (true) {
        const page = await channel.messages.fetch({
            limit: 100,
            ...(before ? { before } : {})
        });

        if (page.size === 0) break;

        const pageMessages = [...page.values()];
        const oldest = pageMessages.reduce((current, message) =>
            message.createdTimestamp < current.createdTimestamp ? message : current
        );

        for (const message of pageMessages) {
            if (message.createdTimestamp >= cutoff) messages.push(message);
        }

        if (oldest.createdTimestamp < cutoff || page.size < 100) break;
        before = oldest.id;
    }

    return {
        messages: messages
            .filter(message => !message.author.bot && message.content.trim())
            .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
    };
}

async function requestSummary(text, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);

    try {
        const response = await fetch(HUGGING_FACE_URL, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                inputs: text,
                parameters: {
                    max_length: options.maxLength || 150,
                    min_length: options.minLength || 30,
                    do_sample: false
                }
            }),
            signal: controller.signal
        });

        if (!response.ok) {
            throw new Error(`Hugging Face returned HTTP ${response.status}.`);
        }

        const result = await response.json();
        const summary = Array.isArray(result) ? result[0]?.summary_text : null;
        if (!summary) throw new Error('Hugging Face returned no summary text.');
        return summary;
    } finally {
        clearTimeout(timeout);
    }
}

async function summarizeChunks(chunks) {
    let summaries = [];
    for (const chunk of chunks) {
        summaries.push(await requestSummary(chunk));
    }

    // Repeatedly summarize groups of summaries until every source chunk has
    // contributed to one final result. This handles arbitrarily long channel
    // histories without discarding older messages.
    while (summaries.length > 1) {
        const combinedGroups = chunkLines(summaries, MAX_CHUNK_LENGTH);
        const nextLevel = [];
        for (const group of combinedGroups) {
            nextLevel.push(await requestSummary(group, { maxLength: 200, minLength: 40 }));
        }
        summaries = nextLevel;
    }

    return summaries[0];
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('summarize')
        .setDescription('Summarize recent messages in a channel using AI.')
        .addChannelOption(option =>
            option
                .setName('channel')
                .setDescription('The channel to summarize messages from.')
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText)
        )
        .addStringOption(option =>
            option
                .setName('timeframe')
                .setDescription('The timeframe to summarize.')
                .setRequired(false)
                .addChoices(
                    { name: 'Day', value: 'day' },
                    { name: 'Week', value: 'week' },
                    { name: 'Month', value: 'month' },
                    { name: 'Year', value: 'year' }
                )
        ),

    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        if (!process.env.HUGGINGFACE_API_KEY) {
            return interaction.editReply('Summarization is not configured. An administrator must add HUGGINGFACE_API_KEY.');
        }

        const channel = interaction.options.getChannel('channel');
        const timeframe = interaction.options.getString('timeframe') || 'day';

        if (!channel?.isTextBased()) {
            return interaction.editReply('Please select a valid text channel.');
        }

        const requiredPermissions = [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.ReadMessageHistory
        ];
        const botMember = interaction.guild.members.me;
        const requestingMember = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);

        if (!botMember || !channel.permissionsFor(botMember)?.has(requiredPermissions)) {
            return interaction.editReply('I need View Channel and Read Message History permissions in that channel.');
        }

        if (!requestingMember || !channel.permissionsFor(requestingMember)?.has(requiredPermissions)) {
            return interaction.editReply('You must be able to view that channel and its message history to summarize it.');
        }

        const timeLimits = {
            day: 24 * 60 * 60 * 1000,
            week: 7 * 24 * 60 * 60 * 1000,
            month: 30 * 24 * 60 * 60 * 1000,
            year: 365 * 24 * 60 * 60 * 1000
        };
        const cutoff = Date.now() - timeLimits[timeframe];

        let fetched;
        try {
            fetched = await fetchMessagesSince(channel, cutoff);
        } catch (error) {
            console.error(`[Summarize] Failed to fetch messages from channel ${channel.id}:`, error);
            return interaction.editReply('I could not fetch that channel’s messages. Check my permissions and try again.');
        }

        if (fetched.messages.length === 0) {
            return interaction.editReply(`No relevant messages were found in ${channel} for that timeframe.`);
        }

        const sourceLines = fetched.messages.map(message => {
            const author = message.member?.displayName || message.author.username;
            const timestamp = new Date(message.createdTimestamp).toISOString();
            return `[${timestamp}] ${author}: ${message.content}`;
        });

        const chunks = chunkLines(sourceLines, MAX_CHUNK_LENGTH);
        console.log(
            `[Summarize] Processing ${fetched.messages.length} messages from channel ${channel.id} ` +
            `in ${chunks.length} chunk(s).`
        );

        try {
            const summary = await summarizeChunks(chunks);
            const replyChunks = chunkLines(
                [`📝 **Summary of ${channel}** (${timeframe}):`, '', summary],
                1900
            );

            await interaction.editReply({
                content: replyChunks.shift(),
                allowedMentions: { parse: [] }
            });

            for (const replyChunk of replyChunks) {
                await interaction.followUp({
                    content: replyChunk,
                    flags: MessageFlags.Ephemeral,
                    allowedMentions: { parse: [] }
                });
            }
        } catch (error) {
            console.error('[Summarize] AI request failed:', error);
            await interaction.editReply('The summary service could not complete this request. Please try again later.');
        }
    },

    _test: { fetchMessagesSince, summarizeChunks }
};

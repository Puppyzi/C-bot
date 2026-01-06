const { SlashCommandBuilder, ChannelType, PermissionsBitField, InteractionResponseType } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('summarize')
        .setDescription('An attempt to summarize messages in a channel using AI.')
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
            .setDescription('The timeframe to summarize (e.g., day, week, month, year)')
            .setRequired(false)
            .addChoices(
                { name: 'Day', value: 'day' },
                { name: 'Week', value: 'week' },
                { name: 'Month', value: 'month' },
                { name: 'Year', value: 'year' }
            )
        ),

    async execute(interaction) {
        
        console.log(`[${new Date().toISOString()}] Starting /summarize command for user ${interaction.user.id}`);
        try {
            await interaction.deferReply();
            console.log(`[${new Date().toISOString()}] Interaction deferred.`);
        } catch (err) {
            console.error(`[${new Date().toISOString()}] Failed to defer reply:`, err);
            return; // Exit early to avoid further errors
        }

        try {
        const channel = interaction.options.getChannel('channel');
        console.log(`[${new Date().toISOString()}] Channel selected: ${channel?.name} (ID: ${channel?.id})`);
        const timeFrame = interaction.options.getString('timeframe') || 'day';
        console.log(`[${new Date().toISOString()}] Timeframe: ${timeFrame}`);

        // Channel Validation
        if (!channel || !channel.isTextBased()) {
                console.log(`[${new Date().toISOString()}] Invalid channel:`, channel);
                return interaction.editReply({ content: 'Please select a valid text channel!' });
        }

        // Permission Check
        if (!channel.permissionsFor(interaction.client.user).has([PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ReadMessageHistory])) {
                console.log(`[${new Date().toISOString()}] Missing permissions in channel: ${channel.name}`);
                return interaction.editReply({ content: 'I need View Channel and Read Message History permissions!' });
        }

        const timeLimits = {
            day: 24 * 60 * 60 * 1000,
            week: 7 * 24 * 60 * 60 * 1000,
            month: 30 * 24 * 60 * 60 * 1000,
            year: 365 * 24 * 60 * 60 * 1000
        };
        const timeLimit = timeLimits[timeFrame] || timeLimits.day;
        console.log(`[${new Date().toISOString()}] Current time: ${Date.now()}, Time limit: ${Date.now() - timeLimit}, Timeframe: ${timeFrame}`);
        console.log(`[${new Date().toISOString()}] Fetching messages...`);

        let messages;
            try {
                // Added timeout for message fetch
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 5000); // 5-second timeout
                messages = await channel.messages.fetch({ limit: 100, signal: controller.signal });
                clearTimeout(timeoutId);
                console.log(`[${new Date().toISOString()}] Fetched ${messages.size} messages.`);
            } catch (err) {
                console.error(`[${new Date().toISOString()}] Failed to fetch messages:`, err);
                return interaction.editReply({ content: 'Failed to fetch messages. Check my permissions or try another channel.' });
            }

            // Added debug for filtered messages with relaxed filter
            const filteredMessages = messages.filter(m => !m.author.bot && m.content.length > 0 && m.createdTimestamp > Date.now() - timeLimit);
            console.log(`[${new Date().toISOString()}] Filtered ${filteredMessages.size} messages:`, filteredMessages.map(m => ({ content: m.content, timestamp: new Date(m.createdTimestamp) })));

            const text = filteredMessages
                .map(m => m.content)
                .join(' ');
            console.log(`[${new Date().toISOString()}] Filtered text length: ${text.length} characters.`);

            // Fixed if block to handle no messages
            if (text.length === 0) {
                console.log(`[${new Date().toISOString()}] No relevant messages found.`);
                return interaction.editReply({
                    content: `No relevant messages found in ${channel.toString()} for the specified timeframe (${timeFrame}).`
                });
            }

            console.log(`[${new Date().toISOString()}] Making Hugging Face API call...`);
            let response;
            
            // Handle longer text by chunking (BART has ~1024 token limit, ~4 chars per token)
            const maxChunkSize = 3500; // Safe limit for BART
            const chunks = [];
            
            // Split text into chunks if needed
            if (text.length > maxChunkSize) {
                for (let i = 0; i < text.length; i += maxChunkSize) {
                    chunks.push(text.slice(i, i + maxChunkSize));
                }
                console.log(`[${new Date().toISOString()}] Text split into ${chunks.length} chunks for processing.`);
            } else {
                chunks.push(text);
            }
            
            const summaries = [];
            
            for (let i = 0; i < chunks.length; i++) {
                const chunk = chunks[i];
                console.log(`[${new Date().toISOString()}] Processing chunk ${i + 1}/${chunks.length} (${chunk.length} chars)...`);
                
                try {
                    // Added timeout to prevent API hang
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15-second timeout per chunk
                    response = await fetch("https://api-inference.huggingface.co/models/facebook/bart-large-cnn", {
                        method: "POST",
                        headers: {
                            "Authorization": `Bearer ${process.env.HUGGINGFACE_API_KEY || ''}`,
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify({ 
                            inputs: chunk,
                            parameters: {
                                max_length: 150,
                                min_length: 30,
                                do_sample: false
                            }
                        }),
                        signal: controller.signal
                    });
                    clearTimeout(timeoutId);
                    console.log(`[${new Date().toISOString()}] API response status for chunk ${i + 1}: ${response.status}`);
                    
                    const result = await response.json();
                    if (result && Array.isArray(result) && result[0]?.summary_text) {
                        summaries.push(result[0].summary_text);
                    }
                } catch (err) {
                    console.error(`[${new Date().toISOString()}] API error for chunk ${i + 1}:`, err);
                }
            }
            
            if (summaries.length === 0) {
                return interaction.editReply({ content: 'Failed to generate summary. Please try again later.' });
            }
            
            // If multiple chunks, combine summaries
            let finalSummary;
            if (summaries.length > 1) {
                // Summarize the summaries if we had multiple chunks
                const combinedSummaries = summaries.join(' ');
                console.log(`[${new Date().toISOString()}] Combining ${summaries.length} summaries...`);
                
                try {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 15000);
                    response = await fetch("https://api-inference.huggingface.co/models/facebook/bart-large-cnn", {
                        method: "POST",
                        headers: {
                            "Authorization": `Bearer ${process.env.HUGGINGFACE_API_KEY || ''}`,
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify({ 
                            inputs: combinedSummaries.slice(0, maxChunkSize),
                            parameters: {
                                max_length: 200,
                                min_length: 50,
                                do_sample: false
                            }
                        }),
                        signal: controller.signal
                    });
                    clearTimeout(timeoutId);
                    
                    const result = await response.json();
                    finalSummary = result && Array.isArray(result) && result[0]?.summary_text 
                        ? result[0].summary_text 
                        : summaries.join(' ');
                } catch (err) {
                    console.error(`[${new Date().toISOString()}] Failed to combine summaries:`, err);
                    finalSummary = summaries.join(' ');
                }
            } else {
                finalSummary = summaries[0];
            }

            await interaction.editReply(`📝 **Summary of ${channel.toString()}** (${timeFrame}):\n\n${finalSummary}`);
            console.log(`[${new Date().toISOString()}] Summary sent successfully.`);
        } catch (err) {
            console.error(`[${new Date().toISOString()}] Error summarizing:`, err);
        
            try {
                await interaction.editReply({
                    content: 'Error summarizing channel. Check my permissions or API status!'
                });
            } catch (editErr) {
                console.error(`[${new Date().toISOString()}] Failed to send error reply:`, editErr);
            }
        }
    }
};
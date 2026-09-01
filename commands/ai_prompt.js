const { GoogleGenerativeAI } = require("@google/generative-ai");

const { SlashCommandBuilder } = require("discord.js");
const { chunkLines } = require('../utils/text.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ai_prompt")
    .setDescription("Ask the configured Google Gemini model a question.")
    .addStringOption(option =>
      option.setName("prompt")
        .setDescription("Your stateless question or message")
        .setRequired(true)
    ),

  async execute(interaction) {
    const prompt = interaction.options.getString("prompt");

    await interaction.deferReply(); // Prevent timeout

    if (!process.env.GOOGLE_API_KEY) {
      return interaction.editReply('Conversational AI is not configured. An administrator must add GOOGLE_API_KEY.');
    }

    try {
      const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
      const model = genAI.getGenerativeModel({
        model: "gemini-3.5-flash",
        systemInstruction: {
          role: "system",
          parts: [{ text: "You are a helpful assistant." }]
        },

        generationConfig: {
          thinkingConfig: {
            includeThoughts: false, // This allows the bot to "reason" before answering
            thinkingLevel: "high"   // Options: 'minimal', 'medium', 'high'
          }
        }

      });

      const result = await model.generateContent(prompt);
      console.log(`[ai_prompt] served by: ${result.response.modelVersion}`);
      const text = result.response.text();

      const chunks = chunkLines(text.split(/\r?\n/), 1900);
      await interaction.editReply({
        content: chunks.shift() || 'The model returned an empty response.',
        allowedMentions: { parse: [] }
      });

      for (const chunk of chunks) {
        await interaction.followUp({
          content: chunk,
          allowedMentions: { parse: [] }
        });
      }

    } catch (err) {
      console.error("Google Generative AI error:", err);
      await interaction.editReply("Something went wrong while contacting Google AI Studio.");
    }
  }
};

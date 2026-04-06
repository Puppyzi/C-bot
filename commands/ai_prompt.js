const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ai_prompt")
    .setDescription("prev using gpt 4.1 mini, now using google 3-flash-preview. (cutoff is may.2024)")
    .addStringOption(option =>
      option.setName("prompt")
        .setDescription("Your stateless question or message")
        .setRequired(true)
    ),

  async execute(interaction) {
    const prompt = interaction.options.getString("prompt");

    await interaction.deferReply(); // Prevent timeout

    try {
      const model = genAI.getGenerativeModel({
        model: "gemini-3-flash-preview",
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
      const text = result.response.text();

      const reply = `**${prompt}**:\n\n${text}`;

      // Discord messages have a 2000 character limit
      if (reply.length > 2000) {
        await interaction.editReply(reply.substring(0, 1997) + "...");
      } else {
        await interaction.editReply(reply);
      }

    } catch (err) {
      console.error("❌ Google Generative AI error:", err);
      await interaction.editReply("⚠️ Something went wrong while contacting Google AI Studio.");
    }
  }
};

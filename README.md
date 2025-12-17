# 🤖 C-bot
A custom Discord bot developed for an active server

## **Unique Features**
Incorporates AI to summarize chat messages in channels, creates generated images from prompts, and a prompt-based AI chatbot

- AI summarization: [Hugging Face BART](https://huggingface.co/facebook/bart-large-cnn)
- AI image generator: [Google Cloud Vertex AI](https://cloud.google.com/vertex-ai?_gl=1*10s95gr*_up*MQ..&gclid=CjwKCAjwk7DFBhBAEiwAeYbJsWYuOopNIGfwyObLa7zmFRVhs4uKMc30Qe3AAcri80sDJ773Wj5khBoCplUQAvD_BwE&gclsrc=aw.ds&hl=en)
- General-purpose conversational AI: [GPT-4.1 mini](https://platform.openai.com/docs/models/gpt-4.1-mini)

## Setup

1. **Clone repo**
   ```bash
   git clone https://github.com/Puppyzi/C-bot.git
   cd C-bot
   ```
2. **Install dependencies**
   ```bash
    npm install
   ```
3. **Required variables**
- Create a .env file. Obtain your own API token/keys to enable features.
- [Discord Developer Portal Guide](https://discord.com/developers/docs/intro) for Discord-specific tokens.

4. **Run**
   ```bash
    npm start
   ```

node.js./discord.js

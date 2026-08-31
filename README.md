# C-bot
A custom Discord bot developed for an active server

## **Unique Features**
Incorporates AI to summarize chat messages in channels, creates generated images from prompts, and a prompt-based AI chatbot

- AI summarization: [Hugging Face BART](https://huggingface.co/facebook/bart-large-cnn)
- AI image generator: [Google Cloud Vertex AI](https://cloud.google.com/vertex-ai?_gl=1*10s95gr*_up*MQ..&gclid=CjwKCAjwk7DFBhBAEiwAeYbJsWYuOopNIGfwyObLa7zmFRVhs4uKMc30Qe3AAcri80sDJ773Wj5khBoCplUQAvD_BwE&gclsrc=aw.ds&hl=en)
- General-purpose conversational AI: [Gemini 3.5 Flash](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.5-flash)
- Timed Role Demotion

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

3. **Create a `.env` file**
   ```env
   BOT_TOKEN=your_discord_bot_token
   CLIENT_ID=your_discord_application_id
   GUILD_ID=

   GOOGLE_API_KEY=your_google_ai_api_key
   HUGGINGFACE_API_KEY=your_huggingface_api_key

   PROJECT_ID=your_google_cloud_project_id
   LOCATION=us-central1
   GOOGLE_APPLICATION_CREDENTIALS=C:\path\to\your\service-account.json

   BOT_STATUS=online
   ACTIVITY_TYPE=PLAYING
   ACTIVITY_NAME=any
   APPROVED_USER_IDS=
   ```

   See the [Discord Developer Portal Guide](https://discord.com/developers/docs/intro) for Discord-specific tokens.

4. **Google Cloud setup for `/image`**
   - Create a Google Cloud project and enable the Vertex AI API
   - Create a service account with Vertex AI permissions
   - Download its JSON key and set `GOOGLE_APPLICATION_CREDENTIALS` to the file path

5. **Deploy slash commands**
   ```bash
   npm run deploy
   ```

6. **Run**
   ```bash
   npm start
   ```

Built with [Node.js](https://nodejs.org/) 20+ and [discord.js](https://discord.js.org/).

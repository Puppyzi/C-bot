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
- Create a `.env` file with the following:
  ```env
  BOT_TOKEN=your_discord_bot_token
  CLIENT_ID=your_discord_application_id
  OPENAI_API_KEY=your_openai_api_key
  HUGGINGFACE_API_KEY=your_huggingface_api_key
  PROJECT_ID=your_google_cloud_project_id
  LOCATION=us-central1
  BOT_STATUS=online
  ACTIVITY_TYPE=PLAYING
  ACTIVITY_NAME=with the cult
  ```
- [Discord Developer Portal Guide](https://discord.com/developers/docs/intro) for Discord-specific tokens.

4. **Google Cloud Setup (for /image command)**
- Create a Google Cloud project and enable the Vertex AI API
- Create a service account with Vertex AI permissions
- Download the service account JSON key file
- Set the environment variable:
  ```bash
  # Windows (PowerShell)
  $env:GOOGLE_APPLICATION_CREDENTIALS="C:\path\to\your\service-account.json"
  
  # Linux/Mac
  export GOOGLE_APPLICATION_CREDENTIALS="/path/to/your/service-account.json"
  ```

5. **Run**
   ```bash
    npm start
   ```

node.js./discord.js

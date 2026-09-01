function requireEnvironmentVariables(names) {
    const missing = names.filter(name => !process.env[name]?.trim());
    if (missing.length > 0) {
        throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
}

function reportOptionalFeatureConfiguration() {
    if (!process.env.GOOGLE_API_KEY) {
        console.warn('[Config] GOOGLE_API_KEY is missing; /ai_prompt will be unavailable.');
    }
    if (!process.env.HUGGINGFACE_API_KEY) {
        console.warn('[Config] HUGGINGFACE_API_KEY is missing; /summarize will be unavailable.');
    }
    if (!process.env.PROJECT_ID || !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        console.warn('[Config] Vertex AI credentials are incomplete; /image may be unavailable.');
    }
}

module.exports = { reportOptionalFeatureConfiguration, requireEnvironmentVariables };

import "dotenv/config";

const required = ["FIRECRAWL_API_KEY", "ELEVENLABS_API_KEY"];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required env var: ${key}`);
  }
}

export const config = Object.freeze({
  firecrawlApiKey: process.env.FIRECRAWL_API_KEY,
  elevenlabsApiKey: process.env.ELEVENLABS_API_KEY,
  elevenlabsVoiceId: process.env.ELEVENLABS_VOICE_ID || "1zvnni6XluAvqQJWPf1M",
  telegramTarget: process.env.TELEGRAM_TARGET || "@ronjakowski",
});

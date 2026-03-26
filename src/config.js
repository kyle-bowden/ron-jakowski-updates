import "dotenv/config";

const required = ["FIRECRAWL_API_KEY", "ELEVENLABS_API_KEY", "OPENAI_API_KEY", "DATABASE_URL", "SUPABASE_URL", "SUPABASE_SECRET_KEY"];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required env var: ${key}`);
  }
}

export const config = Object.freeze({
  firecrawlApiKey: process.env.FIRECRAWL_API_KEY,
  elevenlabsApiKey: process.env.ELEVENLABS_API_KEY,
  elevenlabsVoiceId: process.env.ELEVENLABS_VOICE_ID || "1zvnni6XluAvqQJWPf1M",
  openaiApiKey: process.env.OPENAI_API_KEY,
  databaseUrl: process.env.DATABASE_URL,
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseServiceRoleKey: process.env.SUPABASE_SECRET_KEY,
  telegramTarget: process.env.TELEGRAM_TARGET || "@ronjakowski",
  xApiKey: process.env.X_API_KEY || null,
  xApiSecret: process.env.X_API_SECRET || null,
  xAccessToken: process.env.X_ACCESS_TOKEN || null,
  xAccessTokenSecret: process.env.X_ACCESS_TOKEN_SECRET || null,
  xEnabled: !!(process.env.X_API_KEY && process.env.X_API_SECRET && process.env.X_ACCESS_TOKEN && process.env.X_ACCESS_TOKEN_SECRET),
  nanobananaApiKey: process.env.NANOBANANA_API_KEY || null,
  nanobananaEnabled: !!process.env.NANOBANANA_API_KEY,
  youtubeClientId: process.env.YOUTUBE_CLIENT_ID || null,
  youtubeClientSecret: process.env.YOUTUBE_CLIENT_SECRET || null,
  youtubeRefreshToken: process.env.YOUTUBE_REFRESH_TOKEN || null,
  youtubeEnabled: !!(process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_CLIENT_SECRET && process.env.YOUTUBE_REFRESH_TOKEN),
  youtubePrivacy: process.env.YOUTUBE_PRIVACY || "public",
});

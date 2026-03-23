# The Reality Protocol — Cal Jakowski Conspiracy Bot

Inspired by the GTA VI release and Ron Jakowski's paranoid conspiracies, this is Cal Jakowski — Ron's fictional younger brother who picked up where Ron left off. Cal runs an autonomous conspiracy channel across Telegram, X (Twitter), and his own evidence board at [caljakowski.com](https://caljakowski.com).

The bot scrapes trending conspiracy discussions from Reddit via **Firecrawl**, generates frantic voice notes via **ElevenLabs**, and dispatches them across platforms with realistic timing. Cal doesn't tell you what to think — he just sends you the evidence and says "look at this properly."

## How It Works

1. **Scrape** — Firecrawl's AI agent (`spark-1-pro`) autonomously browses Reddit, extracts conspiracy stories with structured data (headlines, summaries, media links, voice scripts, tweets)
2. **Voice** — ElevenLabs (`eleven_v3`) generates Cal's voice notes — frantic phone-call-style delivery with whispered asides and heavy breathing
3. **Tag & Poll** — OpenAI tags stories and generates community polls
4. **Schedule** — Stories are scheduled at random times throughout the day (7am–midnight)
5. **Dispatch** — At each scheduled time:
   - Frantic text messages sent to Telegram with escalating delays
   - Voice note dropped to Telegram
   - Tweet posted to X with deeplink to the evidence board
6. **Glimpses** — 1-2 times daily, Cal sends personal fragments (memories, habits, fears) as either voice notes (70%) or AI-generated GTA-style artwork (30%)

## Live Platforms

- **Telegram:** [@ronjakowski](https://t.me/ronjakowski)
- **X (Twitter):** [@caljakowski](https://x.com/caljakowski)
- **Website:** [caljakowski.com](https://caljakowski.com)

## Prerequisites

- Node.js 18+
- `openclaw` CLI installed and configured with Telegram
- Supabase project (Postgres + Storage)

## Setup

```bash
npm install
cp .env.example .env
```

Fill in `.env`:

| Variable | Required | Purpose |
|----------|----------|---------|
| `FIRECRAWL_API_KEY` | Yes | Reddit scraping via Firecrawl agent |
| `ELEVENLABS_API_KEY` | Yes | Voice note generation |
| `OPENAI_API_KEY` | Yes | Story tagging, polls, glimpses |
| `DATABASE_URL` | Yes | Supabase Postgres connection |
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SECRET_KEY` | Yes | Supabase service role key |
| `X_API_KEY` | No | X (Twitter) posting |
| `X_API_SECRET` | No | X (Twitter) posting |
| `X_ACCESS_TOKEN` | No | X (Twitter) posting |
| `X_ACCESS_TOKEN_SECRET` | No | X (Twitter) posting |
| `NANOBANANA_API_KEY` | No | AI image generation for glimpses |
| `CLOUDFLARE_API_TOKEN` | No | Worker deployment |

## Usage

```bash
npm start              # Start scheduler (cron at 6am daily)
npm run run-now        # Trigger daily pipeline immediately
npm run start:ui       # Local dev server for the website

# Individual steps
node src/index.js --run-once    # Single story: scrape → voice → send → exit
node src/index.js --scrape      # Scrape + store only
node src/index.js --voice       # Generate voice from stored story
node src/index.js --send        # Generate voice + send (random story)
```

## Architecture

```
src/
  index.js             — CLI entry point, cron scheduler
  config.js            — Env var config (X + NanoBanana optional)
  pipeline.js          — Daily pipeline orchestration + scheduling
  scraper.js           — Firecrawl agent scraper with Zod schema
  store.js             — Supabase/Postgres persistence
  db.js                — Postgres pool
  openai-client.js     — Shared OpenAI client
  schema.js            — Zod schemas for story validation
  telegram.js          — Telegram sending via openclaw CLI
  x.js                 — X API client (OAuth 1.0a, tweets + media)
  voice.js             — ElevenLabs voice generation + Supabase upload
  image-generator.js   — NanoBanana AI image generation (GTA style)
  tagger.js            — AI story tagging
  poll-generator.js    — AI poll generation
  glimpses.js          — Cal's personal glimpse generation

worker/
  twitter-cards.js     — Cloudflare Worker for dynamic Twitter Cards
  wrangler.toml        — Worker deployment config

Website (GitHub Pages + Cloudflare):
  index.html           — Landing page
  board.html           — Evidence board with audio, polls, sharing
  autobiography.html   — Cal's backstory
  res/css/base.css     — Shared styles
  res/js/              — Shared JS (particles, cache, icons, Supabase)
```

## Key Integrations

- **Firecrawl** — AI agent scrapes Reddit, returns structured story data validated against Zod schema
- **ElevenLabs** — `eleven_v3` model generates Cal's voice with `opus_48000_128` format
- **OpenAI** — `gpt-5.4-mini` for tagging, polls, glimpses, and image scene prompts
- **X API** — OAuth 1.0a signing, v2 tweets, v1.1 media upload
- **NanoBanana** — Image-to-image generation using Cal's GTA-style reference for character consistency
- **Cloudflare Worker** — Serves dynamic OG/Twitter Card meta tags per story via `/story/ID` paths
- **Supabase** — Postgres for all data, Storage for voice files and media

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Cal Jakowski conspiracy bot. Scrapes Reddit via Firecrawl, generates AI voice notes via ElevenLabs, and sends frantic text + voice messages to Telegram and posts to X (Twitter). Includes a static website (caljakowski.com) with an evidence board, served via GitHub Pages with a Cloudflare Worker for dynamic Twitter Cards. Runs as a long-lived Node.js process with daily scheduling.

## Commands

```bash
npm start                          # Start scheduler (cron at 6am daily)
npm run run-now                    # Trigger daily pipeline immediately
npm run start:ui                   # Start local dev server for the website
node src/index.js --run-once       # Single story: scrape → voice → send → exit
node src/index.js --scrape         # Scrape + store only
node src/index.js --voice          # Generate voice from stored story
node src/index.js --send           # Generate voice + send (random story)
node src/index.js --send-only --story=0 --voice-file=path.ogg  # Send with existing voice
```

No test suite or linter configured.

## Architecture

**ES modules** (`"type": "module"` in package.json). All imports use `.js` extensions.

### Daily Pipeline Flow

`index.js` → `pipeline.js:runDailyPipeline()`:

1. Checks Supabase `schedules` table for today's existing schedule — if found, resumes unsent entries
2. If no schedule: `scraper.js` calls Firecrawl agent → stores all stories via `store.js` → generates voice for each via `voice.js` → tags stories and generates polls in parallel → creates schedule with random send times (7am–midnight)
3. Each entry dispatches at its scheduled time:
   - `telegram.js` sends frantic text messages with delays, then the voice note
   - `x.js` posts a Cal-voice tweet with deeplink to the evidence board (non-fatal)
   - Entry is marked sent in Supabase
4. Glimpses (Cal's personal fragments) are scheduled 1-2 times daily (9am–9pm, 2-hour minimum gap) and posted to both Telegram and X

### State Persistence

- **Supabase Postgres** — stories, schedules, schedule entries, tags, polls, glimpses
- `~/.openclaw/media/` — generated voice files (ElevenLabs outputs OGG/Opus directly)
- **Supabase Storage** — voice file uploads for web playback

### Backend Modules

| File | Purpose |
|------|---------|
| `src/index.js` | CLI entry point, argument parsing |
| `src/config.js` | Env var config (X vars are optional) |
| `src/pipeline.js` | Daily pipeline orchestration, scheduling, dispatch |
| `src/scraper.js` | Firecrawl agent scraper with Zod schema |
| `src/store.js` | Supabase/Postgres persistence |
| `src/db.js` | Postgres pool |
| `src/openai-client.js` | Shared OpenAI client instance |
| `src/schema.js` | Zod schemas for story validation |
| `src/telegram.js` | Telegram sending via openclaw CLI |
| `src/x.js` | X (Twitter) API client — OAuth 1.0a, tweet + media upload |
| `src/voice.js` | ElevenLabs voice generation + Supabase upload |
| `src/tagger.js` | AI story tagging via OpenAI |
| `src/poll-generator.js` | AI poll generation via OpenAI |
| `src/glimpses.js` | Cal's personal glimpse generation via OpenAI |

### External Integrations

- **Firecrawl** (`scraper.js`): `firecrawl.agent()` with `spark-1-pro` model, Zod schema validation
- **ElevenLabs** (`voice.js`): `eleven_v3` model, `opus_48000_128` format
- **OpenAI** (`openai-client.js`): `gpt-5.4-mini` for tagging, polls, glimpses
- **OpenClaw** (`telegram.js`): CLI subprocess via `exec()`. Target: `@ronjakowski` channel
- **X API** (`x.js`): OAuth 1.0a signing, v2 tweets, v1.1 media upload. Account: `@caljakowski`
- **Cloudflare Worker** (`worker/`): Dynamic Twitter Cards for per-story OG meta tags

### Website (caljakowski.com)

Static site served by GitHub Pages, proxied through Cloudflare.

| File | Purpose |
|------|---------|
| `index.html` | Landing page with typewriter manifesto, Telegram + X buttons |
| `board.html` | Evidence board with story cards, audio playback, polls, share buttons |
| `autobiography.html` | Cal's backstory |
| `res/css/base.css` | Shared CSS variables and base styles |
| `res/js/particles.js` | Canvas particle animation |
| `res/js/cache.js` | SessionStorage TTL cache |
| `res/js/icons.js` | Shared SVG icon strings |
| `res/js/supabase-config.js` | Supabase client config + shared instance |

### Cloudflare Worker (`worker/`)

Handles dynamic Twitter Cards. When a URL like `caljakowski.com/story/ID` is requested, the worker fetches the story title from Supabase and returns HTML with OG/Twitter meta tags. Regular users get JS-redirected to `board.html?story=ID`. For `board.html?story=ID` requests, it replaces static OG tags with dynamic per-story values.

- `worker/twitter-cards.js` — Worker script
- `worker/wrangler.toml` — Wrangler deployment config
- Deploy: `CLOUDFLARE_API_TOKEN=... npx wrangler deploy --config worker/wrangler.toml`

### Deeplink Formats

- **X posts:** `caljakowski.com/story/ID` (path-based for unique Twitter Cards per story)
- **Share buttons:** `board.html#story-ID` (hash-based, works everywhere)
- **Direct links:** `board.html?story=ID` (query-based, supported by board.html JS)

### Key Design Decisions

- `telegram.js` uses `exec()` (not `execFile`) because openclaw requires the user's full shell environment
- Voice files go to `~/.openclaw/media/` — openclaw restricts media access to its own directories
- Pipeline is restart-safe: schedule persists to Supabase, sent entries are tracked
- X integration is non-fatal: all X calls are wrapped in try/catch, failures don't block Telegram
- X env vars are optional: bot runs without them (`config.xEnabled` flag)
- Glimpses strip `[performance cues]` before posting to X (only useful for voice AI)
- Glimpses enforce a 2-hour minimum gap to avoid back-to-back posts
- `tagStories` and `generatePolls` run in parallel after scraping

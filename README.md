# Ron Jakowski Conspiracy Bot

Scrapes trending conspiracy stories from Reddit via Firecrawl, generates frantic voice notes via ElevenLabs, and sends panicked text + voice messages to Telegram via the `openclaw` CLI.

## Prerequisites

- Node.js 18+
- `openclaw` CLI installed and configured with Telegram channel
- Stories are stored in a local JSON file (no database required)

## Setup

```bash
npm install
cp .env.example .env
```

Edit `.env` and fill in your API keys:

```
FIRECRAWL_API_KEY=your-firecrawl-key
ELEVENLABS_API_KEY=your-elevenlabs-key
ELEVENLABS_VOICE_ID=1zvnni6XluAvqQJWPf1M
TELEGRAM_TARGET=@ronjakowski
```

`ELEVENLABS_VOICE_ID` and `TELEGRAM_TARGET` have defaults — only set them if you need different values.

## How it works

1. Every day at **6:00 AM**, Firecrawl scrapes Reddit for trending conspiracy stories
2. All stories are saved to `data/stories.json`
3. Voice notes are generated for **all** stories via ElevenLabs
4. Each story is scheduled to send at a **random time** between 7:00 and 22:00
5. At the scheduled time, the bot sends 3-5 frantic text messages (with realistic delays), then drops the voice note

If voice generation fails for a story, it falls back to text-only messages.

## Usage

### Run on schedule (production)

```bash
node src/index.js
```

Long-running process. Scrapes at 6:00 AM daily, then sends all stories at random times throughout the day.

### Daily pipeline now (for testing)

```bash
node src/index.js --run-now
```

Scrapes stories, generates all voice notes, and schedules sends throughout the rest of the day. Process stays alive to dispatch messages at scheduled times.

### Single story pipeline

```bash
node src/index.js --run-once
```

Scrapes, picks one random story, generates voice, sends immediately, then exits.

### Individual steps

```bash
# Scrape and store stories only (no voice, no Telegram)
node src/index.js --scrape

# Generate a voice note from a stored story (random pick)
node src/index.js --voice

# Generate voice + send to Telegram (random pick)
node src/index.js --send

# Use a specific story by index (0-based, from data/stories.json)
node src/index.js --voice --story=0
node src/index.js --send --story=3

# Send texts + existing voice file (no scraping, no voice generation)
node src/index.js --send-only --story=0 --voice-file=~/.openclaw/media/voice-123456.ogg

# Send texts only from a stored story (no voice)
node src/index.js --send-only --story=0
```

`--voice` saves the `.ogg` file in `~/.openclaw/media/` — useful for testing ElevenLabs independently.
`--send-only` skips scraping and voice generation, uses a pre-existing voice file via `--voice-file=`.

## Project structure

```
src/
  index.js      — Entry point, cron scheduler
  config.js     — Env var loading and validation
  schema.js     — Zod schema for story data
  store.js      — JSON file storage (data/stories.json)
  scraper.js    — Firecrawl agent integration
  voice.js      — ElevenLabs TTS (output to ~/.openclaw/media/)
  telegram.js   — openclaw CLI wrapper
  pipeline.js   — Pipeline orchestration + random time scheduling
```

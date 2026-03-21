# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Conspiracy theory bot that scrapes Reddit via Firecrawl, generates voice notes via ElevenLabs, and sends frantic text + voice messages to Telegram via the `openclaw` CLI. Runs as a long-lived Node.js process with daily scheduling.

## Commands

```bash
npm start                          # Start scheduler (cron at 6am daily)
npm run run-now                    # Trigger daily pipeline immediately
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

1. Checks `data/schedule.json` for today's existing schedule — if found, resumes unsent entries
2. If no schedule: `scraper.js` calls Firecrawl agent → stores all stories via `store.js` → generates voice for each via `voice.js` → creates schedule with random send times (7am–10pm)
3. Each entry dispatches at its scheduled time: `telegram.js` sends frantic text messages with delays, then the voice note
4. Each sent entry is marked in `data/schedule.json` so restarts don't re-send

### State Persistence

- `data/stories.json` — all scraped stories (append-only, with batchId + timestamps)
- `data/schedule.json` — today's dispatch schedule with per-entry `sent` status
- `~/.openclaw/media/` — generated voice files (ElevenLabs outputs OGG/Opus directly, no ffmpeg needed)

### External Integrations

- **Firecrawl** (`scraper.js`): `firecrawl.agent()` with `spark-1-pro` model, Zod schema validation
- **ElevenLabs** (`voice.js`): `eleven_v3` model, `opus_48000_128` format → writes to `~/.openclaw/media/` (required by openclaw's media access policy)
- **OpenClaw** (`telegram.js`): CLI subprocess via `exec()` with shell (needed for env/PATH inheritance). Target: `@ronjakowski` channel
- **Zod schema** (`schema.js`): shared between Firecrawl agent call and data validation; includes `text_messages` array for frantic pre-voice texts

### Key Design Decisions

- `telegram.js` uses `exec()` (not `execFile`) because openclaw requires the user's full shell environment (PATH, tokens, gateway auth)
- Voice files go to `~/.openclaw/media/` not local `tmp/` — openclaw restricts media access to its own directories
- Pipeline is restart-safe: schedule persists to disk, sent messages are tracked, restarts pick up where they left off

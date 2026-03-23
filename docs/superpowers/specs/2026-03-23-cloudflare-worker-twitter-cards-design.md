# Cloudflare Worker for Dynamic Twitter Cards

## Overview

A Cloudflare Worker that intercepts requests to `caljakowski.com/board.html?story=ID` from social media crawlers and returns HTML with dynamic Open Graph / Twitter Card meta tags per story. Regular users are redirected to the real GitHub Pages site. This enables rich preview cards on X when Cal posts a deeplink to an evidence card.

## Architecture

### Request flow

```
X crawler → caljakowski.com/board.html?story=12
  → Cloudflare Worker intercepts
  → Worker fetches story title from Supabase (public anon key, single row query)
  → Worker returns minimal HTML with <meta> tags + <meta http-equiv="refresh"> redirect
  → X renders rich card with story title + evidence board image

Regular user → caljakowski.com/board.html?story=12
  → Cloudflare Worker detects non-crawler User-Agent
  → Passes request through to GitHub Pages origin (no modification)
```

### Crawler detection

Check `User-Agent` for known bot strings: `Twitterbot`, `facebookexternalhit`, `LinkedInBot`, `Slackbot`, `Discordbot`, `TelegramBot`. If no match, pass through to origin.

### Worker logic (pseudocode)

```
1. Parse URL — extract `story` query param
2. If no `story` param → pass through to origin
3. If User-Agent is not a crawler → pass through to origin
4. Fetch story from Supabase: GET /rest/v1/stories?id=eq.{storyId}&select=post_title
5. If no story found → pass through to origin
6. Return HTML with:
   - <meta property="og:title" content="Evidence Board — The Reality Protocol">
   - <meta property="og:description" content="{story.post_title}">
   - <meta property="og:image" content="https://caljakowski.com/res/images/evidence_board-web.jpg">
   - <meta property="og:url" content="https://caljakowski.com/board.html?story={id}">
   - <meta name="twitter:card" content="summary_large_image">
   - <meta name="twitter:site" content="@caljakowski">
   - <meta name="twitter:title" content="Evidence Board — The Reality Protocol">
   - <meta name="twitter:description" content="{story.post_title}">
   - <meta name="twitter:image" content="https://caljakowski.com/res/images/evidence_board-web.jpg">
   - <meta http-equiv="refresh" content="0;url=https://caljakowski.com/board.html?story={id}">
```

### Supabase query

Uses the public REST API with the anon key (already public in the frontend JS). No secrets needed in the worker.

```
GET https://{SUPABASE_URL}/rest/v1/stories?id=eq.{storyId}&select=post_title
Headers:
  apikey: {SUPABASE_ANON_KEY}
  Authorization: Bearer {SUPABASE_ANON_KEY}
```

### Worker environment variables

- `SUPABASE_URL` — the Supabase project URL (e.g., `https://iaewobmdruabgqwmcytw.supabase.co`)
- `SUPABASE_ANON_KEY` — the public anon key (already exposed in frontend)

### Route configuration

Worker binds to: `caljakowski.com/board.html*`

This captures `board.html`, `board.html?story=12`, etc. Requests without `?story=` param pass through unchanged.

## Pipeline change

In `src/pipeline.js`, the `postToX` function currently generates deeplinks as:
```
https://caljakowski.com/board.html#story-{id}
```

Change to query param format:
```
https://caljakowski.com/board.html?story={id}
```

This ensures X's crawler requests a URL the worker can intercept. The `board.html` JS already supports both `?story=` and `#story-` formats.

The share button on board.html continues to use `#story-ID` format (works fine for direct sharing, no worker needed).

## Error handling

- Supabase fetch fails → pass through to origin (non-fatal)
- Story not found → pass through to origin
- Invalid story ID → pass through to origin
- Worker throws → Cloudflare falls back to origin automatically

## File changes

| File | Change |
|------|--------|
| `worker/twitter-cards.js` | **New** — Cloudflare Worker script |
| `worker/wrangler.toml` | **New** — Worker config |
| `src/pipeline.js` | Change deeplink format from `#story-` to `?story=` |

# Cloudflare Worker for Dynamic Twitter Cards — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy a Cloudflare Worker that returns dynamic Open Graph / Twitter Card meta tags per story when social media crawlers request `caljakowski.com/board.html?story=ID`.

**Architecture:** Worker intercepts requests to `board.html` with a `?story=` param, checks User-Agent for known crawlers, fetches the story title from Supabase's public REST API, and returns a minimal HTML page with meta tags. Non-crawler requests and requests without `?story=` pass through to GitHub Pages unchanged.

**Tech Stack:** Cloudflare Workers (vanilla JS, no framework), Supabase REST API (public anon key), Wrangler CLI for deployment.

---

### Task 1: Create the Cloudflare Worker script

**Files:**
- Create: `worker/twitter-cards.js`

- [ ] **Step 1: Create worker directory**

```bash
mkdir -p worker
```

- [ ] **Step 2: Write the worker script**

Create `worker/twitter-cards.js`:

```js
const CRAWLER_AGENTS = [
  "Twitterbot",
  "facebookexternalhit",
  "LinkedInBot",
  "Slackbot",
  "Discordbot",
  "TelegramBot",
];

function isCrawler(userAgent) {
  if (!userAgent) return false;
  return CRAWLER_AGENTS.some((bot) => userAgent.includes(bot));
}

async function fetchStoryTitle(storyId, env) {
  const url = `${env.SUPABASE_URL}/rest/v1/stories?id=eq.${encodeURIComponent(storyId)}&select=post_title`;
  const res = await fetch(url, {
    headers: {
      apikey: env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
    },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.length > 0 ? data[0].post_title : null;
}

function buildMetaHtml(storyId, title) {
  const pageUrl = `https://caljakowski.com/board.html?story=${storyId}`;
  const image = "https://caljakowski.com/res/images/evidence_board-web.jpg";
  const siteName = "Evidence Board — The Reality Protocol";
  const description = title || "Intercepted transmissions. Cal logged everything before they changed it.";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta property="og:type" content="article">
  <meta property="og:title" content="${siteName}">
  <meta property="og:description" content="${description}">
  <meta property="og:url" content="${pageUrl}">
  <meta property="og:image" content="${image}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:site" content="@caljakowski">
  <meta name="twitter:title" content="${siteName}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${image}">
  <meta http-equiv="refresh" content="0;url=${pageUrl}">
  <title>${siteName}</title>
</head>
<body>
  <p>Redirecting to <a href="${pageUrl}">evidence board</a>...</p>
</body>
</html>`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const storyId = url.searchParams.get("story");

    // No story param — pass through to origin
    if (!storyId) {
      return fetch(request);
    }

    // Not a crawler — pass through to origin
    const userAgent = request.headers.get("User-Agent") || "";
    if (!isCrawler(userAgent)) {
      return fetch(request);
    }

    // Validate story ID is numeric
    if (!/^\d+$/.test(storyId)) {
      return fetch(request);
    }

    try {
      const title = await fetchStoryTitle(storyId, env);
      if (!title) {
        return fetch(request);
      }
      return new Response(buildMetaHtml(storyId, title), {
        headers: { "Content-Type": "text/html;charset=UTF-8" },
      });
    } catch {
      // On any error, fall back to origin
      return fetch(request);
    }
  },
};
```

- [ ] **Step 3: Commit**

```bash
git add worker/twitter-cards.js
git commit -m "feat: add Cloudflare Worker for dynamic Twitter Cards"
```

---

### Task 2: Create Wrangler configuration

**Files:**
- Create: `worker/wrangler.toml`

- [ ] **Step 1: Write wrangler.toml**

Create `worker/wrangler.toml`:

```toml
name = "caljakowski-twitter-cards"
main = "twitter-cards.js"
compatibility_date = "2024-01-01"

[vars]
SUPABASE_URL = "https://iaewobmdruabgqwmcytw.supabase.co"
SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlhZXdvYm1kcnVhYmdxd21jeXR3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyMDM4NjYsImV4cCI6MjA4OTc3OTg2Nn0.hLMBDDrrNryg3W9cdCRYm5WASfGPOOm6oN10gIwdGqQ"

# Route: only intercept board.html requests on the domain
# Configure this via Cloudflare dashboard or wrangler CLI:
# Workers > caljakowski-twitter-cards > Triggers > Add route
# Route pattern: caljakowski.com/board.html*
```

- [ ] **Step 2: Commit**

```bash
git add worker/wrangler.toml
git commit -m "feat: add wrangler config for Twitter Cards worker"
```

---

### Task 3: Change X post deeplinks to query param format

**Files:**
- Modify: `src/pipeline.js`

- [ ] **Step 1: Update deeplink format in postToX**

In `src/pipeline.js`, find the line:
```js
const deeplink = story.id ? `\n\nhttps://caljakowski.com/board.html#story-${story.id}` : "";
```

Change to:
```js
const deeplink = story.id ? `\n\nhttps://caljakowski.com/board.html?story=${story.id}` : "";
```

- [ ] **Step 2: Verify pipeline loads**

Run: `node --input-type=module -e "import './src/pipeline.js'; console.log('Pipeline loaded OK');"`

Expected: `Pipeline loaded OK`

- [ ] **Step 3: Commit**

```bash
git add src/pipeline.js
git commit -m "feat: use query param deeplinks in X posts for Twitter Card support"
```

---

### Task 4: Deploy worker to Cloudflare

- [ ] **Step 1: Install wrangler (if not installed)**

```bash
npm install -g wrangler
```

- [ ] **Step 2: Login to Cloudflare**

```bash
wrangler login
```

This opens a browser for Cloudflare OAuth. Complete the login.

- [ ] **Step 3: Deploy the worker**

```bash
cd worker && wrangler deploy
```

Expected: Worker deployed successfully with a `*.workers.dev` URL.

- [ ] **Step 4: Add route in Cloudflare dashboard**

Go to Cloudflare dashboard → Workers & Pages → caljakowski-twitter-cards → Settings → Triggers → Add Route:
- Route: `caljakowski.com/board.html*`
- Zone: `caljakowski.com`

This ensures the worker only runs on board.html requests for the production domain.

- [ ] **Step 5: Test with curl simulating Twitterbot**

```bash
curl -A "Twitterbot/1.0" "https://caljakowski.com/board.html?story=12" 2>/dev/null | head -20
```

Expected: HTML response with `<meta property="og:description"` containing the story title.

- [ ] **Step 6: Test regular user passthrough**

```bash
curl -A "Mozilla/5.0" "https://caljakowski.com/board.html?story=12" 2>/dev/null | head -5
```

Expected: Normal board.html page from GitHub Pages (no injected meta tags).

- [ ] **Step 7: Validate with X Card Validator**

Go to https://cards-dev.twitter.com/validator (or post a test tweet with the URL and check the preview).

- [ ] **Step 8: Commit deploy state**

```bash
git commit --allow-empty -m "chore: Cloudflare Worker deployed for Twitter Cards"
```

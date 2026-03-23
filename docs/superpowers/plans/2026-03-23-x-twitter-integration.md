# X (Twitter) Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add X posting to the daily pipeline so Cal Jakowski tweets AI-generated cryptic posts (with optional images) alongside Telegram dispatches.

**Architecture:** New `src/x.js` module handles OAuth 1.0a signing and X API calls using Node.js built-ins (zero new deps). Schema adds `x_posts` field to stories. Pipeline calls X posting after each Telegram dispatch, wrapped in try/catch so failures are non-fatal. X env vars are optional — bot runs without them.

**Tech Stack:** Node.js built-in `crypto`, `https`, `http`, `buffer` for OAuth signing and HTTP. X API v2 for tweets, v1.1 for media upload.

---

### Task 1: Add X env vars to config (optional, non-breaking)

**Files:**
- Modify: `src/config.js`

- [ ] **Step 1: Add X env vars as optional config (NOT in the required array)**

Add to the config object only (do NOT add to the `required` array — X credentials are optional):

```js
xApiKey: process.env.X_API_KEY || null,
xApiSecret: process.env.X_API_SECRET || null,
xAccessToken: process.env.X_ACCESS_TOKEN || null,
xAccessTokenSecret: process.env.X_ACCESS_TOKEN_SECRET || null,
xEnabled: !!(process.env.X_API_KEY && process.env.X_API_SECRET && process.env.X_ACCESS_TOKEN && process.env.X_ACCESS_TOKEN_SECRET),
```

- [ ] **Step 2: Verify config loads**

Run: `node --input-type=module -e "import { config } from './src/config.js'; console.log('X enabled:', config.xEnabled);"`

Expected: `X enabled: true`

- [ ] **Step 3: Commit**

```bash
git add src/config.js
git commit -m "feat: add optional X API env vars to config"
```

---

### Task 2: Create `src/x.js` — OAuth 1.0a signing + verifyCredentials

**Files:**
- Create: `src/x.js`

- [ ] **Step 1: Create x.js with OAuth signing, error-aware request helper, and verifyCredentials**

```js
import crypto from "node:crypto";
import https from "node:https";
import http from "node:http";
import { config } from "./config.js";

function percentEncode(str) {
  return encodeURIComponent(str).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}

function oauthSign(method, url, params = {}) {
  const nonce = crypto.randomBytes(16).toString("hex");
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const oauthParams = {
    oauth_consumer_key: config.xApiKey,
    oauth_nonce: nonce,
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: timestamp,
    oauth_token: config.xAccessToken,
    oauth_version: "1.0",
  };

  const allParams = { ...params, ...oauthParams };
  const paramString = Object.keys(allParams)
    .sort()
    .map((k) => percentEncode(k) + "=" + percentEncode(allParams[k]))
    .join("&");

  const baseString = method.toUpperCase() + "&" + percentEncode(url) + "&" + percentEncode(paramString);
  const signingKey = percentEncode(config.xApiSecret) + "&" + percentEncode(config.xAccessTokenSecret);
  const signature = crypto.createHmac("sha1", signingKey).update(baseString).digest("base64");

  const authEntries = { ...oauthParams, oauth_signature: signature };
  return "OAuth " + Object.entries(authEntries)
    .map(([k, v]) => percentEncode(k) + '="' + percentEncode(v) + '"')
    .join(", ");
}

function request(method, url, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const opts = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method,
      headers,
    };
    const req = https.request(opts, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } else if (res.statusCode === 429) {
          reject(new Error(`[X] Rate limited (429). Retry after: ${res.headers["x-rate-limit-reset"] || "unknown"}`));
        } else if (res.statusCode === 401 || res.statusCode === 403) {
          reject(new Error(`[X] Auth failure (${res.statusCode}): ${data}. Check X API credentials.`));
        } else {
          reject(new Error(`[X] API error ${res.statusCode}: ${data}`));
        }
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

export async function verifyCredentials() {
  const url = "https://api.x.com/2/users/me";
  const auth = oauthSign("GET", url);
  return request("GET", url, { Authorization: auth });
}
```

- [ ] **Step 2: Smoke test verifyCredentials**

Run: `node --input-type=module -e "import { verifyCredentials } from './src/x.js'; const r = await verifyCredentials(); console.log(r.data);"`

Expected: `{ data: { id: '...', name: 'Cal Jakowski', username: 'caljakowski' } }`

- [ ] **Step 3: Commit**

```bash
git add src/x.js
git commit -m "feat: add x.js with OAuth 1.0a signing and credential verification"
```

---

### Task 3: Add postTweet to `src/x.js`

**Files:**
- Modify: `src/x.js`

- [ ] **Step 1: Add createTweet and postTweet functions**

Append to `src/x.js`:

```js
async function createTweet(text, mediaIds = []) {
  const url = "https://api.x.com/2/tweets";
  // Do NOT pass JSON body params to oauthSign — only query params go in the signature
  const auth = oauthSign("POST", url);
  const payload = { text };
  if (mediaIds.length > 0) {
    payload.media = { media_ids: mediaIds };
  }
  const body = JSON.stringify(payload);
  return request("POST", url, {
    Authorization: auth,
    "Content-Type": "application/json",
  }, body);
}

export async function postTweet(text) {
  console.log(`[X] Posting tweet: ${text.slice(0, 50)}...`);
  const result = await createTweet(text);
  console.log(`[X] Tweet posted: ${result.data.data.id}`);
  return result.data.data.id;
}
```

- [ ] **Step 2: Test with a real tweet**

Run: `node --input-type=module -e "import { postTweet } from './src/x.js'; await postTweet('test — ignore this');"`

Expected: Tweet posts successfully, logs tweet ID. **Delete the test tweet manually from X after confirming.**

- [ ] **Step 3: Commit**

```bash
git add src/x.js
git commit -m "feat: add postTweet function to x.js"
```

---

### Task 4: Add media upload + postTweetWithImage to `src/x.js`

**Files:**
- Modify: `src/x.js`

- [ ] **Step 1: Add downloadImage, uploadMedia, and postTweetWithImage functions**

Append to `src/x.js`:

```js
function downloadImage(imageUrl) {
  return new Promise((resolve, reject) => {
    const mod = imageUrl.startsWith("https") ? https : http;
    mod.get(imageUrl, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadImage(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        return reject(new Error(`Image download failed: ${res.statusCode}`));
      }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    }).on("error", reject);
  });
}

function guessMimeType(url) {
  const ext = url.split("?")[0].split(".").pop().toLowerCase();
  const types = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp" };
  return types[ext] || "image/jpeg";
}

async function uploadMedia(imageBuffer) {
  const url = "https://upload.twitter.com/1.1/media/upload.json";
  const base64Data = imageBuffer.toString("base64");

  // Do NOT pass media_data to oauthSign — multipart body params are excluded from OAuth signature
  const auth = oauthSign("POST", url);

  const boundary = "----XBoundary" + crypto.randomBytes(8).toString("hex");
  const bodyParts = [
    `--${boundary}\r\nContent-Disposition: form-data; name="media_data"\r\n\r\n${base64Data}\r\n`,
    `--${boundary}--\r\n`,
  ];
  const body = bodyParts.join("");

  return request("POST", url, {
    Authorization: auth,
    "Content-Type": `multipart/form-data; boundary=${boundary}`,
    "Content-Length": Buffer.byteLength(body),
  }, body);
}

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB

export async function postTweetWithImage(text, imageUrl) {
  console.log(`[X] Posting tweet with image: ${text.slice(0, 50)}...`);
  try {
    const imageBuffer = await downloadImage(imageUrl);
    if (imageBuffer.length > MAX_IMAGE_SIZE) {
      console.warn(`[X] Image too large (${(imageBuffer.length / 1024 / 1024).toFixed(1)}MB), posting text only`);
      return postTweet(text);
    }
    const uploadResult = await uploadMedia(imageBuffer);
    const mediaId = uploadResult.data.media_id_string;
    console.log(`[X] Media uploaded: ${mediaId}`);
    const result = await createTweet(text, [mediaId]);
    console.log(`[X] Tweet with image posted: ${result.data.data.id}`);
    return result.data.data.id;
  } catch (err) {
    console.error(`[X] Image upload failed, falling back to text: ${err.message}`);
    return postTweet(text);
  }
}
```

- [ ] **Step 2: Test with a real image tweet**

Run: `node --input-type=module -e "import { postTweetWithImage } from './src/x.js'; await postTweetWithImage('test with image — ignore', 'https://picsum.photos/200');"`

Expected: Tweet posts with image attached. **Delete the test tweet manually after confirming.**

- [ ] **Step 3: Commit**

```bash
git add src/x.js
git commit -m "feat: add media upload and postTweetWithImage to x.js"
```

---

### Task 5: Add x_posts to schema (with default)

**Files:**
- Modify: `src/schema.js`

- [ ] **Step 1: Add x_posts field to storySchema with default**

After the `text_messages` field in `storySchema`, add:

```js
x_posts: z.array(z.object({
  value: z.string(),
  value_citation: z.string().describe("Source URL for this value").optional(),
})).default([]),
```

The `.default([])` ensures stories without x_posts (existing data, AI omissions) parse without error.

- [ ] **Step 2: Verify schema parses with and without x_posts**

Run: `node --input-type=module -e "import { storySchema } from './src/schema.js'; const with_ = storySchema.safeParse({ post_title: 't', content_summary: 's', media_links: [], text_messages: [], x_posts: [{ value: 'test' }], persona_summary: 'p', discussion_link: 'http://x.com' }); const without = storySchema.safeParse({ post_title: 't', content_summary: 's', media_links: [], text_messages: [], persona_summary: 'p', discussion_link: 'http://x.com' }); console.log('with:', with_.success, 'without:', without.success);"`

Expected: `with: true without: true`

- [ ] **Step 3: Commit**

```bash
git add src/schema.js
git commit -m "feat: add x_posts field to story schema with default"
```

---

### Task 6: Update scraper prompt to generate x_posts

**Files:**
- Modify: `src/scraper.js`

- [ ] **Step 1: Add x_posts generation to the PROMPT**

Add to the PROMPT string (after the `discussion_link` bullet):

```
- 'x_posts': an array of 2-3 short tweets (max 280 chars each) written as Cal Jakowski for posting on X/Twitter. Character rules:
  - Cal is sleep-deprived, anxious, sharp — genuinely believes what he's saying
  - Start mid-thought, no clean intros or conclusions
  - Short fragments, not full sentences. Mix caps and lowercase for emphasis
  - Use phrases like "listen", "look", "I'm telling you", occasional references to "Ron"
  - Anchor each tweet in at least one concrete fact from the story — never invent facts
  - Do NOT sound like a journalist, comedian, or satirist
  - 70% should be cryptic observations, 20% should reference media ("did you see the clip?"), 10% should include "caljakowski.com"
  - Examples: "the timing is wrong again.", "Ron tried to warn people about this", "I logged it before they changed it caljakowski.com"
```

- [ ] **Step 2: Verify scraper still loads without errors**

Run: `node --input-type=module -e "import { scrapeStories } from './src/scraper.js'; console.log('Scraper loaded OK');"`

Expected: `Scraper loaded OK`

- [ ] **Step 3: Commit**

```bash
git add src/scraper.js
git commit -m "feat: update scraper prompt to generate x_posts per story"
```

---

### Task 7: Update store.js to persist x_posts + run migration

**Files:**
- Modify: `src/store.js`

- [ ] **Step 1: Add normalizeXPosts function**

Add after `normalizeMediaLinks`:

```js
function normalizeXPosts(posts) {
  if (!posts) return [];
  return posts.map((p) => (typeof p === "string" ? p : p.value));
}
```

- [ ] **Step 2: Add x_posts to the saveStories INSERT**

Current INSERT has 11 columns ($1-$11). Add `x_posts` as the 12th:

Change the INSERT query to:
```js
`INSERT INTO stories (batch_id, post_title, post_title_citation, content_summary, content_summary_citation,
  text_messages, media_links, persona_summary, persona_summary_citation, discussion_link, discussion_link_citation, x_posts)
 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
 RETURNING id`,
```

Add to the params array (after `discussion_link_citation`):
```js
JSON.stringify(normalizeXPosts(story.x_posts)),
```

- [ ] **Step 3: Add x_posts to rowToStory**

In the `rowToStory` function, add after `discussion_link_citation`:

```js
x_posts: normalizeXPosts(typeof row.x_posts === "string" ? JSON.parse(row.x_posts) : (row.x_posts || [])),
```

- [ ] **Step 4: Run database migration**

Use the Supabase MCP tool:

```
mcp__supabase__apply_migration with name "add_x_posts_to_stories" and query:
ALTER TABLE stories ADD COLUMN IF NOT EXISTS x_posts jsonb DEFAULT '[]'::jsonb;
```

Or via psql: `psql "$DATABASE_URL" -c "ALTER TABLE stories ADD COLUMN IF NOT EXISTS x_posts jsonb DEFAULT '[]'::jsonb;"`

- [ ] **Step 5: Commit**

```bash
git add src/store.js
git commit -m "feat: persist x_posts in store and database"
```

---

### Task 8: Integrate X posting into pipeline

**Files:**
- Modify: `src/pipeline.js`

- [ ] **Step 1: Import X functions and config**

Add to imports at top of `pipeline.js`:

```js
import { postTweet, postTweetWithImage } from "./x.js";
import { config } from "./config.js";
```

- [ ] **Step 2: Add postToX helper function**

Add before `dispatchSend`:

```js
async function postToX(story) {
  if (!config.xEnabled) {
    console.log("[X] X credentials not configured, skipping");
    return;
  }

  const xPosts = story.x_posts || [];
  if (xPosts.length === 0) {
    console.log("[X] No x_posts for this story, skipping");
    return;
  }

  // Use first available x_post (index 0)
  const text = typeof xPosts[0] === "string" ? xPosts[0] : xPosts[0];

  // Check for image-like media links
  const imageExts = [".jpg", ".jpeg", ".png", ".gif", ".webp"];
  const imageUrl = (story.media_links || []).find((link) => {
    const url = typeof link === "string" ? link : link;
    return imageExts.some((ext) => url.toLowerCase().split("?")[0].endsWith(ext));
  });

  if (imageUrl) {
    await postTweetWithImage(text, imageUrl);
  } else {
    await postTweet(text);
  }
}
```

- [ ] **Step 3: Call postToX in dispatchSend AFTER markEntrySent**

In `dispatchSend()`, add the X posting call AFTER `markEntrySent` and `publishStory` (so X delays/failures never prevent marking the Telegram send as complete). Add it after the `console.log("Published story...")` line and before the `findNextSendTime` call:

```js
    try {
      await postToX(entry.story);
    } catch (err) {
      console.error(`[X] Tweet failed (non-fatal): ${err.message}`);
    }
```

- [ ] **Step 4: Verify pipeline module loads**

Run: `node --input-type=module -e "import './src/pipeline.js'; console.log('Pipeline loaded OK');"`

Expected: `Pipeline loaded OK`

- [ ] **Step 5: Commit**

```bash
git add src/pipeline.js
git commit -m "feat: integrate X posting into daily pipeline dispatch"
```

---

### Task 9: End-to-end smoke test

- [ ] **Step 1: Test postTweet directly with a Cal-voice tweet**

Run: `node --input-type=module -e "import { postTweet } from './src/x.js'; await postTweet('the timing is wrong again.');"`

Expected: Tweet posts to @caljakowski. Verify on X.

- [ ] **Step 2: Delete test tweet or keep as first post**

Delete manually from X, or keep it as Cal's first real post.

- [ ] **Step 3: Final commit**

```bash
git commit --allow-empty -m "chore: x integration smoke test passed"
```

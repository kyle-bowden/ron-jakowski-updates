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
  const cardTitle = title || "Intercepted transmissions. Cal logged everything before they changed it.";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta property="og:type" content="article">
  <meta property="og:title" content="${cardTitle}">
  <meta property="og:description" content="${siteName}">
  <meta property="og:url" content="${pageUrl}">
  <meta property="og:image" content="${image}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:site" content="@caljakowski">
  <meta name="twitter:title" content="${cardTitle}">
  <meta name="twitter:description" content="${siteName}">
  <meta name="twitter:image" content="${image}">
  <meta http-equiv="refresh" content="0;url=${pageUrl}">
  <title>${cardTitle}</title>
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
      return fetch(request);
    }
  },
};

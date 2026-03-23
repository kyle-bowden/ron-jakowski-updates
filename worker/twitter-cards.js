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

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildCardPage(storyId, title) {
  const escaped = escapeHtml(title);
  const boardUrl = `https://caljakowski.com/board.html?story=${storyId}`;
  const image = "https://caljakowski.com/res/images/evidence_board-web.jpg";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta property="og:type" content="article">
  <meta property="og:title" content="${escaped}">
  <meta property="og:description" content="Evidence Board — The Reality Protocol">
  <meta property="og:url" content="https://caljakowski.com/story/${storyId}">
  <meta property="og:image" content="${image}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:site" content="@caljakowski">
  <meta name="twitter:title" content="${escaped}">
  <meta name="twitter:description" content="Evidence Board — The Reality Protocol">
  <meta name="twitter:image" content="${image}">
  <title>${escaped}</title>
  <script>window.location.replace("${boardUrl}");</script>
</head>
<body>
  <p>Redirecting to <a href="${boardUrl}">evidence board</a>...</p>
</body>
</html>`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Handle /story/ID path — unique URL per story for X cards
    const storyPathMatch = url.pathname.match(/^\/story\/(\d+)$/);
    if (storyPathMatch) {
      const storyId = storyPathMatch[1];
      try {
        const title = await fetchStoryTitle(storyId, env);
        if (title) {
          return new Response(buildCardPage(storyId, title), {
            headers: { "Content-Type": "text/html; charset=utf-8" },
          });
        }
      } catch {}
      // Fallback: redirect to board
      return Response.redirect(`https://caljakowski.com/board.html?story=${storyId}`, 302);
    }

    // Handle /board.html?story=ID — replace static OG tags with dynamic ones
    const storyId = url.searchParams.get("story");
    if (!storyId || !/^\d+$/.test(storyId)) {
      return fetch(request);
    }

    const [title, originResponse] = await Promise.all([
      fetchStoryTitle(storyId, env).catch(() => null),
      fetch(request),
    ]);

    if (!title) {
      return originResponse;
    }

    const escaped = escapeHtml(title);
    const pageUrl = `https://caljakowski.com/board.html?story=${storyId}`;

    let html = await originResponse.text();
    html = html.replace(
      '<meta property="og:title" content="Evidence Board — The Reality Protocol">',
      `<meta property="og:title" content="${escaped}">`
    );
    html = html.replace(
      '<meta property="og:description" content="Intercepted transmissions. Cal logged everything before they changed it.">',
      `<meta property="og:description" content="Evidence Board — The Reality Protocol">`
    );
    html = html.replace(
      '<meta property="og:url" content="https://caljakowski.com/board.html">',
      `<meta property="og:url" content="${pageUrl}">`
    );
    html = html.replace(
      '<meta name="twitter:title" content="Evidence Board — The Reality Protocol">',
      `<meta name="twitter:title" content="${escaped}">`
    );
    html = html.replace(
      '<meta name="twitter:description" content="Intercepted transmissions. Cal logged everything before they changed it.">',
      `<meta name="twitter:description" content="Evidence Board — The Reality Protocol">`
    );

    return new Response(html, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  },
};

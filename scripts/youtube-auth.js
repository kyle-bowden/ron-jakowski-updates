import "dotenv/config";
import http from "node:http";

const CLIENT_ID = process.env.YOUTUBE_CLIENT_ID;
const CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET;
const REDIRECT = "http://localhost:3000/callback";
const SCOPE = "https://www.googleapis.com/auth/youtube.upload";

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Set YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET in .env first");
  process.exit(1);
}

const authUrl =
  "https://accounts.google.com/o/oauth2/v2/auth?" +
  "client_id=" + CLIENT_ID +
  "&redirect_uri=" + encodeURIComponent(REDIRECT) +
  "&response_type=code" +
  "&scope=" + encodeURIComponent(SCOPE) +
  "&access_type=offline" +
  "&prompt=consent";

console.log("\nOpen this URL in your browser:\n");
console.log(authUrl);
console.log("\nWaiting for callback on http://localhost:3000 ...\n");

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost:3000");
  const code = url.searchParams.get("code");

  if (!code) {
    res.writeHead(400);
    res.end("No authorization code received");
    return;
  }

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT,
        grant_type: "authorization_code",
      }),
    });

    const data = await tokenRes.json();

    if (data.refresh_token) {
      console.log("\n=== Add this to your .env ===\n");
      console.log(`YOUTUBE_REFRESH_TOKEN=${data.refresh_token}`);
      console.log("\n=============================\n");
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end("<h1>Done!</h1><p>Check your terminal for the refresh token. You can close this tab.</p>");
    } else {
      console.error("\nToken response (no refresh_token):", JSON.stringify(data, null, 2));
      res.writeHead(500);
      res.end("Failed — check terminal for details");
    }
  } catch (err) {
    console.error("\nToken exchange failed:", err.message);
    res.writeHead(500);
    res.end("Failed — check terminal");
  }

  setTimeout(() => process.exit(0), 1000);
}).listen(3000);

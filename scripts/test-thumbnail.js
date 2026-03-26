import "dotenv/config";
import { google } from "googleapis";
import { createReadStream } from "node:fs";
import { config } from "../src/config.js";
import { generateThumbnail } from "../src/video.js";

const VIDEO_ID = process.argv[2];
if (!VIDEO_ID) {
  console.error("Usage: node scripts/test-thumbnail.js <youtube-video-id>");
  console.error("Example: node scripts/test-thumbnail.js 3_MIvOaZijw");
  process.exit(1);
}

const oauth2 = new google.auth.OAuth2(config.youtubeClientId, config.youtubeClientSecret);
oauth2.setCredentials({ refresh_token: config.youtubeRefreshToken });
const youtube = google.youtube({ version: "v3", auth: oauth2 });

const thumbPath = await generateThumbnail({
  id: 31,
  post_title: "BLOOD MOON MARCH 3RD!! THE PATTERN IS UNDENIABLE!!",
});

console.log("Thumbnail path:", thumbPath);

if (!thumbPath) {
  console.error("Thumbnail generation failed");
  process.exit(1);
}

try {
  const res = await youtube.thumbnails.set({
    videoId: VIDEO_ID,
    media: { mimeType: "image/jpeg", body: createReadStream(thumbPath) },
  });
  console.log("Success:", JSON.stringify(res.data, null, 2));
} catch (err) {
  console.error("Error code:", err.code);
  console.error("Error message:", err.message);
  if (err.errors) console.error("Errors:", JSON.stringify(err.errors, null, 2));
}

process.exit(0);

import { google } from "googleapis";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { config } from "./config.js";

function getAuthClient() {
  const oauth2 = new google.auth.OAuth2(
    config.youtubeClientId,
    config.youtubeClientSecret
  );
  oauth2.setCredentials({ refresh_token: config.youtubeRefreshToken });
  return oauth2;
}

export async function uploadYouTubeShort(videoPath, story) {
  if (!config.youtubeEnabled) {
    throw new Error("YouTube not configured");
  }

  const fileStat = await stat(videoPath);
  console.log(`[YT] Uploading Short (${(fileStat.size / 1024 / 1024).toFixed(1)}MB): "${story.post_title}"`);

  const auth = getAuthClient();
  const youtube = google.youtube({ version: "v3", auth });

  const title = (story.post_title || "BREAKING").slice(0, 90) + " #Shorts";
  const storyLink = story.id ? `https://caljakowski.com/story/${story.id}` : "https://caljakowski.com";
  const description =
    (story.content_summary || "") +
    `\n\n` +
    `Full evidence: ${storyLink}\n` +
    `\n` +
    `Follow The Reality Protocol:\n` +
    `Telegram: https://t.me/ronjakowski\n` +
    `X: https://x.com/caljakowski\n` +
    `Evidence Board: https://caljakowski.com\n` +
    `\n` +
    `#conspiracy #shorts #caljakowski #theRealityProtocol`;

  const res = await youtube.videos.insert({
    part: ["snippet", "status"],
    requestBody: {
      snippet: {
        title,
        description,
        tags: ["conspiracy", "shorts", "caljakowski", "the reality protocol"],
        categoryId: "25",
      },
      status: {
        privacyStatus: config.youtubePrivacy,
        selfDeclaredMadeForKids: false,
      },
    },
    media: {
      body: createReadStream(videoPath),
    },
  });

  const videoId = res.data.id;
  const videoUrl = `https://youtube.com/shorts/${videoId}`;
  console.log(`[YT] Uploaded: ${videoUrl}`);

  return { videoId, videoUrl };
}

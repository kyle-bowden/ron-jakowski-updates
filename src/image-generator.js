import https from "node:https";
import { config } from "./config.js";
import { openai } from "./openai-client.js";

const API_BASE = "https://api.nanobananaapi.ai";
const REFERENCE_IMAGE_URL = "https://caljakowski.com/res/images/social_media/reference.png";
const POLL_INTERVAL = 5000;
const MAX_POLL_ATTEMPTS = 60; // 5 minutes max
const DUMMY_CALLBACK = "https://caljakowski.com/callback";

function apiRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_BASE);
    const opts = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: {
        Authorization: `Bearer ${config.nanobananaApiKey}`,
        "Content-Type": "application/json",
      },
    };
    const req = https.request(opts, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.code === 200) {
            resolve(parsed);
          } else {
            reject(new Error(`NanoBanana API ${parsed.code}: ${parsed.msg}`));
          }
        } catch {
          reject(new Error(`NanoBanana API parse error: ${data}`));
        }
      });
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollForResult(taskId) {
  for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
    await sleep(POLL_INTERVAL);
    const result = await apiRequest("GET", `/api/v1/nanobanana/record-info?taskId=${encodeURIComponent(taskId)}`);
    const flag = result.data?.successFlag;

    if (flag === 1) {
      const imageUrl = result.data.response?.resultImageUrl || result.data.response?.originImageUrl;
      if (!imageUrl) throw new Error("Task completed but no image URL returned");
      return imageUrl;
    } else if (flag === 2 || flag === 3) {
      throw new Error(`Image generation failed: ${result.data?.errorMessage || "unknown error"}`);
    }
    // flag === 0: still processing, continue polling
  }
  throw new Error("Image generation timed out after 5 minutes");
}

async function generateScenePrompt(glimpseText) {
  const response = await openai.chat.completions.create({
    model: "gpt-5.4-mini",
    temperature: 0.8,
    max_completion_tokens: 150,
    messages: [
      {
        role: "system",
        content: `You convert short personal glimpse texts into visual scene descriptions for image generation. The character is Cal Jakowski — a 64-year-old paranoid conspiracy theorist in GTA V art style. He has wild grey hair, weathered face, green military-style jacket, wrinkled shirt.

Generate a scene description that captures the mood and content of the glimpse. Include:
- What Cal is doing / his pose and expression
- The setting / environment
- Lighting and atmosphere
- Always mention: GTA V loading screen art style, thick black outlines, painterly brush strokes, cinematic composition

Keep it to 2-3 sentences. Output ONLY the scene description, nothing else.`,
      },
      { role: "user", content: glimpseText },
    ],
  });
  return response.choices[0].message.content.trim();
}

function downloadImage(imageUrl) {
  return new Promise((resolve, reject) => {
    https.get(imageUrl, (res) => {
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

export async function generateGlimpseImage(glimpseText) {
  console.log("[Image] Generating scene prompt from glimpse...");
  const scenePrompt = await generateScenePrompt(glimpseText);
  console.log(`[Image] Scene: ${scenePrompt.slice(0, 80)}...`);

  console.log("[Image] Requesting image from NanoBanana...");
  const result = await apiRequest("POST", "/api/v1/nanobanana/generate", {
    prompt: scenePrompt,
    type: "IMAGETOIAMGE",
    imageUrls: [REFERENCE_IMAGE_URL],
    numImages: 1,
    image_size: "1:1",
    callBackUrl: DUMMY_CALLBACK,
  });

  const taskId = result.data?.taskId;
  if (!taskId) throw new Error("No taskId returned from NanoBanana");
  console.log(`[Image] Task ${taskId} — polling for result...`);

  const imageUrl = await pollForResult(taskId);
  console.log(`[Image] Generated: ${imageUrl}`);

  const imageBuffer = await downloadImage(imageUrl);
  console.log(`[Image] Downloaded: ${(imageBuffer.length / 1024).toFixed(0)}KB`);

  return { imageUrl, imageBuffer };
}

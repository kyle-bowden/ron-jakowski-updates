import { ElevenLabsClient } from "elevenlabs";
import { createWriteStream } from "node:fs";
import { copyFile, unlink, mkdir } from "node:fs/promises";
import { join, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { config } from "./config.js";

const TMP_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "tmp");
const OPENCLAW_MEDIA_DIR = join(homedir(), ".openclaw", "media");

const client = new ElevenLabsClient({ apiKey: config.elevenlabsApiKey });

export async function generateVoiceNote(text) {
  await mkdir(TMP_DIR, { recursive: true });
  await mkdir(OPENCLAW_MEDIA_DIR, { recursive: true });

  const filename = `voice-${Date.now()}.ogg`;
  const tmpPath = join(TMP_DIR, filename);
  const mediaPath = join(OPENCLAW_MEDIA_DIR, filename);

  try {
    const audioStream = await client.textToSpeech.convert(
      config.elevenlabsVoiceId,
      {
        text,
        model_id: "eleven_v3",
        output_format: "opus_48000_128",
      }
    );

    const readable =
      audioStream instanceof Readable
        ? audioStream
        : Readable.from(audioStream);

    await pipeline(readable, createWriteStream(tmpPath));
    await copyFile(tmpPath, mediaPath);
    await unlink(tmpPath).catch(() => {});

    return mediaPath;
  } catch (err) {
    await unlink(tmpPath).catch(() => {});
    await unlink(mediaPath).catch(() => {});
    if (err.body) console.error("ElevenLabs error body:", JSON.stringify(err.body, null, 2));
    throw err;
  }
}

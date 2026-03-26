import { ElevenLabsClient } from "elevenlabs";
import { createClient } from "@supabase/supabase-js";
import { createWriteStream } from "node:fs";
import { copyFile, unlink, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { config } from "./config.js";
import { TMP_DIR } from "./media-util.js";
const OPENCLAW_MEDIA_DIR = join(homedir(), ".openclaw", "media");

const client = new ElevenLabsClient({ apiKey: config.elevenlabsApiKey });
const supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey);

export async function generateVoiceNote(text, batchId) {
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

    // Upload to Supabase Storage
    const folder = batchId || "uncategorized";
    const storagePath = `${folder}/${filename}`;
    const fileBuffer = await readFile(mediaPath);

    const { error: uploadError } = await supabase.storage
      .from("voice-notes")
      .upload(storagePath, fileBuffer, {
        contentType: "audio/ogg",
        upsert: false,
      });

    if (uploadError) {
      console.error("Supabase upload failed:", uploadError.message);
      return { localPath: mediaPath, publicUrl: null };
    }

    const { data: urlData } = supabase.storage
      .from("voice-notes")
      .getPublicUrl(storagePath);

    return { localPath: mediaPath, publicUrl: urlData.publicUrl };
  } catch (err) {
    await unlink(tmpPath).catch(() => {});
    await unlink(mediaPath).catch(() => {});
    if (err.body) console.error("ElevenLabs error body:", JSON.stringify(err.body, null, 2));
    throw err;
  }
}

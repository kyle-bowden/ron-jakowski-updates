import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import pg from "pg";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const voiceDir = "/home/kyle-bowden/.openclaw/media";

async function main() {
  // Get stories ordered by id
  const { rows: stories } = await pool.query(
    `SELECT id, batch_id, post_title, voice_url FROM stories ORDER BY id`
  );

  console.log(`Found ${stories.length} stories`);

  // Get the most recent voice files (sorted by timestamp desc), take stories.length
  const fs = await import("node:fs/promises");
  const files = (await fs.readdir(voiceDir))
    .filter((f) => f.startsWith("voice-") && f.endsWith(".ogg"))
    .sort((a, b) => {
      const tsA = parseInt(a.match(/voice-(\d+)/)[1]);
      const tsB = parseInt(b.match(/voice-(\d+)/)[1]);
      return tsB - tsA; // newest first
    })
    .slice(0, stories.length);

  // Reverse so oldest of the batch maps to first story
  files.reverse();

  console.log(`Using ${files.length} most recent voice files`);

  for (let i = 0; i < stories.length; i++) {
    const story = stories[i];
    const file = files[i];
    if (!file) {
      console.log(`  Story ${story.id}: no voice file available`);
      continue;
    }

    const filePath = `${voiceDir}/${file}`;
    const storagePath = `${story.batch_id}/${file}`;

    console.log(`  Uploading ${file} for story ${story.id}: "${story.post_title.slice(0, 50)}..."`);

    const fileBuffer = await readFile(filePath);
    const { error: uploadError } = await supabase.storage
      .from("voice-notes")
      .upload(storagePath, fileBuffer, {
        contentType: "audio/ogg",
        upsert: true,
      });

    if (uploadError) {
      console.error(`    Upload failed: ${uploadError.message}`);
      continue;
    }

    const { data: urlData } = supabase.storage
      .from("voice-notes")
      .getPublicUrl(storagePath);

    await pool.query(`UPDATE stories SET voice_url = $1 WHERE id = $2`, [
      urlData.publicUrl,
      story.id,
    ]);

    console.log(`    OK: ${urlData.publicUrl}`);
  }

  console.log("Done.");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { generateVoiceNote } from "../src/voice.js";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  const { rows: stories } = await pool.query(
    `SELECT id, batch_id, post_title, persona_summary FROM stories ORDER BY id`
  );

  console.log(`Generating voice notes for ${stories.length} stories...\n`);

  for (const story of stories) {
    console.log(`[${story.id}] "${story.post_title.slice(0, 60)}..."`);
    try {
      const { localPath, publicUrl } = await generateVoiceNote(story.persona_summary, story.batch_id);

      if (publicUrl) {
        await pool.query(`UPDATE stories SET voice_url = $1 WHERE id = $2`, [publicUrl, story.id]);
        console.log(`    OK: ${publicUrl}\n`);
      } else {
        console.log(`    Voice generated locally but upload failed\n`);
      }
    } catch (err) {
      console.error(`    FAILED: ${err.message}\n`);
    }
  }

  console.log("Done.");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

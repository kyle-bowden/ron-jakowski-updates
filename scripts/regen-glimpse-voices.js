import "dotenv/config";
import pg from "pg";
import { generateVoiceNote } from "../src/voice.js";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  const { rows: glimpses } = await pool.query(
    `SELECT id, category, text FROM glimpses ORDER BY id`
  );

  console.log(`Generating voice notes for ${glimpses.length} glimpses...\n`);

  for (const glimpse of glimpses) {
    console.log(`[${glimpse.id}] ${glimpse.category}: "${glimpse.text.slice(0, 60)}..."`);
    try {
      const { localPath, publicUrl } = await generateVoiceNote(glimpse.text, 'glimpses');
      if (publicUrl) {
        await pool.query(`UPDATE glimpses SET voice_url = $1 WHERE id = $2`, [publicUrl, glimpse.id]);
        console.log(`    OK: ${publicUrl}\n`);
      } else {
        console.log(`    Voice generated but upload failed\n`);
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

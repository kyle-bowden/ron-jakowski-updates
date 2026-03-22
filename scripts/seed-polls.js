import "dotenv/config";
import { pool, initDb } from "../src/db.js";
import { generatePolls } from "../src/poll-generator.js";

async function main() {
  await initDb();

  const { rows: stories } = await pool.query(`
    SELECT s.id, s.post_title, s.content_summary
    FROM stories s
    LEFT JOIN polls p ON p.story_id = s.id
    WHERE p.id IS NULL
  `);

  if (stories.length === 0) {
    console.log("All stories already have polls.");
    process.exit(0);
  }

  console.log(`Found ${stories.length} stories without polls. Generating...`);
  await generatePolls(stories);
  console.log("Done.");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

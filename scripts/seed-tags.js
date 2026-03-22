import "dotenv/config";
import { pool, initDb } from "../src/db.js";
import { getStoriesWithoutTags } from "../src/store.js";
import { tagStories } from "../src/tagger.js";

async function main() {
  await initDb();

  const stories = await getStoriesWithoutTags();
  if (stories.length === 0) {
    console.log("All stories already have tags.");
    process.exit(0);
  }

  console.log(`Found ${stories.length} stories without tags. Tagging...`);
  await tagStories(stories);
  console.log("Done.");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

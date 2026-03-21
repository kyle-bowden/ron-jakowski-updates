import cron from "node-cron";
import { runPipeline, runDailyPipeline, runScrape, runFromStored, runFromStored_daily } from "./pipeline.js";

const args = process.argv.slice(2);
const command = args[0];

function parseStoryIndex() {
  const flag = args.find((a) => a.startsWith("--story="));
  return flag ? parseInt(flag.split("=")[1], 10) : null;
}

function parseVoiceFile() {
  const flag = args.find((a) => a.startsWith("--voice-file="));
  return flag ? flag.split("=")[1] : null;
}

async function run() {
  switch (command) {
    case "--run-now":
      await runDailyPipeline();
      break;

    case "--run-once":
      await runPipeline();
      process.exit(0);
      break;

    case "--resume":
      await runFromStored_daily();
      break;

    case "--scrape":
      await runScrape();
      process.exit(0);
      break;

    case "--voice":
      await runFromStored({ step: "voice", storyIndex: parseStoryIndex() });
      process.exit(0);
      break;

    case "--send":
      await runFromStored({ step: "send", storyIndex: parseStoryIndex() });
      process.exit(0);
      break;

    case "--send-only":
      await runFromStored({ step: "send-only", storyIndex: parseStoryIndex(), voiceFile: parseVoiceFile() });
      process.exit(0);
      break;

    default:
      cron.schedule("0 6 * * *", async () => {
        try {
          await runDailyPipeline();
        } catch (err) {
          console.error("Scheduled pipeline failed:", err);
        }
      });
      console.log("Scheduler running. Daily scrape at 6:00, messages spread throughout the day.");
      break;
  }
}

try {
  await run();
} catch (err) {
  console.error("Failed:", err);
  process.exit(1);
}

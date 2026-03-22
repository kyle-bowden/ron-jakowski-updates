import cron from "node-cron";
import { initDb } from "./db.js";
import { runPipeline, runDailyPipeline, runScrape, runFromStored, runFromStored_daily, scheduleGlimpses } from "./pipeline.js";
import { generateGlimpse } from "./glimpses.js";

await initDb();

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
      scheduleGlimpses();
      break;

    case "--run-once":
      await runPipeline();
      process.exit(0);
      break;

    case "--resume":
      await runFromStored_daily();
      scheduleGlimpses();
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

    case "--glimpse": {
      const glimpse = await generateGlimpse();
      const { generateVoiceNote } = await import("./voice.js");
      const { sendVoiceNote, sendTextMessage } = await import("./telegram.js");
      const { updateGlimpseVoiceUrl } = await import("./glimpses.js");
      try {
        const { localPath, publicUrl } = await generateVoiceNote(glimpse.text);
        if (publicUrl && glimpse.id) {
          await updateGlimpseVoiceUrl(glimpse.id, publicUrl);
        }
        await sendVoiceNote(localPath);
      } catch (err) {
        console.error("Voice failed, sending text:", err.message);
        await sendTextMessage(glimpse.text);
      }
      console.log("Glimpse sent.");
      process.exit(0);
      break;
    }

    default: {
      // On startup, check if today's pipeline needs to run
      const { getTodaySchedule } = await import("./store.js");
      const existing = await getTodaySchedule();
      if (!existing) {
        console.log("No schedule for today. Running daily pipeline now...");
        try {
          await runDailyPipeline();
          scheduleGlimpses();
        } catch (err) {
          console.error("Startup pipeline failed:", err);
        }
      } else {
        const pending = existing.entries.filter((e) => !e.sent);
        if (pending.length > 0) {
          console.log(`Resuming today's schedule (${pending.length} pending)...`);
          await runFromStored_daily();
          scheduleGlimpses();
        } else {
          console.log("Today's schedule is complete. Waiting for tomorrow's 6am run.");
        }
      }

      cron.schedule("0 6 * * *", async () => {
        try {
          await runDailyPipeline();
          scheduleGlimpses();
        } catch (err) {
          console.error("Scheduled pipeline failed:", err);
        }
      });
      console.log("Scheduler running. Daily scrape at 6:00, stories + Cal glimpses spread throughout the day.");
      break;
    }
  }
}

try {
  await run();
} catch (err) {
  console.error("Failed:", err);
  process.exit(1);
}

import { unlink } from "node:fs/promises";
import { scrapeStories } from "./scraper.js";
import {
  saveStories,
  loadStories,
  getTodaySchedule,
  createTodaySchedule,
  markEntrySent,
  updateStoryVoiceUrl,
  publishStory,
} from "./store.js";
import { tagStories } from "./tagger.js";
import { generatePolls } from "./poll-generator.js";
import { generateVoiceNote } from "./voice.js";
import { sendSequence, sendTextMessage, sendVoiceNote } from "./telegram.js";
import { generateGlimpse, updateGlimpseVoiceUrl } from "./glimpses.js";
import { postTweet, postTweetWithImage } from "./x.js";
import { config } from "./config.js";

function pickRandom(stories) {
  return stories[Math.floor(Math.random() * stories.length)];
}

function generateSendTimes(count, startHour = 7, endHour = 24) {
  const now = new Date();
  const start = new Date(now);
  start.setHours(startHour, 0, 0, 0);
  const end = new Date(now);
  end.setHours(endHour, 0, 0, 0);

  const startMs = Math.max(start.getTime(), now.getTime());
  const endMs = end.getTime();
  if (startMs >= endMs || count <= 0) return [];

  // Divide the remaining window into equal slots, then jitter within each
  const slotSize = (endMs - startMs) / count;
  const times = [];

  for (let i = 0; i < count; i++) {
    const slotStart = startMs + i * slotSize;
    const slotEnd = slotStart + slotSize;
    // Place randomly within the middle 70% of the slot to avoid edge clustering
    const padding = slotSize * 0.15;
    const time = new Date(slotStart + padding + Math.random() * (slotSize - padding * 2));
    if (time.getTime() <= endMs) times.push(time);
  }

  return times.sort((a, b) => a - b);
}

export async function runScrape() {
  console.log("Scraping stories...");
  const stories = await scrapeStories();
  console.log(`Scraped ${stories.length} stories`);
  const { batchId, ids } = await saveStories(stories);
  console.log(`Stored batch ${batchId}`);

  // Attach IDs to stories for downstream use
  const storiesWithIds = stories.map((s, i) => ({ ...s, id: ids[i], batchId }));

  await Promise.all([
    tagStories(storiesWithIds).catch(err => console.error("Tagging failed (non-fatal):", err.message)),
    generatePolls(storiesWithIds).catch(err => console.error("Poll generation failed (non-fatal):", err.message)),
  ]);

  return storiesWithIds;
}

export async function runVoice(story) {
  console.log(`Generating voice for: ${story.post_title}`);
  const result = await generateVoiceNote(story.persona_summary, story.batchId);
  console.log(`Voice note generated: ${result.localPath}`);
  if (result.publicUrl) console.log(`Uploaded to: ${result.publicUrl}`);
  return result;
}

export async function runSend(story, voicePath) {
  if (voicePath) {
    await sendSequence(story, voicePath);
  } else {
    console.log("No voice note, sending text only");
    for (const msg of story.text_messages) {
      await sendTextMessage(msg);
    }
  }
  console.log("Messages sent");
}

async function prepareScheduleFromStored() {
  const stories = await loadStories();
  if (!stories.length) {
    throw new Error("No stored stories. Run --scrape first or add stories to data/stories.json.");
  }
  return prepareScheduleFromStories(stories);
}

async function prepareNewSchedule() {
  const stories = await runScrape();
  return prepareScheduleFromStories(stories);
}

async function prepareScheduleFromStories(stories) {
  console.log(`\nGenerating voice notes for all ${stories.length} stories...`);

  const entries = [];
  const sendTimes = generateSendTimes(stories.length);

  for (let i = 0; i < stories.length; i++) {
    const story = stories[i];
    let voicePath = null;
    try {
      const voiceResult = await runVoice(story);
      voicePath = voiceResult.localPath;
      if (voiceResult.publicUrl && story.id) {
        await updateStoryVoiceUrl(story.id, voiceResult.publicUrl);
      }
    } catch (err) {
      console.error(`Voice generation failed for "${story.post_title}":`, err.message);
    }

    entries.push({
      story,
      voicePath,
      sendAt: sendTimes[i] ? sendTimes[i].toISOString() : null,
      sent: false,
      sentAt: null,
    });
  }

  const schedule = await createTodaySchedule(entries);
  console.log(`Schedule saved for ${schedule.date}`);
  return schedule;
}

function schedulePendingEntries(schedule) {
  const pending = schedule.entries
    .map((entry, index) => ({ ...entry, index }))
    .filter((e) => !e.sent && e.sendAt);

  if (pending.length === 0) {
    console.log("All messages for today have been sent.");
    return;
  }

  console.log(`\n${pending.length} message(s) pending:`);

  for (const entry of pending) {
    const sendTime = new Date(entry.sendAt);
    const delay = sendTime.getTime() - Date.now();
    const label = `"${entry.story.post_title}"`;

    if (delay <= 0) {
      console.log(`  ${label} — overdue, sending now`);
      dispatchSend(entry, schedule);
    } else {
      console.log(`  ${label} — ${sendTime.toLocaleTimeString()} (in ${Math.round(delay / 60000)} min)`);
      setTimeout(() => dispatchSend(entry, schedule), delay);
    }
  }

  console.log(`\nMessages will send between now and midnight.`);
}

function findNextSendTime(schedule, currentIndex) {
  const future = schedule.entries
    .filter((e, i) => i !== currentIndex && !e.sent && e.sendAt)
    .map((e) => new Date(e.sendAt))
    .filter((d) => d.getTime() > Date.now())
    .sort((a, b) => a - b);

  return future.length > 0 ? future[0] : null;
}

function formatTime(date) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

async function postToX(story) {
  if (!config.xEnabled) {
    console.log("[X] X credentials not configured, skipping");
    return;
  }

  const xPosts = story.x_posts || [];
  if (xPosts.length === 0) {
    console.log("[X] No x_posts for this story, skipping");
    return;
  }

  // Use first available x_post + append deeplink to evidence card
  const deeplink = story.id ? `\n\nhttps://caljakowski.com/story/${story.id}` : "";
  const text = xPosts[0] + deeplink;

  // Check for image-like media links
  const imageExts = [".jpg", ".jpeg", ".png", ".gif", ".webp"];
  const imageUrl = (story.media_links || []).find((url) =>
    imageExts.some((ext) => url.toLowerCase().split("?")[0].endsWith(ext))
  );

  if (imageUrl) {
    await postTweetWithImage(text, imageUrl);
  } else {
    await postTweet(text);
  }
}

async function dispatchSend(entry, schedule) {
  try {
    console.log(`\n[${new Date().toISOString()}] Sending: ${entry.story.post_title}`);
    await runSend(entry.story, entry.voicePath);
    await markEntrySent(schedule.id, entry.index);
    if (entry.story.id) {
      await publishStory(entry.story.id);
      console.log(`Published story ${entry.story.id}`);
    }
    console.log(`Marked entry ${entry.index} as sent`);

    try {
      await postToX(entry.story);
    } catch (err) {
      console.error(`[X] Tweet failed (non-fatal): ${err.message}`);
    }

    const nextTime = findNextSendTime(schedule, entry.index);
    if (nextTime) {
      await sendTextMessage(`...next drop incoming at ${formatTime(nextTime)}. stay alert.`);
      console.log(`Teased next drop at ${formatTime(nextTime)}`);
    } else {
      await sendTextMessage("...that's all I got for today. stay vigilant. they're always watching.");
      console.log("Sent end-of-day message");
    }
  } catch (err) {
    console.error(`Send failed for "${entry.story.post_title}":`, err.message);
  }
}

async function startSchedule(prepareFn, label) {
  console.log(`[${new Date().toISOString()}] ${label}...`);

  const existing = await getTodaySchedule();
  if (existing) {
    const sentCount = existing.entries.filter((e) => e.sent).length;
    console.log(`Found existing schedule for today (${sentCount}/${existing.entries.length} sent)`);
    schedulePendingEntries(existing);
    return;
  }

  const schedule = await prepareFn();
  schedulePendingEntries(schedule);
}

export async function runDailyPipeline() {
  return startSchedule(prepareNewSchedule, "Daily pipeline starting");
}

export async function runFromStored_daily() {
  return startSchedule(prepareScheduleFromStored, "Running from stored stories");
}

// Single-story pipeline for --run-once
export async function runPipeline() {
  console.log(`[${new Date().toISOString()}] Pipeline starting...`);
  let voicePath = null;

  try {
    const stories = await runScrape();
    const selected = pickRandom(stories);
    console.log(`Selected: ${selected.post_title}`);

    try {
      const voiceResult = await runVoice(selected);
      voicePath = voiceResult.localPath;
      if (voiceResult.publicUrl && selected.id) {
        await updateStoryVoiceUrl(selected.id, voiceResult.publicUrl);
      }
    } catch (err) {
      console.error("Voice generation failed, sending text only:", err.message);
    }

    await runSend(selected, voicePath);
    console.log(`[${new Date().toISOString()}] Pipeline complete`);
  } finally {
    if (voicePath) {
      await unlink(voicePath).catch(() => {});
    }
  }
}

export function scheduleGlimpses() {
  const count = Math.random() < 0.5 ? 1 : 2;
  const times = generateSendTimes(count, 9, 21);

  if (times.length === 0) {
    console.log("No valid glimpse times remaining today.");
    return;
  }

  console.log(`\nScheduling ${times.length} Cal glimpse(s):`);

  for (const time of times) {
    const delay = time.getTime() - Date.now();
    if (delay <= 0) {
      dispatchGlimpse();
    } else {
      console.log(`  Glimpse at ${time.toLocaleTimeString()} (in ${Math.round(delay / 60000)} min)`);
      setTimeout(dispatchGlimpse, delay);
    }
  }
}

async function dispatchGlimpse() {
  try {
    console.log(`\n[${new Date().toISOString()}] Sending Cal glimpse...`);
    const glimpse = await generateGlimpse();

    let voicePath = null;
    try {
      const voiceResult = await generateVoiceNote(glimpse.text);
      voicePath = voiceResult.localPath;
      if (voiceResult.publicUrl && glimpse.id) {
        await updateGlimpseVoiceUrl(glimpse.id, voiceResult.publicUrl);
      }
      console.log(`Glimpse voice generated: ${voicePath}`);
    } catch (err) {
      console.error("Glimpse voice generation failed, sending text only:", err.message);
    }

    if (voicePath) {
      await sendVoiceNote(voicePath);
    } else {
      await sendTextMessage(glimpse.text);
    }

    console.log(`Glimpse sent: ${glimpse.text}`);

    // Post glimpse to X (strip performance cues — they don't work as text on X)
    try {
      if (config.xEnabled) {
        const xText = glimpse.text.replace(/\[.*?\]\s*/g, "").trim();
        if (xText) await postTweet(xText);
      }
    } catch (err) {
      console.error(`[X] Glimpse tweet failed (non-fatal): ${err.message}`);
    }
  } catch (err) {
    console.error("Glimpse failed:", err.message);
  }
}

export async function runFromStored({ step, storyIndex, voiceFile }) {
  const stories = await loadStories();
  if (!stories.length) {
    throw new Error("No stored stories. Run --scrape first.");
  }

  const selected =
    storyIndex != null ? stories[storyIndex] : pickRandom(stories);

  if (!selected) {
    throw new Error(`No story at index ${storyIndex}. ${stories.length} stories stored.`);
  }

  console.log(`Using story: ${selected.post_title}`);

  let voicePath = voiceFile || null;
  let generated = false;

  try {
    if (!voicePath && (step === "voice" || step === "send")) {
      const voiceResult = await runVoice(selected);
      voicePath = voiceResult.localPath;
      generated = true;
    }

    if (step === "send" || step === "send-only") {
      if (voicePath) console.log(`Using voice file: ${voicePath}`);
      await runSend(selected, voicePath);
    }
  } finally {
    if (generated && voicePath && step !== "voice") {
      await unlink(voicePath).catch(() => {});
    }
  }
}

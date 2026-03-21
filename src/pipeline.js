import { unlink } from "node:fs/promises";
import { scrapeStories } from "./scraper.js";
import {
  saveStories,
  loadStories,
  getTodaySchedule,
  createTodaySchedule,
  markEntrySent,
} from "./store.js";
import { generateVoiceNote } from "./voice.js";
import { sendSequence, sendTextMessage } from "./telegram.js";

function pickRandom(stories) {
  return stories[Math.floor(Math.random() * stories.length)];
}

function randomTimeBetween(startHour, endHour) {
  const now = new Date();
  const start = new Date(now);
  start.setHours(startHour, 0, 0, 0);
  const end = new Date(now);
  end.setHours(endHour, 0, 0, 0);

  const startMs = Math.max(start.getTime(), now.getTime());
  const endMs = end.getTime();

  if (startMs >= endMs) return null;

  return new Date(startMs + Math.random() * (endMs - startMs));
}

function generateSendTimes(count, startHour = 7, endHour = 22) {
  const times = [];
  for (let i = 0; i < count; i++) {
    const time = randomTimeBetween(startHour, endHour);
    if (time) times.push(time);
  }
  return times.sort((a, b) => a - b);
}

export async function runScrape() {
  console.log("Scraping stories...");
  const stories = await scrapeStories();
  console.log(`Scraped ${stories.length} stories`);
  const { batchId } = await saveStories(stories);
  console.log(`Stored batch ${batchId}`);
  return stories;
}

export async function runVoice(story) {
  console.log(`Generating voice for: ${story.post_title}`);
  const voicePath = await generateVoiceNote(story.persona_summary);
  console.log(`Voice note generated: ${voicePath}`);
  return voicePath;
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
      voicePath = await runVoice(story);
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

  console.log(`\nMessages will send between now and 22:00.`);
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

async function dispatchSend(entry, schedule) {
  try {
    console.log(`\n[${new Date().toISOString()}] Sending: ${entry.story.post_title}`);
    await runSend(entry.story, entry.voicePath);
    await markEntrySent(entry.index);
    console.log(`Marked entry ${entry.index} as sent`);

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

export async function runDailyPipeline() {
  console.log(`[${new Date().toISOString()}] Daily pipeline starting...`);

  const existing = await getTodaySchedule();

  if (existing) {
    const sentCount = existing.entries.filter((e) => e.sent).length;
    console.log(`Found existing schedule for today (${sentCount}/${existing.entries.length} sent)`);
    schedulePendingEntries(existing);
    return;
  }

  const schedule = await prepareNewSchedule();
  schedulePendingEntries(schedule);
}

export async function runFromStored_daily() {
  console.log(`[${new Date().toISOString()}] Running from stored stories...`);

  const existing = await getTodaySchedule();
  if (existing) {
    const sentCount = existing.entries.filter((e) => e.sent).length;
    console.log(`Found existing schedule for today (${sentCount}/${existing.entries.length} sent)`);
    schedulePendingEntries(existing);
    return;
  }

  const schedule = await prepareScheduleFromStored();
  schedulePendingEntries(schedule);
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
      voicePath = await runVoice(selected);
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
      voicePath = await runVoice(selected);
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

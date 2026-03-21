import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { join, dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");
const STORIES_FILE = join(DATA_DIR, "stories.json");
const SCHEDULE_FILE = join(DATA_DIR, "schedule.json");

async function ensureDataDir() {
  await mkdir(DATA_DIR, { recursive: true });
}

export async function loadStories() {
  try {
    const raw = await readFile(STORIES_FILE, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
}

export async function saveStories(newStories) {
  await ensureDataDir();

  const existing = await loadStories();
  const batchId = randomUUID();
  const createdAt = new Date().toISOString();

  const entries = newStories.map((story) => ({
    ...story,
    batchId,
    createdAt,
  }));

  const all = [...existing, ...entries];

  const tmpFile = STORIES_FILE + ".tmp";
  await writeFile(tmpFile, JSON.stringify(all, null, 2));
  await rename(tmpFile, STORIES_FILE);

  return { batchId, count: entries.length };
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export async function loadSchedule() {
  try {
    const raw = await readFile(SCHEDULE_FILE, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}

export async function saveSchedule(schedule) {
  await ensureDataDir();
  const tmpFile = SCHEDULE_FILE + ".tmp";
  await writeFile(tmpFile, JSON.stringify(schedule, null, 2));
  await rename(tmpFile, SCHEDULE_FILE);
}

export async function getTodaySchedule() {
  const schedule = await loadSchedule();
  if (!schedule || schedule.date !== todayKey()) return null;
  return schedule;
}

export async function createTodaySchedule(entries) {
  const schedule = {
    date: todayKey(),
    createdAt: new Date().toISOString(),
    entries,
  };
  await saveSchedule(schedule);
  return schedule;
}

export async function markEntrySent(index) {
  const schedule = await loadSchedule();
  if (!schedule || !schedule.entries[index]) return;
  schedule.entries[index].sent = true;
  schedule.entries[index].sentAt = new Date().toISOString();
  await saveSchedule(schedule);
}

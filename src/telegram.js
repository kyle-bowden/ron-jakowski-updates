import { exec as execCb } from "node:child_process";
import { promisify } from "node:util";
import { config } from "./config.js";

const exec = promisify(execCb);
const TIMEOUT = 30_000;

function delay(min, max) {
  return new Promise((resolve) =>
    setTimeout(resolve, min + Math.random() * (max - min))
  );
}

function shellEscape(str) {
  return "'" + str.replace(/'/g, "'\\''") + "'";
}

export async function sendTextMessage(text) {
  const cmd = `openclaw message send --channel telegram --target ${shellEscape(config.telegramTarget)} --message ${shellEscape(text)}`;
  const { stdout, stderr } = await exec(cmd, { timeout: TIMEOUT });
  if (stderr) console.error("openclaw stderr:", stderr);
  return stdout;
}

export async function sendVoiceNote(filePath) {
  const cmd = `openclaw message send --channel telegram --target ${shellEscape(config.telegramTarget)} --media ${shellEscape(filePath)}`;
  const { stdout, stderr } = await exec(cmd, { timeout: TIMEOUT });
  if (stderr) console.error("openclaw stderr:", stderr);
  return stdout;
}

export async function sendSequence(story, voicePath) {
  const msgs = story.text_messages;

  for (let i = 0; i < msgs.length; i++) {
    await sendTextMessage(msgs[i]);

    if (i < msgs.length - 1) {
      // Early messages: longer gaps (building tension)
      // Later messages: shorter gaps (getting frantic)
      const progress = i / (msgs.length - 1);
      const minDelay = 60_000 - progress * 45_000;   // 60s → 15s
      const maxDelay = 180_000 - progress * 140_000;  // 180s → 40s
      await delay(minDelay, maxDelay);
    }
  }

  // Longer pause before the voice note — like Cal recording it
  await delay(120_000, 300_000); // 2-5 minutes
  await sendVoiceNote(voicePath);
}

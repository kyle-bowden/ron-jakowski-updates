import { exec as execCb } from "node:child_process";
import { promisify } from "node:util";
import { config } from "./config.js";

const exec = promisify(execCb);
const TIMEOUT = 30_000;

function randomDelay(min = 2000, max = 4000) {
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
  for (const msg of story.text_messages) {
    await sendTextMessage(msg);
    await randomDelay();
  }

  await randomDelay(1000, 3000);
  await sendVoiceNote(voicePath);
}

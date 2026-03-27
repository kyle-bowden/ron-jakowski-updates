import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, unlink, writeFile, rm } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { TMP_DIR, isImageUrl, downloadBuffer } from "./media-util.js";

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const BG_IMAGE = join(__dirname, "..", "res", "images", "evidence_board-web.jpg");
const BG_MUSIC = join(__dirname, "..", "res", "media", "cal-yt-short-music.mp3");
const BG_AMBIENCE = join(__dirname, "..", "res", "media", "cal-yt-ambience.mp3");
const ICON_TELEGRAM = join(__dirname, "..", "res", "images", "icon-telegram.png");
const ICON_X = join(__dirname, "..", "res", "images", "icon-x.png");
const ICON_GLOBE = join(__dirname, "..", "res", "images", "icon-globe.png");

const YT_REGEX = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/;

function extractYouTubeId(url) {
  const match = url.match(YT_REGEX);
  return match ? match[1] : null;
}

async function getAudioDuration(audioPath) {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v", "quiet",
    "-show_entries", "format=duration",
    "-of", "csv=p=0",
    audioPath,
  ]);
  return parseFloat(stdout.trim());
}

async function downloadMedia(mediaLinks, mediaDir) {
  await mkdir(mediaDir, { recursive: true });

  const urls = [];
  for (const link of mediaLinks) {
    const url = typeof link === "string" ? link : link?.value || "";
    if (!url) continue;

    if (isImageUrl(url)) {
      urls.push(url);
    } else {
      const ytId = extractYouTubeId(url);
      if (ytId) {
        urls.push(`https://img.youtube.com/vi/${ytId}/hqdefault.jpg`);
      }
    }
  }

  const results = await Promise.allSettled(
    urls.slice(0, 10).map(async (url, i) => {
      const buf = await downloadBuffer(url);
      if (buf.length < 1000) return null;
      const ext = url.split("?")[0].split(".").pop().toLowerCase() || "jpg";
      const filePath = join(mediaDir, `img-${i}.${ext}`);
      await writeFile(filePath, buf);
      return filePath;
    })
  );

  const downloaded = [];
  for (let i = 0; i < results.length; i++) {
    if (results[i].status === "fulfilled" && results[i].value) {
      downloaded.push(results[i].value);
    } else if (results[i].status === "rejected") {
      console.warn(`[Video] Failed to download media ${i}: ${results[i].reason.message}`);
    }
  }

  return downloaded;
}

function wrapText(text, maxChars) {
  const words = text.split(" ");
  const lines = [];
  let current = "";
  for (const word of words) {
    if (current.length + word.length + 1 > maxChars) {
      lines.push(current);
      current = word;
    } else {
      current = current ? current + " " + word : word;
    }
  }
  if (current) lines.push(current);
  return lines.join("\n");
}

function escapeDrawtext(text) {
  return text
    .replace(/\\/g, "\\\\\\\\")
    .replace(/'/g, "\u2019")
    .replace(/:/g, "\\:")
    .replace(/%/g, "%%")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");
}

const INTRO_DURATION = 7;
const OUTRO_DURATION = 6;

function buildIntroLines(storyId, title) {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, ".");
  const time = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/New_York" });
  const shortTitle = escapeDrawtext((title || "UNKNOWN").slice(0, 28).toUpperCase());
  const logNum = String(storyId || Math.floor(Math.random() * 999)).padStart(3, "0");

  return [
    { text: `> FIELD LOG #${logNum}`, delay: 0.0 },
    { text: `> ${date} // ${time.replace(":", "\\:")}`, delay: 0.8 },
    { text: `> SUBJ\\: ${shortTitle}`, delay: 1.6 },
    { text: `> CLEARANCE\\: REDACTED`, delay: 2.8 },
    { text: `> \\[REC ●\\]`, delay: 3.5 },
  ];
}

function addTypewriterText(filters, lastLabel, text, prefix, startTime, endTime, x, y, fontcolor, fontsize, typeSpeed = 0.04) {
  const chars = text;
  const typeEnd = startTime + chars.length * typeSpeed;

  // Reveal characters one by one
  for (let c = 1; c <= chars.length; c++) {
    const partial = chars.slice(0, c);
    const charStart = startTime + (c - 1) * typeSpeed;
    const charEnd = c < chars.length ? startTime + c * typeSpeed : endTime;
    const label = `${prefix}_${c}`;
    filters.push(
      `[${lastLabel}]drawtext=text='${partial}':` +
      `fontcolor=${fontcolor}:fontsize=${fontsize}:` +
      `x=${x}:y=${y}:` +
      `font=Courier:line_spacing=8:` +
      `enable='between(t,${charStart.toFixed(3)},${charEnd.toFixed(3)})'[${label}]`
    );
    lastLabel = label;
  }

  return lastLabel;
}

const INTRO_FONT_SIZE = 38;

function addTypewriterLine(filters, lastLabel, line, lineIndex, yPos, introDuration) {
  lastLabel = addTypewriterText(
    filters, lastLabel, line.text, `type${lineIndex}`,
    line.delay, introDuration, 80, yPos, "0x33ff33", INTRO_FONT_SIZE
  );

  // Blinking cursor after typing finishes
  const typeEnd = line.delay + line.text.length * 0.04;
  const cursorLabel = `cursor${lineIndex}`;
  filters.push(
    `[${lastLabel}]drawtext=text='_':` +
    `fontcolor=0x33ff33:fontsize=${INTRO_FONT_SIZE}:` +
    `x=80+text_w:y=${yPos}:` +
    `font=Courier:` +
    `enable='lt(mod(t,0.8),0.5)*between(t,${typeEnd.toFixed(3)},${introDuration.toFixed(3)})'[${cursorLabel}]`
  );
  lastLabel = cursorLabel;

  return lastLabel;
}

function buildFiltergraph(images, voiceDuration, title, messages, storyId, iconStartIdx) {
  const filters = [];
  let lastLabel = "bg";
  const totalDuration = INTRO_DURATION + voiceDuration + OUTRO_DURATION;

  // Background: evidence board image scaled/cropped to fill 1080x1920, with dark overlay
  filters.push(
    `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,` +
    `crop=1080:1920,format=pix_fmts=yuv420p,` +
    `colorbalance=bs=-0.3:gs=-0.3:rs=-0.3[bgraw]`
  );
  filters.push(
    `[bgraw]drawbox=x=0:y=0:w=1080:h=1920:color=black@0.7:t=fill[bg]`
  );

  // === INTRO: typewriter terminal lines ===
  const introLines = buildIntroLines(storyId, title);
  const introStartY = 600;
  const introLineSpacing = 80;

  for (let i = 0; i < introLines.length; i++) {
    const yPos = introStartY + i * introLineSpacing;
    lastLabel = addTypewriterLine(filters, lastLabel, introLines[i], i, yPos, INTRO_DURATION);
  }

  // === MAIN CONTENT (offset by INTRO_DURATION) ===
  const offset = INTRO_DURATION;

  // Media images with Ken Burns zoom
  if (images.length > 0) {
    const perImage = Math.max(3, voiceDuration / images.length);

    for (let i = 0; i < images.length; i++) {
      const start = offset + i * perImage;
      const end = Math.min(offset + (i + 1) * perImage, totalDuration);
      const inputIdx = i + 4; // 0 is background, 1 is voice, 2 is music, 3 is ambience

      // Scale image to fit within 900x900 box, maintain aspect, pad to center, smooth Ken Burns zoom
      const frameDuration = Math.ceil((end - start) * 30);
      const zoomIncrement = (0.08 / frameDuration).toFixed(6);
      filters.push(
        `[${inputIdx}:v]format=pix_fmts=yuva420p,` +
        `scale=900:900:force_original_aspect_ratio=decrease,` +
        `pad=900:900:(ow-iw)/2:(oh-ih)/2:color=0x0a0a0a,` +
        `zoompan=z='min(zoom+${zoomIncrement},1.08)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':` +
        `d=${frameDuration}:s=900x900:fps=30[img${i}]`
      );

      const nextLabel = `v${i}`;
      filters.push(
        `[${lastLabel}][img${i}]overlay=(W-w)/2:(H-h)/2-100:` +
        `enable='between(t,${start.toFixed(2)},${end.toFixed(2)})'[${nextLabel}]`
      );
      lastLabel = nextLabel;
    }
  }

  // Title overlay — white for max contrast
  const wrappedTitle = escapeDrawtext(wrapText(title, 34));
  lastLabel = addTypewriterText(
    filters, lastLabel, wrappedTitle, "title",
    offset, totalDuration, "(w-text_w)/2", 80, "white", 48, 0.03
  );

  // Subtitle overlays — above YouTube bottom UI zone (safe above y=1420)
  if (messages.length > 0) {
    const perMsg = voiceDuration / messages.length;
    for (let i = 0; i < messages.length; i++) {
      const start = offset + i * perMsg;
      const end = Math.min(offset + (i + 1) * perMsg, totalDuration);
      const rawMsg = (typeof messages[i] === "string" ? messages[i] : messages[i]?.value || "")
        .replace(/https?:\/\/\S+/g, "").replace(/\s{2,}/g, " ").trim();
      if (!rawMsg) continue;
      const msgText = escapeDrawtext(wrapText(rawMsg, 30));
      lastLabel = addTypewriterText(
        filters, lastLabel, msgText, `sub${i}`,
        start, end, "(w-text_w)/2", "h-580", "0xcccccc", 42, 0.03
      );
    }
  }

  // === OUTRO: social handles with icons ===
  const outroStart = INTRO_DURATION + voiceDuration;

  // Dark overlay for outro to separate from main content
  filters.push(
    `[${lastLabel}]drawbox=x=0:y=0:w=1080:h=1920:color=black@0.7:t=fill:` +
    `enable='gte(t,${outroStart})'[outrobg]`
  );
  lastLabel = "outrobg";

  // "FOLLOW THE PROTOCOL" header
  lastLabel = addTypewriterText(
    filters, lastLabel, "FOLLOW THE PROTOCOL", "outrohdr",
    outroStart + 0.3, totalDuration, "(w-text_w)/2", 500, "white", 48, 0.04
  );

  // Icon overlays (Telegram, X, Globe) — appear alongside text
  const iconY = [700, 870, 1040];
  const iconInputs = [iconStartIdx, iconStartIdx + 1, iconStartIdx + 2]; // telegram, x, globe

  for (let i = 0; i < 3; i++) {
    const appear = outroStart + 1.2 + i * 0.8;
    const lbl = `icon${i}`;
    filters.push(
      `[${iconInputs[i]}:v]scale=80:80[${lbl}scaled]`
    );
    filters.push(
      `[${lastLabel}][${lbl}scaled]overlay=180:${iconY[i]}:enable='gte(t,${appear.toFixed(2)})'[${lbl}placed]`
    );
    lastLabel = `${lbl}placed`;
  }

  // Handle text — typewriter next to each icon
  const handles = [
    { text: "@ronjakowski", prefix: "outtg" },
    { text: "@caljakowski", prefix: "outx" },
    { text: "caljakowski.com", prefix: "outweb" },
  ];

  for (let i = 0; i < handles.length; i++) {
    const appear = outroStart + 1.2 + i * 0.8;
    const textY = iconY[i] + 20; // vertically center with icon
    lastLabel = addTypewriterText(
      filters, lastLabel, handles[i].text, handles[i].prefix,
      appear + 0.2, totalDuration, 290, textY, "white", 44, 0.04
    );
  }

  // Scanline overlay
  let scanLabel = lastLabel;
  const scanlineCount = 20;
  const spacing = Math.floor(1920 / scanlineCount);
  for (let i = 0; i < scanlineCount; i++) {
    const y = i * spacing;
    const next = `scan${i}`;
    filters.push(
      `[${scanLabel}]drawbox=x=0:y=${y}:w=1080:h=1:color=black@0.12:t=fill[${next}]`
    );
    scanLabel = next;
  }
  filters.push(`[${scanLabel}]copy[out]`);

  return filters.join(";\n");
}

export async function generateShort(story, voicePath) {
  const storyId = story.id || Date.now();
  const timestamp = Date.now();
  const mediaDir = join(TMP_DIR, `media-${storyId}-${timestamp}`);
  const outputPath = join(TMP_DIR, `short-${storyId}-${timestamp}.mp4`);

  await mkdir(TMP_DIR, { recursive: true });

  // Check ffmpeg is available
  try {
    await execFileAsync("ffmpeg", ["-version"]);
  } catch {
    console.warn("[Video] ffmpeg not found, skipping video generation");
    return null;
  }

  console.log(`[Video] Generating Short for "${story.post_title}"...`);

  // Get audio duration
  const duration = await getAudioDuration(voicePath);
  if (!duration || duration > 180) {
    console.warn(`[Video] Audio duration ${duration}s — ${!duration ? "invalid" : "exceeds 3 minute limit"}, skipping`);
    return null;
  }

  // Download media
  const images = await downloadMedia(story.media_links || [], mediaDir);
  console.log(`[Video] Downloaded ${images.length} media images`);

  // Build ffmpeg command
  const totalDuration = INTRO_DURATION + duration + OUTRO_DURATION;
  const iconStartIdx = 4 + images.length; // after bg(0), voice(1), music(2), ambience(3), images(4+)
  const filtergraph = buildFiltergraph(
    images,
    duration,
    story.post_title || "BREAKING",
    story.text_messages || [],
    story.id,
    iconStartIdx
  );

  const args = [];

  // Input 0: background image
  args.push("-loop", "1", "-i", BG_IMAGE);

  // Input 1: voice narration
  args.push("-i", voicePath);

  // Input 2: background music
  args.push("-i", BG_MUSIC);

  // Input 3: ambience (looped)
  args.push("-stream_loop", "-1", "-i", BG_AMBIENCE);

  // Input 4+: media images
  for (const img of images) {
    args.push("-loop", "1", "-i", img);
  }

  // Icon inputs for outro
  args.push("-i", ICON_TELEGRAM);
  args.push("-i", ICON_X);
  args.push("-i", ICON_GLOBE);

  // Mix voice (delayed), music, and looped ambience
  const audioFilter =
    `[1:a]adelay=${INTRO_DURATION * 1000}|${INTRO_DURATION * 1000},volume=1.0,apad=whole_dur=${totalDuration.toFixed(2)}[voice];` +
    `[2:a]volume=0.15[music];` +
    `[3:a]volume=0.25[ambience];` +
    `[voice][music][ambience]amix=inputs=3:duration=first[aout]`;

  // Write filtergraph to file to avoid E2BIG (arg list too long)
  const filterScriptPath = join(TMP_DIR, `filter-${storyId}-${timestamp}.txt`);
  await writeFile(filterScriptPath, filtergraph + ";\n" + audioFilter);

  args.push(
    "-filter_complex_script", filterScriptPath,
    "-map", "[out]",
    "-map", "[aout]",
    "-c:v", "libx264",
    "-preset", "medium",
    "-crf", "23",
    "-c:a", "aac",
    "-b:a", "128k",
    "-t", totalDuration.toFixed(2),
    "-movflags", "+faststart",
    "-y",
    outputPath
  );

  try {
    await execFileAsync("ffmpeg", args, { timeout: 600000, maxBuffer: 10 * 1024 * 1024 });
    console.log(`[Video] Short generated: ${outputPath}`);

    await unlink(filterScriptPath).catch(() => {});
    await rm(mediaDir, { recursive: true, force: true }).catch(() => {});

    return outputPath;
  } catch (err) {
    console.error(`[Video] ffmpeg failed: ${err.message}`);
    if (err.stderr) console.error(`[Video] stderr: ${err.stderr.slice(0, 500)}`);
    await unlink(filterScriptPath).catch(() => {});
    await rm(mediaDir, { recursive: true, force: true }).catch(() => {});
    await unlink(outputPath).catch(() => {});
    throw err;
  }
}

export async function generateThumbnail(story) {
  const storyId = story.id || Date.now();
  const outputPath = join(TMP_DIR, `thumb-${storyId}-${Date.now()}.jpg`);
  await mkdir(TMP_DIR, { recursive: true });

  const title = escapeDrawtext(wrapText((story.post_title || "BREAKING").toUpperCase(), 12));

  const filtergraph = [
    // Background — heavy dark overlay
    `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,` +
    `colorbalance=bs=-0.4:gs=-0.4:rs=-0.4[bgraw]`,
    `[bgraw]drawbox=x=0:y=0:w=1080:h=1920:color=black@0.75:t=fill[bg]`,

    // Red urgency bars — top and bottom
    `[bg]drawbox=x=0:y=0:w=1080:h=14:color=red:t=fill[bar1]`,
    `[bar1]drawbox=x=0:y=1906:w=1080:h=14:color=red:t=fill[bars]`,

    // "CLASSIFIED" — top area
    `[bars]drawtext=text='CLASSIFIED':fontcolor=red:fontsize=130:` +
    `x=(w-text_w)/2:y=160:font=Courier[stamp]`,

    // Red separator
    `[stamp]drawbox=x=100:y=340:w=880:h=4:color=red@0.5:t=fill[sep1]`,

    // Dark panel behind title for contrast
    `[sep1]drawbox=x=60:y=420:w=960:h=600:color=black@0.5:t=fill[panel]`,

    // Title — white for max contrast at small sizes
    `[panel]drawtext=text='${title}':fontcolor=white:fontsize=88:` +
    `x=(w-text_w)/2:y=480:font=Courier:line_spacing=24[titled]`,

    `[titled]copy[out]`,
  ].join(";\n");

  const args = [
    "-loop", "1", "-i", BG_IMAGE,
    "-filter_complex", filtergraph,
    "-map", "[out]",
    "-frames:v", "1",
    "-q:v", "2",
    "-y",
    outputPath,
  ];

  try {
    await execFileAsync("ffmpeg", args, { timeout: 30000, maxBuffer: 10 * 1024 * 1024 });
    console.log(`[Video] Thumbnail generated: ${outputPath}`);
    return outputPath;
  } catch (err) {
    console.error(`[Video] Thumbnail generation failed: ${err.message}`);
    await unlink(outputPath).catch(() => {});
    return null;
  }
}

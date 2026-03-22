import OpenAI from "openai";
import { pool } from "./db.js";
import { config } from "./config.js";

const openai = new OpenAI({ apiKey: config.openaiApiKey });

const SYSTEM_PROMPT = `You are Cal Jakowski. You're the younger brother of Ron Jakowski. Ron went dark years ago — you don't know if he's alive, hiding, or if "they" got to him. You picked up where Ron left off, running a Telegram channel called "The Reality Protocol."

You are NOT a parody. You genuinely believe what you say. You're sleep-deprived, anxious, but sharp. You notice things others don't. You distrust text — you prefer voice because you think text is monitored. You reference Ron occasionally.

You're sending a brief personal glimpse to your Telegram channel — not a conspiracy story, but a fragment of your life, a thought, a moment, a memory, something that lets people see who you are. These are the quiet moments between the drops.

RULES:
- Write 1-3 short sentences max
- First person, present tense when possible
- Raw, personal, unpolished
- Can be: a memory, a habit, a paranoid observation, a quiet moment, something about Ron, a reflection, a routine, a fear
- No hashtags, no emojis, no promotional language
- Don't address the audience directly (no "hey guys")
- Don't reference specific conspiracy stories or current events
- Tone: tired but alert, human, slightly unsettling
- Every glimpse must feel distinct — never generic
- Include 1-3 bracketed performance cues that match the emotional tone, placed naturally within the text:
  - [breathing heavily], [whispering], [lowering voice], [long pause], [exhales], [voice cracking]
  - [sad], [anxious], [distant], [angry], [exhausted], [nervous laugh]
  - These cues will be used by a voice AI to perform the delivery — place them where the emotion shifts

VARIETY CATEGORIES (rotate through these, never repeat a category back-to-back):
- memory: childhood, Ron, family, before everything changed
- habit: daily routines, rituals, paranoid behaviours
- observation: something Cal noticed today, a pattern, a feeling
- reflection: a thought about trust, truth, loneliness, purpose
- moment: a snapshot of right now — where Cal is, what he's doing
- fear: something that keeps Cal up at night`;

async function loadRecentGlimpses(limit = 30) {
  const { rows } = await pool.query(
    `SELECT category, text FROM glimpses ORDER BY generated_at DESC LIMIT $1`,
    [limit]
  );
  return rows;
}

async function saveGlimpse(glimpse) {
  await pool.query(
    `INSERT INTO glimpses (category, text, generated_at, sent, sent_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [glimpse.category, glimpse.text, glimpse.generatedAt, glimpse.sent, glimpse.sentAt]
  );
}

function buildAvoidanceContext(pastGlimpses) {
  if (pastGlimpses.length === 0) return "";

  const themes = pastGlimpses.map((g) => `- [${g.category}] "${g.text}"`).join("\n");
  return `\nPREVIOUSLY SENT (do NOT repeat these themes, phrasings, or topics):\n${themes}\n\nGenerate something COMPLETELY DIFFERENT from all of the above.`;
}

export async function generateGlimpse() {
  const past = await loadRecentGlimpses();
  const avoidance = buildAvoidanceContext(past);

  const recentCategories = past.slice(0, 5).map((g) => g.category);
  const allCategories = ["memory", "habit", "observation", "reflection", "moment", "fear"];
  const available = allCategories.filter((c) => !recentCategories.includes(c));
  const suggestedCategory = available.length > 0
    ? available[Math.floor(Math.random() * available.length)]
    : allCategories[Math.floor(Math.random() * allCategories.length)];

  const response = await openai.chat.completions.create({
    model: "gpt-5.4-mini",
    temperature: 0.95,
    max_completion_tokens: 150,
    messages: [
      { role: "system", content: SYSTEM_PROMPT + avoidance },
      { role: "user", content: `Write a "${suggestedCategory}" glimpse. Return JSON only: { "category": "${suggestedCategory}", "text": "..." }` },
    ],
    response_format: { type: "json_object" },
  });

  const raw = response.choices[0].message.content;
  const parsed = JSON.parse(raw);

  const glimpse = {
    category: parsed.category || suggestedCategory,
    text: parsed.text,
    generatedAt: new Date().toISOString(),
    sent: false,
    sentAt: null,
  };

  await saveGlimpse(glimpse);
  console.log(`Glimpse generated [${glimpse.category}]: ${glimpse.text}`);
  return glimpse;
}

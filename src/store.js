import { randomUUID } from "node:crypto";
import { pool } from "./db.js";

export async function loadStories() {
  const { rows } = await pool.query(
    `SELECT *, text_messages::jsonb as text_messages FROM stories ORDER BY created_at DESC`
  );
  return rows.map(rowToStory);
}

export async function saveStories(newStories) {
  const batchId = randomUUID();

  const ids = [];
  for (const story of newStories) {
    const { rows } = await pool.query(
      `INSERT INTO stories (batch_id, post_title, post_title_citation, content_summary, content_summary_citation,
        text_messages, persona_summary, persona_summary_citation, discussion_link, discussion_link_citation)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        batchId,
        story.post_title,
        story.post_title_citation || null,
        story.content_summary,
        story.content_summary_citation || null,
        JSON.stringify(story.text_messages),
        story.persona_summary,
        story.persona_summary_citation || null,
        story.discussion_link,
        story.discussion_link_citation || null,
      ]
    );
    ids.push(rows[0].id);
  }

  return { batchId, count: newStories.length, ids };
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

export async function getTodaySchedule() {
  const { rows } = await pool.query(
    `SELECT id FROM schedules WHERE schedule_date = $1`,
    [todayDate()]
  );

  if (rows.length === 0) return null;

  const scheduleId = rows[0].id;
  const { rows: entries } = await pool.query(
    `SELECT * FROM schedule_entries WHERE schedule_id = $1 ORDER BY entry_index`,
    [scheduleId]
  );

  return {
    id: scheduleId,
    date: todayDate(),
    entries: entries.map((e) => ({
      story: e.story,
      voicePath: e.voice_path,
      sendAt: e.send_at ? e.send_at.toISOString() : null,
      sent: e.sent,
      sentAt: e.sent_at ? e.sent_at.toISOString() : null,
      index: e.entry_index,
    })),
  };
}

export async function createTodaySchedule(entries) {
  const { rows } = await pool.query(
    `INSERT INTO schedules (schedule_date) VALUES ($1) RETURNING id`,
    [todayDate()]
  );

  const scheduleId = rows[0].id;

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    await pool.query(
      `INSERT INTO schedule_entries (schedule_id, entry_index, story, voice_path, send_at, sent)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        scheduleId,
        i,
        JSON.stringify(e.story),
        e.voicePath || null,
        e.sendAt || null,
        false,
      ]
    );
  }

  return { id: scheduleId, date: todayDate(), entries };
}

export async function markEntrySent(index) {
  const schedule = await getTodaySchedule();
  if (!schedule) return;

  await pool.query(
    `UPDATE schedule_entries SET sent = TRUE, sent_at = NOW()
     WHERE schedule_id = $1 AND entry_index = $2`,
    [schedule.id, index]
  );
}

export async function updateStoryVoiceUrl(storyId, url) {
  await pool.query(`UPDATE stories SET voice_url = $2 WHERE id = $1`, [storyId, url]);
}

export async function saveStoryTags(storyId, tagNames) {
  for (const name of tagNames) {
    await pool.query(`INSERT INTO tags (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`, [name]);
    const { rows } = await pool.query(`SELECT id FROM tags WHERE name = $1`, [name]);
    const tagId = rows[0].id;
    await pool.query(
      `INSERT INTO story_tags (story_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [storyId, tagId]
    );
  }
}

export async function getExistingTags() {
  const { rows } = await pool.query(`SELECT id, name, color FROM tags`);
  return rows;
}

export async function getStoriesWithoutTags() {
  const { rows } = await pool.query(
    `SELECT s.* FROM stories s LEFT JOIN story_tags st ON s.id = st.story_id WHERE st.story_id IS NULL`
  );
  return rows.map(rowToStory);
}

function rowToStory(row) {
  return {
    id: row.id,
    post_title: row.post_title,
    post_title_citation: row.post_title_citation,
    content_summary: row.content_summary,
    content_summary_citation: row.content_summary_citation,
    text_messages: typeof row.text_messages === "string" ? JSON.parse(row.text_messages) : row.text_messages,
    persona_summary: row.persona_summary,
    persona_summary_citation: row.persona_summary_citation,
    discussion_link: row.discussion_link,
    discussion_link_citation: row.discussion_link_citation,
    voice_url: row.voice_url || null,
    batchId: row.batch_id,
    createdAt: row.created_at,
  };
}

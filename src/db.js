import pg from "pg";
import { config } from "./config.js";

const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  ssl: config.databaseUrl.includes("supabase") ? { rejectUnauthorized: false } : false,
});

export async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS stories (
      id SERIAL PRIMARY KEY,
      batch_id UUID NOT NULL,
      post_title TEXT NOT NULL,
      post_title_citation TEXT,
      content_summary TEXT NOT NULL,
      content_summary_citation TEXT,
      text_messages JSONB NOT NULL DEFAULT '[]',
      media_links JSONB NOT NULL DEFAULT '[]',
      persona_summary TEXT NOT NULL,
      persona_summary_citation TEXT,
      discussion_link TEXT NOT NULL,
      discussion_link_citation TEXT,
      voice_url TEXT,
      published BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS schedules (
      id SERIAL PRIMARY KEY,
      schedule_date DATE NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS schedule_entries (
      id SERIAL PRIMARY KEY,
      schedule_id INTEGER NOT NULL REFERENCES schedules(id),
      entry_index INTEGER NOT NULL,
      story JSONB NOT NULL,
      voice_path TEXT,
      send_at TIMESTAMPTZ,
      sent BOOLEAN NOT NULL DEFAULT FALSE,
      sent_at TIMESTAMPTZ,
      UNIQUE(schedule_id, entry_index)
    );

    CREATE TABLE IF NOT EXISTS glimpses (
      id SERIAL PRIMARY KEY,
      category TEXT NOT NULL,
      text TEXT NOT NULL,
      generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      sent BOOLEAN NOT NULL DEFAULT FALSE,
      sent_at TIMESTAMPTZ,
      voice_url TEXT
    );

    CREATE TABLE IF NOT EXISTS tags (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      color TEXT DEFAULT '#cc0000'
    );

    CREATE TABLE IF NOT EXISTS story_tags (
      story_id INTEGER NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
      tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (story_id, tag_id)
    );

    CREATE TABLE IF NOT EXISTS polls (
      id SERIAL PRIMARY KEY,
      story_id INTEGER NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
      question TEXT NOT NULL,
      options JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS poll_votes (
      id SERIAL PRIMARY KEY,
      poll_id INTEGER NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
      option_index INTEGER NOT NULL,
      voter_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(poll_id, voter_hash)
    );
  `);

  console.log("Database initialized");
}

export { pool };

export async function closeDb() {
  await pool.end();
}

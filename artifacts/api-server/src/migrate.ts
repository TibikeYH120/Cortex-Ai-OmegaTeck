import { pool } from "@workspace/db";

const STARTUP_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  bio TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS conversations (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  guest_session_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);
`;

const ALTER_SQL = `
ALTER TABLE users ADD COLUMN IF NOT EXISTS system_about TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS system_respond TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS image_data TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS image_attachment TEXT;
`;

export async function runStartupMigrations(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(STARTUP_SQL);
    await client.query(ALTER_SQL);
  } finally {
    client.release();
  }
}

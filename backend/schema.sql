-- Database Schema for Chat Application
-- Run this in your Neon PostgreSQL console

-- ─── USERS ───────────────────────────────────────────────────────────────────
-- Usernames are NOT unique — multiple accounts can share the same display name.
-- Each account is uniquely identified by its UUID.
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username      VARCHAR(50)  NOT NULL,          -- no UNIQUE constraint
  email         VARCHAR(255) NOT NULL,           -- no UNIQUE constraint
  password_hash TEXT,
  is_admin      BOOLEAN DEFAULT FALSE,           -- admin flag
  approved      BOOLEAN DEFAULT FALSE,           -- approval status
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- If upgrading an existing DB, drop the old unique constraints:
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_username_key;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS approved BOOLEAN DEFAULT FALSE;

-- ─── ROOMS ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rooms (
  id          BIGSERIAL PRIMARY KEY,
  name        VARCHAR(50) UNIQUE NOT NULL,
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed the default room (idempotent)
INSERT INTO rooms (name) VALUES ('Secret') ON CONFLICT (name) DO NOTHING;

-- Rename 'general' to 'Secret' if it exists
UPDATE rooms SET name = 'Secret' WHERE name = 'general';

-- ─── MESSAGES ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id           BIGSERIAL PRIMARY KEY,
  room_id      VARCHAR(100) NOT NULL,
  sender_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content      TEXT NOT NULL,
  message_type VARCHAR(20) DEFAULT 'text',
  created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for fast paginated queries
CREATE INDEX IF NOT EXISTS idx_messages_room_created ON messages(room_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_sender       ON messages(sender_id);

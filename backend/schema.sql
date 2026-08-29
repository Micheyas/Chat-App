-- Database Schema for Chat Application
-- Run this in your Neon PostgreSQL console for a fresh database.
-- Existing databases should also run migrate.js through migrate-v4.js.

-- ─── USERS ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username      VARCHAR(50)  NOT NULL,
  email         VARCHAR(255) NOT NULL,
  password_hash TEXT,
  is_admin      BOOLEAN DEFAULT FALSE,
  approved      BOOLEAN DEFAULT FALSE,
  last_seen     TIMESTAMP WITH TIME ZONE,
  avatar_url    TEXT,
  bio           VARCHAR(280),
  updated_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS approved BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen TIMESTAMP WITH TIME ZONE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio VARCHAR(280);
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Usernames are unique (login looks up by username).
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_username_unique;
ALTER TABLE users ADD CONSTRAINT users_username_unique UNIQUE (username);

-- ─── ROOMS ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rooms (
  id          BIGSERIAL PRIMARY KEY,
  name        VARCHAR(50) UNIQUE NOT NULL,
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

INSERT INTO rooms (name) VALUES ('Secret') ON CONFLICT (name) DO NOTHING;
UPDATE rooms SET name = 'Secret' WHERE name = 'general';

-- ─── MESSAGES ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id           BIGSERIAL PRIMARY KEY,
  room_id      VARCHAR(100) NOT NULL,
  sender_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content      TEXT NOT NULL,
  message_type VARCHAR(20) DEFAULT 'text',
  reply_to_id  BIGINT REFERENCES messages(id) ON DELETE SET NULL,
  edited       BOOLEAN DEFAULT FALSE,
  deleted      BOOLEAN DEFAULT FALSE,
  created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_id BIGINT REFERENCES messages(id) ON DELETE SET NULL;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS edited BOOLEAN DEFAULT FALSE;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_messages_room_created ON messages(room_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_sender       ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_search ON messages USING GIN (to_tsvector('simple', content));

-- ─── MESSAGE REACTIONS ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS message_reactions (
  id           BIGSERIAL PRIMARY KEY,
  message_id   BIGINT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reaction     VARCHAR(10) NOT NULL,
  created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(message_id, user_id, reaction)
);
CREATE INDEX IF NOT EXISTS idx_message_reactions_message ON message_reactions(message_id);

-- ─── DIRECT MESSAGES ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conversations (
  id              BIGSERIAL PRIMARY KEY,
  user_a          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_message    TEXT,
  last_message_at TIMESTAMP WITH TIME ZONE,
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_a, user_b)
);
CREATE INDEX IF NOT EXISTS idx_conv_users ON conversations(user_a, user_b);

CREATE TABLE IF NOT EXISTS dm_messages (
  id           BIGSERIAL PRIMARY KEY,
  conv_id      BIGINT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id    UUID   NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content      TEXT NOT NULL,
  message_type VARCHAR(20) DEFAULT 'text',
  reply_to_id  BIGINT REFERENCES dm_messages(id) ON DELETE SET NULL,
  edited       BOOLEAN DEFAULT FALSE,
  deleted      BOOLEAN DEFAULT FALSE,
  created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dm_conv ON dm_messages(conv_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dm_messages_search ON dm_messages USING GIN (to_tsvector('simple', content));

ALTER TABLE dm_messages ADD COLUMN IF NOT EXISTS edited BOOLEAN DEFAULT FALSE;
ALTER TABLE dm_messages ADD COLUMN IF NOT EXISTS deleted BOOLEAN DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS dm_message_reactions (
  id            BIGSERIAL PRIMARY KEY,
  dm_message_id BIGINT NOT NULL REFERENCES dm_messages(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reaction      VARCHAR(10) NOT NULL,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(dm_message_id, user_id, reaction)
);
CREATE INDEX IF NOT EXISTS idx_dm_message_reactions_message ON dm_message_reactions(dm_message_id);

-- ─── READ RECEIPTS ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dm_read_receipts (
  conv_id      BIGINT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_id BIGINT,
  read_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (conv_id, user_id)
);

CREATE TABLE IF NOT EXISTS room_read_receipts (
  room_id      VARCHAR(100) NOT NULL,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_id BIGINT,
  read_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (room_id, user_id)
);

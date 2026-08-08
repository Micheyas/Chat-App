/**
 * migrate-v2.js — DM system, reply support, unique usernames
 * Usage: node migrate-v2.js
 */
const pool = require('./db');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('Running v2 migration…');

    // 1. Unique username — deduplicate first
    // Find usernames with duplicates and keep only the newest account
    const { rows: dupes } = await client.query(`
      SELECT username FROM users
      GROUP BY username HAVING COUNT(*) > 1
    `);
    for (const { username } of dupes) {
      // Keep the most recent approved one (or just most recent)
      const { rows } = await client.query(
        'SELECT id FROM users WHERE username = $1 ORDER BY approved DESC, created_at DESC',
        [username]
      );
      // Delete all but the first
      const toDelete = rows.slice(1).map(r => r.id);
      if (toDelete.length > 0) {
        await client.query('DELETE FROM users WHERE id = ANY($1)', [toDelete]);
        console.log(`  deduplicated username: ${username}`);
      }
    }
    // Add unique constraint
    await client.query(`
      ALTER TABLE users
      DROP CONSTRAINT IF EXISTS users_username_unique
    `);
    await client.query(`
      ALTER TABLE users
      ADD CONSTRAINT users_username_unique UNIQUE (username)
    `);
    console.log('✓ unique username constraint');

    // 2. reply_to_id on messages
    await client.query(`
      ALTER TABLE messages
      ADD COLUMN IF NOT EXISTS reply_to_id BIGINT REFERENCES messages(id) ON DELETE SET NULL
    `);
    console.log('✓ reply_to_id on messages');

    // 3. DM conversations table
    await client.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id              BIGSERIAL PRIMARY KEY,
        user_a          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        user_b          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        last_message    TEXT,
        last_message_at TIMESTAMP WITH TIME ZONE,
        created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(user_a, user_b)
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_conv_users ON conversations(user_a, user_b)
    `);
    console.log('✓ conversations table');

    // 4. DM messages table
    await client.query(`
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
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_dm_conv ON dm_messages(conv_id, created_at DESC)
    `);
    console.log('✓ dm_messages table');

    console.log('\n✅ v2 migration completed.');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();

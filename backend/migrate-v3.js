/**
 * migrate-v3.js — Read receipts + unread counts
 * Usage: node migrate-v3.js
 */
const pool = require('./db');
require('dotenv').config();

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('Running v3 migration…');

    // 1. DM message read receipts — track when receiver last read a conversation
    await client.query(`
      CREATE TABLE IF NOT EXISTS dm_read_receipts (
        conv_id    BIGINT  NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        user_id    UUID    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        last_read_id BIGINT,   -- id of the last dm_message the user has seen
        read_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        PRIMARY KEY (conv_id, user_id)
      )
    `);
    console.log('✓ dm_read_receipts table');

    // 2. Room message read receipts
    await client.query(`
      CREATE TABLE IF NOT EXISTS room_read_receipts (
        room_id    VARCHAR(100) NOT NULL,
        user_id    UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        last_read_id BIGINT,
        read_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        PRIMARY KEY (room_id, user_id)
      )
    `);
    console.log('✓ room_read_receipts table');

    console.log('\n✅ v3 migration completed.');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();

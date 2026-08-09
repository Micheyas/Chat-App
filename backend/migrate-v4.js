const pool = require('./db');
require('dotenv').config();

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('Running v4 migration…');

    await client.query(`
      ALTER TABLE messages
      ADD COLUMN IF NOT EXISTS reply_to_id BIGINT REFERENCES messages(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS edited BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS deleted BOOLEAN DEFAULT FALSE
    `);
    console.log('✓ messages reply_to_id / edited / deleted columns');

    await client.query(`
      CREATE TABLE IF NOT EXISTS message_reactions (
        id           BIGSERIAL PRIMARY KEY,
        message_id   BIGINT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        reaction     VARCHAR(10) NOT NULL,
        created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(message_id, user_id, reaction)
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_message_reactions_message ON message_reactions(message_id)`);
    console.log('✓ message_reactions table');

    await client.query(`
      ALTER TABLE dm_messages
      ADD COLUMN IF NOT EXISTS edited BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS deleted BOOLEAN DEFAULT FALSE
    `);
    console.log('✓ dm_messages edited / deleted columns');

    await client.query(`
      CREATE TABLE IF NOT EXISTS dm_message_reactions (
        id           BIGSERIAL PRIMARY KEY,
        dm_message_id BIGINT NOT NULL REFERENCES dm_messages(id) ON DELETE CASCADE,
        user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        reaction     VARCHAR(10) NOT NULL,
        created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(dm_message_id, user_id, reaction)
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_dm_message_reactions_message ON dm_message_reactions(dm_message_id)`);
    console.log('✓ dm_message_reactions table');

    console.log('\n✅ v4 migration completed.');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();

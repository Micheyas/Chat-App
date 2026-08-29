// Adds profile fields and search indexes for existing databases.
// Run once after deploying this version: node migrate-v5.js
require('dotenv').config();
const pool = require('./db');

async function migrate() {
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS bio VARCHAR(280);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    CREATE INDEX IF NOT EXISTS idx_messages_search
      ON messages USING GIN (to_tsvector('simple', content));
    CREATE INDEX IF NOT EXISTS idx_dm_messages_search
      ON dm_messages USING GIN (to_tsvector('simple', content));
  `);
  console.log('Migration v5 complete');
}

migrate()
  .catch((err) => { console.error('Migration v5 failed:', err); process.exitCode = 1; })
  .finally(() => pool.end());

/**
 * migrate.js — run once to apply schema changes to an existing database.
 * Usage: node migrate.js
 */
const pool = require('./db');
require('dotenv').config();

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('Running migrations…');

    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT`);
    console.log('✓ users.password_hash');

    // Drop unique constraints so duplicate usernames are allowed
    await client.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_username_key`);
    await client.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key`);
    console.log('✓ dropped unique constraints on username / email');

    await client.query(`
      CREATE TABLE IF NOT EXISTS rooms (
        id          BIGSERIAL PRIMARY KEY,
        name        VARCHAR(50) UNIQUE NOT NULL,
        created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    console.log('✓ rooms table');

    await client.query(`INSERT INTO rooms (name) VALUES ('general') ON CONFLICT (name) DO NOTHING`);
    console.log('✓ default "general" room');

    console.log('\nAll migrations completed successfully.');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();

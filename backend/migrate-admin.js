/**
 * migrate-admin.js — Add admin approval system and create admin account
 * Usage: node migrate-admin.js
 */
const pool = require('./db');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('Running admin approval migration…');

    // Add is_admin and approved columns
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE`);
    console.log('✓ users.is_admin column added');

    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS approved BOOLEAN DEFAULT FALSE`);
    console.log('✓ users.approved column added');

    // Approve all existing users (so they can still log in)
    await client.query(`UPDATE users SET approved = TRUE WHERE approved = FALSE`);
    console.log('✓ Existing users approved');

    // Rename 'general' room to 'Secret'
    await client.query(`UPDATE rooms SET name = 'Secret' WHERE name = 'general'`);
    console.log('✓ Room renamed: general → Secret');

    // Create admin account
    const adminUsername = 'Micheyas2M';
    const adminPassword = 'Micheyas@.3346';
    const passwordHash = await bcrypt.hash(adminPassword, 12);

    const result = await client.query(
      `INSERT INTO users (username, email, password_hash, is_admin, approved)
       VALUES ($1, $2, $3, TRUE, TRUE)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [adminUsername, `${adminUsername}@admin.local`, passwordHash]
    );

    if (result.rows.length > 0) {
      console.log(`✓ Admin account created: ${adminUsername}`);
    } else {
      console.log(`✓ Admin account already exists: ${adminUsername}`);
    }

    console.log('\n✅ Admin approval migration completed successfully.');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();

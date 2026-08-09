const { Pool } = require('pg');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL;

function buildPoolConfig(connStr) {
  if (!connStr) return {};
  try {
    const url = new URL(connStr);
    const cfg = {
      user: decodeURIComponent(url.username) || undefined,
      password: decodeURIComponent(url.password) || undefined,
      host: url.hostname,
      port: url.port ? Number(url.port) : undefined,
      database: url.pathname && url.pathname.startsWith('/') ? url.pathname.slice(1) : undefined,
      ssl: connStr.includes('neon.tech') ? { rejectUnauthorized: false } : false,
    };
    return cfg;
  } catch (err) {
    return { connectionString: connStr };
  }
}

const pool = new Pool(buildPoolConfig(connectionString));

// Test database connection
pool.on('connect', () => {
  console.log('Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('Unexpected database error:', err);
  process.exit(-1);
});

module.exports = pool;

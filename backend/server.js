const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('./db');

require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET === 'changeme_use_env_var' || JWT_SECRET === 'replace_with_a_long_random_secret_string') {
  console.error('JWT_SECRET is missing or still set to the example value. Set a long random secret in backend/.env');
  process.exit(1);
}

const MAX_MESSAGE_LENGTH = 8000;
const DEFAULT_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://localhost',
  'http://localhost',
  'capacitor://localhost',
];
const extraOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const allowedOrigins = [...new Set([...DEFAULT_ORIGINS, ...extraOrigins])];

function isAllowedOrigin(origin) {
  if (!origin) return true;
  return allowedOrigins.includes(origin);
}

const authAttempts = new Map();
function allowAuthAttempt(ip) {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const rec = authAttempts.get(ip);
  if (!rec || now - rec.start > windowMs) {
    authAttempts.set(ip, { count: 1, start: now });
    return true;
  }
  rec.count += 1;
  return rec.count <= 20;
}

// Keep the local limiter bounded. For multi-instance deployments set REDIS_URL
// and place a shared rate limiter in front of the service (see DEPLOYMENT.md).
const authAttemptCleanup = setInterval(() => {
  const cutoff = Date.now() - (15 * 60 * 1000);
  for (const [ip, record] of authAttempts) {
    if (record.start < cutoff) authAttempts.delete(ip);
  }
}, 15 * 60 * 1000);
authAttemptCleanup.unref();

function parseLimit(raw, fallback = 30) {
  const n = parseInt(raw, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(Math.max(n, 1), 100);
}

const app = express();
app.set('trust proxy', 1);

// Minimal security headers without adding another production dependency.
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=()');
  next();
});

const corsOptions = {
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) return callback(null, true);
    callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));

// Handle preflight for every route (Express 5 compatible — no wildcard string)
app.options(/.*/, cors(corsOptions));

app.use(express.json({ limit: '1mb' }));

// ─── AUTH MIDDLEWARE ──────────────────────────────────────────────────────────
function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  try {
    const token = header.slice(7);
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ─── ADMIN MIDDLEWARE ─────────────────────────────────────────────────────────
function adminMiddleware(req, res, next) {
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────
app.get('/', (_req, res) => res.send('Chat App Backend is running'));

// Used by hosting providers to distinguish a running process from a usable app.
app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.status(200).json({ status: 'ok', database: 'connected' });
  } catch (err) {
    console.error('Health check failed:', err.message);
    res.status(503).json({ status: 'unavailable', database: 'disconnected' });
  }
});

// ─── AUTH ROUTES ──────────────────────────────────────────────────────────────

// POST /api/register — unique username enforced
app.post('/api/register', async (req, res) => {
  if (!allowAuthAttempt(req.ip)) {
    return res.status(429).json({ error: 'Too many attempts. Try again later.' });
  }
  const { username, password } = req.body;
  if (!username?.trim() || !password?.trim()) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  if (!/^[a-zA-Z0-9_.-]{2,50}$/.test(username.trim())) {
    return res.status(400).json({ error: 'Username must be 2-50 characters and use only letters, numbers, dots, dashes, or underscores' });
  }
  if (password.length < 10) {
    return res.status(400).json({ error: 'Password must be at least 10 characters' });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      `INSERT INTO users (username, email, password_hash, approved)
       VALUES ($1, $2, $3, FALSE) RETURNING id, username, approved`,
      [username.trim(), `${username.trim()}_${Date.now()}@chat.local`, passwordHash]
    );
    const user = result.rows[0];
    res.status(201).json({
      message: 'Registration successful. Waiting for admin approval.',
      username: user.username,
      userId: user.id,
      approved: user.approved
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Username already taken' });
    }
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// POST /api/login
app.post('/api/login', async (req, res) => {
  if (!allowAuthAttempt(req.ip)) {
    return res.status(429).json({ error: 'Too many attempts. Try again later.' });
  }
  const { username, password } = req.body;
  if (!username?.trim() || !password?.trim()) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  try {
    const result = await pool.query(
      'SELECT id, username, password_hash, approved, is_admin FROM users WHERE username = $1',
      [username.trim()]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    const user = result.rows[0];

    if (!user.password_hash || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    if (!user.approved) {
      return res.status(403).json({ error: 'Account pending admin approval' });
    }

    const token = jwt.sign(
      { userId: user.id, username: user.username, isAdmin: user.is_admin },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ token, username: user.username, userId: user.id, isAdmin: user.is_admin });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST /api/demo — one-click demo account, auto-approved, no password needed.
// Usernames are random (guest_xxxxxx) so demo visitors never collide.
app.post('/api/demo', async (req, res) => {
  if (!allowAuthAttempt(req.ip)) {
    return res.status(429).json({ error: 'Too many attempts. Try again later.' });
  }
  try {
    const suffix = Math.random().toString(36).slice(2, 8);
    const username = `guest_${suffix}`;
    const passwordHash = await bcrypt.hash(require('crypto').randomUUID(), 12);
    const result = await pool.query(
      `INSERT INTO users (username, email, password_hash, approved)
       VALUES ($1, $2, $3, TRUE) RETURNING id, username`,
      [username, `${username}@demo.local`, passwordHash]
    );
    const user = result.rows[0];
    const token = jwt.sign(
      { userId: user.id, username: user.username, isAdmin: false },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.status(201).json({ token, username: user.username, userId: user.id, isAdmin: false, demo: true });
  } catch (err) {
    console.error('Demo error:', err);
    res.status(500).json({ error: 'Demo login failed' });
  }
});

// Clean up demo accounts older than 7 days so the users table doesn't fill up.
const demoCleanup = setInterval(async () => {
  try {
    await pool.query(
      `DELETE FROM users WHERE username LIKE 'guest!_%' ESCAPE '!' AND created_at < NOW() - INTERVAL '7 days'`
    );
  } catch (err) {
    console.error('Demo cleanup error:', err.message);
  }
}, 24 * 60 * 60 * 1000);
demoCleanup.unref();

// ─── ADMIN ROUTES ─────────────────────────────────────────────────────────────

// GET /api/admin/pending-users — list all users waiting for approval
app.get('/api/admin/pending-users', authMiddleware, adminMiddleware, async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, username, email, created_at 
       FROM users 
       WHERE approved = FALSE 
       ORDER BY created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error('Failed to fetch pending users:', err);
    res.status(500).json({ error: 'Failed to fetch pending users' });
  }
});

// POST /api/admin/approve/:userId — approve a pending user
app.post('/api/admin/approve/:userId', authMiddleware, adminMiddleware, async (req, res) => {
  const { userId } = req.params;

  try {
    const { rows } = await pool.query(
      `UPDATE users SET approved = TRUE WHERE id = $1 RETURNING id, username, approved`,
      [userId]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: 'User approved', user: rows[0] });
  } catch (err) {
    console.error('Failed to approve user:', err);
    res.status(500).json({ error: 'Failed to approve user' });
  }
});

// DELETE /api/admin/reject/:userId — reject/delete a pending user
app.delete('/api/admin/reject/:userId', authMiddleware, adminMiddleware, async (req, res) => {
  const { userId } = req.params;

  try {
    const { rows } = await pool.query(
      `DELETE FROM users WHERE id = $1 AND approved = FALSE RETURNING id, username`,
      [userId]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found or already approved' });
    }

    res.json({ message: 'User rejected', user: rows[0] });
  } catch (err) {
    console.error('Failed to reject user:', err);
    res.status(500).json({ error: 'Failed to reject user' });
  }
});

// ─── USERS ROUTES ─────────────────────────────────────────────────────────────

// GET /api/users/last-seen — returns last_seen for all users (NULL = currently online)
app.get('/api/users/last-seen', authMiddleware, async (_req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT username, last_seen FROM users WHERE approved = TRUE ORDER BY username ASC'
    );
    res.json(rows);
  } catch (err) {
    console.error('Failed to fetch last-seen:', err);
    res.status(500).json({ error: 'Failed to fetch last seen' });
  }
});

// ─── PROFILE ROUTES ───────────────────────────────────────────────────────────

// PATCH /api/me — user updates their own username and/or password
app.patch('/api/me', authMiddleware, async (req, res) => {
  const { username, password } = req.body;
  const userId = req.user.userId;

  if (!username?.trim() && !password?.trim()) {
    return res.status(400).json({ error: 'Provide a new username or password' });
  }

  try {
    if (username?.trim()) {
      try {
        await pool.query('UPDATE users SET username = $1 WHERE id = $2', [username.trim(), userId]);
      } catch (e) {
        if (e.code === '23505') return res.status(409).json({ error: 'Username already taken' });
        throw e;
      }
    }
    if (password?.trim()) {
      if (password.length < 10) return res.status(400).json({ error: 'Password must be at least 10 characters' });
      const hash = await bcrypt.hash(password, 12);
      await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, userId]);
    }

    const { rows } = await pool.query(
      'SELECT id, username, is_admin FROM users WHERE id = $1', [userId]
    );
    const updated = rows[0];

    // Issue a fresh token with updated username
    const token = jwt.sign(
      { userId: updated.id, username: updated.username, isAdmin: updated.is_admin },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ token, username: updated.username, userId: updated.id, isAdmin: updated.is_admin });
  } catch (err) {
    console.error('Failed to update profile:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// ─── PROFILE ─────────────────────────────────────────────────────────────────

app.get('/api/me/profile', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, username, avatar_url, bio, updated_at FROM users WHERE id = $1',
      [req.user.userId]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error('Profile lookup failed:', err);
    res.status(500).json({ error: 'Could not load profile' });
  }
});

app.patch('/api/me/profile', authMiddleware, async (req, res) => {
  const avatarUrl = req.body.avatarUrl === undefined ? undefined : String(req.body.avatarUrl).trim();
  const bio = req.body.bio === undefined ? undefined : String(req.body.bio).trim();
  if (avatarUrl === undefined && bio === undefined) return res.status(400).json({ error: 'Provide an avatar or bio' });
  if (avatarUrl && !/^https:\/\//i.test(avatarUrl)) return res.status(400).json({ error: 'Avatar URL must use HTTPS' });
  if (avatarUrl && avatarUrl.length > 2000) return res.status(400).json({ error: 'Avatar URL is too long' });
  if (bio && bio.length > 280) return res.status(400).json({ error: 'Bio must be at most 280 characters' });

  try {
    const { rows } = await pool.query(
      `UPDATE users
       SET avatar_url = COALESCE($1, avatar_url), bio = COALESCE($2, bio), updated_at = NOW()
       WHERE id = $3
       RETURNING id, username, avatar_url, bio, updated_at`,
      [avatarUrl, bio, req.user.userId]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error('Profile update failed:', err);
    res.status(500).json({ error: 'Could not update profile' });
  }
});

// ─── DISCOVERY & UNREAD COUNTS ───────────────────────────────────────────────

// Search only returns messages the signed-in user is allowed to see: room posts
// for now. Results are intentionally capped to prevent expensive broad queries.
app.get('/api/search', authMiddleware, async (req, res) => {
  const query = String(req.query.q || '').trim();
  const roomId = String(req.query.roomId || '').trim();
  if (query.length < 2) return res.status(400).json({ error: 'Search query must be at least 2 characters' });
  if (query.length > 100) return res.status(400).json({ error: 'Search query is too long' });

  try {
    const params = [`%${query}%`];
    let roomClause = '';
    if (roomId) {
      params.push(roomId);
      roomClause = `AND m.room_id = $${params.length}`;
    }
    const { rows } = await pool.query(
      `SELECT m.id, m.room_id, m.content, m.message_type, m.created_at, u.id AS sender_id, u.username
       FROM messages m
       JOIN users u ON u.id = m.sender_id
       WHERE m.deleted = FALSE AND m.content ILIKE $1 ${roomClause}
       ORDER BY m.created_at DESC
       LIMIT 50`,
      params
    );
    res.json(rows);
  } catch (err) {
    console.error('Message search failed:', err);
    res.status(500).json({ error: 'Search failed' });
  }
});

app.get('/api/rooms/unread', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT r.id, COUNT(m.id)::int AS unread_count
       FROM rooms r
       LEFT JOIN room_read_receipts rr ON rr.room_id = r.id::text AND rr.user_id = $1
       LEFT JOIN messages m ON m.room_id = r.id::text
         AND m.deleted = FALSE
         AND m.sender_id <> $1
         AND m.id > COALESCE(rr.last_read_id, 0)
       GROUP BY r.id
       ORDER BY r.id`,
      [req.user.userId]
    );
    res.json(rows);
  } catch (err) {
    console.error('Unread count lookup failed:', err);
    res.status(500).json({ error: 'Could not load unread counts' });
  }
});

// ─── ADMIN — USER MANAGEMENT ─────────────────────────────────────────────────

// GET /api/admin/users — list ALL accounts
app.get('/api/admin/users', authMiddleware, adminMiddleware, async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, username, email, is_admin, approved, created_at
       FROM users
       ORDER BY created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error('Failed to fetch users:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// POST /api/admin/users — create a new account (auto-approved)
app.post('/api/admin/users', authMiddleware, adminMiddleware, async (req, res) => {
  const { username, password, isAdmin = false } = req.body;
  if (!username?.trim() || !password?.trim()) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const { rows } = await pool.query(
      `INSERT INTO users (username, email, password_hash, approved, is_admin)
       VALUES ($1, $2, $3, TRUE, $4) RETURNING id, username, is_admin, approved, created_at`,
      [username.trim(), `${username.trim()}_${Date.now()}@chat.local`, passwordHash, isAdmin]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Username already taken' });
    }
    console.error('Failed to create user:', err);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// PATCH /api/admin/users/:id — update username and/or password
app.patch('/api/admin/users/:id', authMiddleware, adminMiddleware, async (req, res) => {
  const { id } = req.params;
  const { username, password } = req.body;

  if (!username?.trim() && !password?.trim()) {
    return res.status(400).json({ error: 'Provide at least a new username or password' });
  }

  try {
    const { rows: existing } = await pool.query('SELECT id FROM users WHERE id = $1', [id]);
    if (existing.length === 0) return res.status(404).json({ error: 'User not found' });

    if (username?.trim()) {
      await pool.query('UPDATE users SET username = $1 WHERE id = $2', [username.trim(), id]);
    }
    if (password?.trim()) {
      if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
      const hash = await bcrypt.hash(password, 12);
      await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, id]);
    }

    const { rows } = await pool.query(
      'SELECT id, username, is_admin, approved, created_at FROM users WHERE id = $1',
      [id]
    );
    res.json({ message: 'User updated', user: rows[0] });
  } catch (err) {
    console.error('Failed to update user:', err);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// DELETE /api/admin/users/:id — delete any account
app.delete('/api/admin/users/:id', authMiddleware, adminMiddleware, async (req, res) => {
  const { id } = req.params;
  // Prevent admin from deleting themselves
  if (id === req.user.userId) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }
  try {
    const { rows } = await pool.query(
      'DELETE FROM users WHERE id = $1 RETURNING id, username',
      [id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ message: 'User deleted', user: rows[0] });
  } catch (err) {
    console.error('Failed to delete user:', err);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// ─── DIRECT MESSAGE ROUTES ────────────────────────────────────────────────────

// POST /api/dm/conversations — start or get existing DM with a user
app.post('/api/dm/conversations', authMiddleware, async (req, res) => {
  const myId = req.user.userId;
  const { targetUsername } = req.body;
  if (!targetUsername?.trim()) return res.status(400).json({ error: 'targetUsername required' });

  try {
    const { rows: targets } = await pool.query(
      'SELECT id, username FROM users WHERE username = $1 AND approved = TRUE',
      [targetUsername.trim()]
    );
    if (targets.length === 0) return res.status(404).json({ error: 'User not found' });
    const targetId = targets[0].id;
    if (targetId === myId) return res.status(400).json({ error: 'Cannot DM yourself' });

    // Normalise order so (A,B) and (B,A) are the same row
    const [a, b] = [myId, targetId].sort();

    const { rows } = await pool.query(
      `INSERT INTO conversations (user_a, user_b)
       VALUES ($1, $2)
       ON CONFLICT (user_a, user_b) DO UPDATE SET user_a = EXCLUDED.user_a
       RETURNING *`,
      [a, b]
    );
    res.json({ ...rows[0], other_username: targets[0].username });
  } catch (err) {
    console.error('Failed to start conversation:', err);
    res.status(500).json({ error: 'Failed to start conversation' });
  }
});

// GET /api/dm/conversations — list all my conversations with unread counts
app.get('/api/dm/conversations', authMiddleware, async (req, res) => {
  const myId = req.user.userId;
  try {
    const { rows } = await pool.query(
      `SELECT c.*,
              CASE WHEN c.user_a = $1 THEN ub.username ELSE ua.username END AS other_username,
              CASE WHEN c.user_a = $1 THEN ub.id       ELSE ua.id       END AS other_user_id,
              CASE WHEN c.user_a = $1 THEN ub.last_seen ELSE ua.last_seen END AS other_last_seen,
              -- unread count: messages after my last_read_id
              (
                SELECT COUNT(*)
                FROM dm_messages dm
                WHERE dm.conv_id = c.id
                  AND dm.sender_id != $1
                  AND dm.deleted = FALSE
                  AND dm.id > COALESCE(
                    (SELECT last_read_id FROM dm_read_receipts
                     WHERE conv_id = c.id AND user_id = $1), 0
                  )
              ) AS unread_count,
              -- last message read_id (to power receipt ticks)
              (SELECT last_read_id FROM dm_read_receipts
               WHERE conv_id = c.id AND user_id != $1 LIMIT 1) AS other_last_read_id
       FROM conversations c
       JOIN users ua ON c.user_a = ua.id
       JOIN users ub ON c.user_b = ub.id
       WHERE c.user_a = $1 OR c.user_b = $1
       ORDER BY c.last_message_at DESC NULLS LAST`,
      [myId]
    );
    res.json(rows);
  } catch (err) {
    console.error('Failed to fetch conversations:', err);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

// GET /api/dm/:convId/messages — paginated DM messages
app.get('/api/dm/:convId/messages', authMiddleware, async (req, res) => {
  const { convId } = req.params;
  const { before_id } = req.query;
  const limit = parseLimit(req.query.limit);
  const myId = req.user.userId;

  try {
    // Verify user is part of this conversation
    const { rows: conv } = await pool.query(
      'SELECT id FROM conversations WHERE id = $1 AND (user_a = $2 OR user_b = $2)',
      [convId, myId]
    );
    if (conv.length === 0) return res.status(403).json({ error: 'Not your conversation' });

    let query = `
      SELECT dm.*, u.username,
             rm.content AS reply_content, rm.message_type AS reply_message_type,
             ru.username AS reply_username,
             COALESCE((
               SELECT last_read_id FROM dm_read_receipts
               WHERE conv_id = $1 AND user_id != $2 LIMIT 1
             ), 0) AS other_last_read_id
      FROM dm_messages dm
      JOIN users u ON dm.sender_id = u.id
      LEFT JOIN dm_messages rm ON dm.reply_to_id = rm.id
      LEFT JOIN users ru ON rm.sender_id = ru.id
      WHERE dm.conv_id = $1 AND dm.deleted = FALSE
    `;
    const params = [convId, myId];

    if (before_id) {
      params.push(before_id);
      query += ` AND dm.id < $${params.length}`;
    }
    params.push(limit);
    query += ` ORDER BY dm.id DESC LIMIT $${params.length}`;

    const { rows } = await pool.query(query, params);
    const shaped = rows.map(r => {
      const msg = { ...r };
      if (r.reply_to_id) {
        msg.reply_to = { content: r.reply_content, message_type: r.reply_message_type, reply_username: r.reply_username };
      }
      delete msg.reply_content; delete msg.reply_message_type; delete msg.reply_username;
      return msg;
    });
    res.json(shaped.reverse());
  } catch (err) {
    console.error('Failed to fetch DM messages:', err);
    res.status(500).json({ error: 'Failed to fetch DM messages' });
  }
});

// ─── ROOMS ROUTES ─────────────────────────────────────────────────────────────

// GET /api/rooms — list all rooms
app.get('/api/rooms', authMiddleware, async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT r.*, 
        (SELECT COUNT(*) FROM messages m WHERE m.room_id = r.id::text) AS message_count
       FROM rooms r
       ORDER BY r.created_at ASC`
    );
    res.json(rows);
  } catch (err) {
    console.error('Failed to fetch rooms:', err);
    res.status(500).json({ error: 'Failed to fetch rooms' });
  }
});

// POST /api/rooms — create a new room
app.post('/api/rooms', authMiddleware, async (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Room name is required' });
  if (name.trim().length > 50) return res.status(400).json({ error: 'Room name too long' });

  try {
    const { rows } = await pool.query(
      `INSERT INTO rooms (name, created_by) VALUES ($1, $2)
       ON CONFLICT (name) DO NOTHING
       RETURNING *`,
      [name.trim(), req.user.userId]
    );
    if (rows.length === 0) {
      return res.status(409).json({ error: 'A room with that name already exists' });
    }
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Failed to create room:', err);
    res.status(500).json({ error: 'Failed to create room' });
  }
});

// DELETE /api/rooms/:id — admin only, deletes room and all its messages
app.delete('/api/rooms/:id', authMiddleware, adminMiddleware, async (req, res) => {
  const { id } = req.params;
  try {
    // Delete all messages in this room first
    await pool.query('DELETE FROM messages WHERE room_id = $1', [String(id)]);
    const { rows } = await pool.query('DELETE FROM rooms WHERE id = $1 RETURNING name', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Room not found' });
    res.json({ success: true, name: rows[0].name });
  } catch (err) {
    console.error('Failed to delete room:', err);
    res.status(500).json({ error: 'Failed to delete room' });
  }
});

// ─── MESSAGES ROUTES ──────────────────────────────────────────────────────────

// GET /api/messages — paginated history for a room
// Admin sees all messages including soft-deleted; regular users only see non-deleted
app.get('/api/messages', authMiddleware, async (req, res) => {
  const { room_id = 'general', before_id } = req.query;
  const limit = parseLimit(req.query.limit);
  const isAdmin = req.user.isAdmin || false;

  try {
    let query = `
      SELECT m.*,
             u.username,
             rm.content    AS reply_content,
             rm.message_type AS reply_message_type,
             ru.username   AS reply_username,
             COALESCE(
               (SELECT json_agg(json_build_object('user_id', mr.user_id, 'reaction', mr.reaction))
                FROM message_reactions mr
                WHERE mr.message_id = m.id), '[]'
             ) AS reactions
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      LEFT JOIN messages rm ON m.reply_to_id = rm.id
      LEFT JOIN users ru ON rm.sender_id = ru.id
      WHERE m.room_id = $1
    `;
    const params = [room_id];

    if (!isAdmin) query += ` AND m.deleted = FALSE`;

    if (before_id) {
      params.push(before_id);
      query += ` AND m.id < $${params.length}`;
    }

    params.push(limit);
    query += ` ORDER BY m.id DESC LIMIT $${params.length}`;

    const { rows } = await pool.query(query, params);

    // Shape reply_to as nested object
    const shaped = rows.map(r => {
      const msg = { ...r };
      if (r.reply_to_id) {
        msg.reply_to = {
          content: r.reply_content,
          message_type: r.reply_message_type,
          reply_username: r.reply_username,
        };
      }
      delete msg.reply_content;
      delete msg.reply_message_type;
      delete msg.reply_username;
      return msg;
    });

    res.json(shaped.reverse());
  } catch (err) {
    console.error('Failed to fetch messages:', err);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// DELETE /api/messages/:id — only the sender may delete
app.delete('/api/messages/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;

  try {
    const { rows } = await pool.query('SELECT sender_id FROM messages WHERE id = $1', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Message not found' });
    if (rows[0].sender_id !== req.user.userId) {
      return res.status(403).json({ error: 'Cannot delete someone else\'s message' });
    }
    await pool.query('UPDATE messages SET deleted = TRUE WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to delete message:', err);
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

// ─── SOCKET.IO ────────────────────────────────────────────────────────────────
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin(origin, callback) {
      if (isAllowedOrigin(origin)) return callback(null, true);
      callback(null, false);
    },
    methods: ['GET', 'POST'],
    credentials: true
  }
});

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Authentication required'));
  try {
    socket.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    next(new Error('Invalid or expired token'));
  }
});

// Map socketId → { username, userId, socketId, isAdmin, inCall }
const connectedUsers = {};
const callRequests = {};
const VALID_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '😡', '🎉', '👏', '🔥', '💯'];

function requireSocketUser(socket) {
  const user = connectedUsers[socket.id];
  if (!user?.userId) return null;
  return user;
}

function isUserStillConnected(userId) {
  if (!userId) return false;
  return Object.values(connectedUsers).some((u) => u.userId === userId);
}

function broadcastOnlineUsers() {
  const seen = new Set();
  const payload = [];
  for (const user of Object.values(connectedUsers)) {
    if (!user.userId || seen.has(user.userId)) continue;
    seen.add(user.userId);
    payload.push({
      userId: user.userId,
      username: user.username,
      isAdmin: user.isAdmin,
    });
  }
  io.emit('online-users', payload);
  io.emit('users-list', payload.map(u => u.username));
}

function findSocketByUserId(userId) {
  for (const [socketId, user] of Object.entries(connectedUsers)) {
    if (user.userId === userId) {
      return { socketId, ...user };
    }
  }
  return null;
}

function findSocketByUsername(username) {
  if (!username) return null;
  for (const [socketId, user] of Object.entries(connectedUsers)) {
    if (user.username === username) {
      return { socketId, ...user };
    }
  }
  return null;
}

async function findUserIdByUsername(username) {
  if (!username) return null;
  try {
    const { rows } = await pool.query(
      'SELECT id FROM users WHERE username = $1 AND approved = TRUE LIMIT 1',
      [username]
    );
    return rows[0]?.id || null;
  } catch (err) {
    return null;
  }
}

function findSocketById(socketId) {
  return connectedUsers[socketId] ? { socketId, ...connectedUsers[socketId] } : null;
}

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // Join chat — JWT is required (handshake + this event)
  socket.on('join', async ({ token } = {}) => {
    let decoded = socket.user;
    if (token) {
      try {
        decoded = jwt.verify(token, JWT_SECRET);
        socket.user = decoded;
      } catch {
        socket.emit('error', 'Invalid or expired token');
        return;
      }
    }

    const username = decoded?.username;
    const userId = decoded?.userId;
    const isAdmin = decoded?.isAdmin || false;

    if (!username || !userId) {
      socket.emit('error', 'Authentication required');
      return;
    }

    connectedUsers[socket.id] = {
      username,
      userId,
      isAdmin,
      socketId: socket.id,
      inCall: false,
    };

    pool.query('UPDATE users SET last_seen = NULL WHERE id = $1', [userId]).catch(() => {});

    socket.join('general');

    console.log(`${username} joined`);

    broadcastOnlineUsers();
    socket.broadcast.emit('user-joined', username);

    if (userId && callRequests[userId]) {
      socket.emit('incoming-call', callRequests[userId]);
      delete callRequests[userId];
    }
  });

  // Join a specific room
  socket.on('join-room', (roomId) => {
    if (!requireSocketUser(socket)) return;
    if (roomId == null || String(roomId).length > 100) return;
    socket.rooms.forEach(r => {
      if (r !== socket.id) socket.leave(r);
    });
    socket.join(String(roomId));
  });

  // WebRTC signaling events
  socket.on('call-user', async (data) => {
    const { calleeId, calleeUsername, callerName, offer, mode = 'video' } = data;
    const caller = connectedUsers[socket.id];
    if (!caller || !offer) return;

    let callee = calleeId ? findSocketByUserId(calleeId) : null;
    if (!callee && calleeUsername) {
      callee = findSocketByUsername(calleeUsername);
    }

    if (callee) {
      if (callee.inCall) {
        socket.emit('call-busy', { message: `${callee.username} is on another call` });
        return;
      }

      io.to(callee.socketId).emit('incoming-call', {
        callerId: caller.userId,
        callerName: callerName || caller.username,
        offer,
        mode,
        callerSocketId: socket.id,
      });
      return;
    }

    // Save pending call request for offline recipients if we know the userId
    const targetId = calleeId || (calleeUsername ? await findUserIdByUsername(calleeUsername) : null);
    if (targetId) {
      callRequests[targetId] = {
        callerId: caller.userId,
        callerName: callerName || caller.username,
        offer,
        mode,
        timestamp: Date.now(),
      };
    }
  });

  socket.on('accept-call', (data) => {
    const { callerId, answer } = data;
    const caller = findSocketByUserId(callerId);
    if (!caller || !answer) return;

    const callee = connectedUsers[socket.id];
    if (!callee) return;

    connectedUsers[socket.id].inCall = true;
    if (connectedUsers[caller.socketId]) connectedUsers[caller.socketId].inCall = true;

    io.to(caller.socketId).emit('call-accepted', {
      answer,
      calleeSocketId: socket.id,
    });
  });

  socket.on('reject-call', (data) => {
    const { callerId } = data;
    const caller = findSocketByUserId(callerId);
    if (!caller) return;

    io.to(caller.socketId).emit('call-rejected', {
      message: 'Call rejected',
    });
  });

  socket.on('send-ice-candidate', (data) => {
    const { targetId, candidate } = data;
    const target = findSocketByUserId(targetId) || findSocketById(targetId);
    if (!target || !candidate) return;

    io.to(target.socketId).emit('receive-ice-candidate', {
      candidate,
      fromId: connectedUsers[socket.id]?.userId,
    });
  });

  socket.on('end-call', (data) => {
    const { targetId } = data;
    const target = findSocketByUserId(targetId) || findSocketById(targetId);
    if (target) {
      if (connectedUsers[target.socketId]) {
        connectedUsers[target.socketId].inCall = false;
      }
      io.to(target.socketId).emit('call-ended', {
        message: 'Call ended by other party',
      });
    }
    if (connectedUsers[socket.id]) {
      connectedUsers[socket.id].inCall = false;
    }
  });

  // Send a message
  socket.on('send_message', async (data) => {
    const { room_id = 'general', content, message_type = 'text', reply_to_id } = data;
    const user = requireSocketUser(socket);
    if (!user) return;
    if (typeof content !== 'string' || !content.trim()) return;
    if (content.length > MAX_MESSAGE_LENGTH) return;

    try {
      const { rows } = await pool.query(
        `INSERT INTO messages (room_id, sender_id, content, message_type, reply_to_id)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [room_id, user.userId, content.trim(), message_type, reply_to_id || null]
      );
      const msg = { ...rows[0], username: user.username, reactions: [], edited: false, deleted: false };

      // If reply, attach the original message snippet
      if (reply_to_id) {
        const { rows: orig } = await pool.query(
          'SELECT m.content, m.message_type, u.username as reply_username FROM messages m JOIN users u ON m.sender_id=u.id WHERE m.id=$1',
          [reply_to_id]
        );
        if (orig.length > 0) msg.reply_to = orig[0];
      }

      io.to(room_id).emit('receive_message', msg);
    } catch (err) {
      console.error('Failed to save message:', err);
    }
  });

  // Delete a message — sender soft-deletes (admin can also soft-delete any message)
  // Admin sees the message marked as deleted; regular users don't see it at all
  socket.on('delete_message', async ({ messageId, room_id }) => {
    const user = connectedUsers[socket.id];
    if (!user || !user.userId) return;

    try {
      const { rows } = await pool.query(
        'SELECT sender_id FROM messages WHERE id = $1', [messageId]
      );
      if (rows.length === 0) return;

      const isOwner = rows[0].sender_id === user.userId;
      const isAdmin = user.isAdmin === true;
      if (!isOwner && !isAdmin) return;

      // Soft delete — mark as deleted, keep in DB for admin visibility
      await pool.query('UPDATE messages SET deleted = TRUE WHERE id = $1', [messageId]);

      // Tell regular users to remove the message from their view
      socket.to(room_id || 'general').emit('message_deleted', messageId);
      // Also remove from sender's own view
      socket.emit('message_deleted', messageId);
    } catch (err) {
      console.error('Failed to delete message via socket:', err);
    }
  });

  // Edit a message — only the original sender
  socket.on('edit_message', async ({ messageId, content, room_id }) => {
    const user = connectedUsers[socket.id];
    if (!user || !user.userId) return;
    if (!content?.trim()) return;

    try {
      const { rows } = await pool.query(
        'SELECT sender_id, created_at FROM messages WHERE id = $1', [messageId]
      );
      if (rows.length === 0) return;
      if (rows[0].sender_id !== user.userId) return;

      const elapsed = Date.now() - new Date(rows[0].created_at).getTime();
      if (elapsed > 5 * 60 * 1000) return;

      const { rows: updated } = await pool.query(
        `UPDATE messages SET content = $1, edited = TRUE WHERE id = $2 RETURNING *`,
        [content.trim(), messageId]
      );
      if (updated.length === 0) return;

      const msg = { ...updated[0], username: user.username };
      io.to(room_id || 'general').emit('message_edited', msg);
    } catch (err) {
      console.error('Failed to edit message via socket:', err);
    }
  });

  // Typing indicators
  socket.on('typing', ({ room_id, isTyping }) => {
    const user = connectedUsers[socket.id];
    if (!user) return;
    socket.to(room_id || 'general').emit('user-typing', {
      username: user.username,
      isTyping
    });
  });

  socket.on('message_reaction', async ({ messageId, room_id, reaction, action }) => {
    const user = connectedUsers[socket.id];
    if (!user || !user.userId || !messageId || !reaction) return;
    if (!VALID_REACTIONS.includes(reaction)) return;

    try {
      if (action === 'remove') {
        await pool.query(
          'DELETE FROM message_reactions WHERE message_id = $1 AND user_id = $2 AND reaction = $3',
          [messageId, user.userId, reaction]
        );
      } else {
        await pool.query(
          `INSERT INTO message_reactions (message_id, user_id, reaction)
           VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
          [messageId, user.userId, reaction]
        );
      }

      const { rows: reactions } = await pool.query(
        'SELECT user_id, reaction FROM message_reactions WHERE message_id = $1',
        [messageId]
      );

      io.to(room_id || 'general').emit('message_reactions_updated', {
        messageId,
        reactions,
      });
    } catch (err) {
      console.error('Failed to handle message reaction:', err);
    }
  });

  // Mark DM messages as read — updates receipt, notifies sender
  socket.on('mark_dm_read', async ({ convId, lastMessageId }) => {
    const user = connectedUsers[socket.id];
    if (!user?.userId || !convId || !lastMessageId) return;
    try {
      await pool.query(
        `INSERT INTO dm_read_receipts (conv_id, user_id, last_read_id, read_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (conv_id, user_id)
         DO UPDATE SET last_read_id = GREATEST(dm_read_receipts.last_read_id, EXCLUDED.last_read_id),
                       read_at = NOW()`,
        [convId, user.userId, lastMessageId]
      );
      // Notify everyone in the DM room so the sender's ticks turn blue
      io.to(`dm_${convId}`).emit('dm_read', {
        convId,
        readerId: user.userId,
        lastReadId: lastMessageId,
      });
    } catch (err) { console.error('Failed to mark DM read:', err); }
  });

  // Mark room messages as read
  socket.on('mark_room_read', async ({ roomId, lastMessageId }) => {
    const user = connectedUsers[socket.id];
    if (!user?.userId || !roomId || !lastMessageId) return;
    try {
      await pool.query(
        `INSERT INTO room_read_receipts (room_id, user_id, last_read_id, read_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (room_id, user_id)
         DO UPDATE SET last_read_id = GREATEST(room_read_receipts.last_read_id, EXCLUDED.last_read_id),
                       read_at = NOW()`,
        [roomId, user.userId, lastMessageId]
      );
    } catch (err) { console.error('Failed to mark room read:', err); }
  });

  // DM typing indicator
  socket.on('dm_typing', ({ convId, isTyping }) => {
    const user = connectedUsers[socket.id];
    if (!user) return;
    socket.to(`dm_${convId}`).emit('dm_user_typing', { username: user.username, isTyping });
  });

  // Join a DM conversation room
  socket.on('join_dm', (convId) => {
    socket.join(`dm_${convId}`);
  });

  // Leave a DM conversation room
  socket.on('leave_dm', (convId) => {
    socket.leave(`dm_${convId}`);
  });

  // Send a DM message
  socket.on('send_dm', async ({ convId, content, message_type = 'text', reply_to_id }) => {
    const user = connectedUsers[socket.id];
    if (!user?.userId || typeof content !== 'string' || !content.trim()) return;
    if (content.length > MAX_MESSAGE_LENGTH) return;

    try {
      // Verify user belongs to conversation
      const { rows: conv } = await pool.query(
        'SELECT user_a, user_b FROM conversations WHERE id = $1 AND (user_a = $2 OR user_b = $2)',
        [convId, user.userId]
      );
      if (conv.length === 0) return;

      const { rows } = await pool.query(
        `INSERT INTO dm_messages (conv_id, sender_id, content, message_type, reply_to_id)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [convId, user.userId, content.trim(), message_type, reply_to_id || null]
      );
      const msg = { ...rows[0], username: user.username };

      // Attach reply snippet
      if (reply_to_id) {
        const { rows: orig } = await pool.query(
          'SELECT dm.content, dm.message_type, u.username AS reply_username FROM dm_messages dm JOIN users u ON dm.sender_id=u.id WHERE dm.id=$1',
          [reply_to_id]
        );
        if (orig.length > 0) msg.reply_to = orig[0];
      }

      // Update conversation last_message
      await pool.query(
        'UPDATE conversations SET last_message = $1, last_message_at = NOW() WHERE id = $2',
        [content.trim().slice(0, 100), convId]
      );

      // Attach the other user's last_read_id so sender can render correct tick state
      const { rows: receipt } = await pool.query(
        `SELECT last_read_id FROM dm_read_receipts
         WHERE conv_id = $1 AND user_id != $2 LIMIT 1`,
        [convId, user.userId]
      );
      msg.other_last_read_id = receipt[0]?.last_read_id || 0;

      io.to(`dm_${convId}`).emit('receive_dm', msg);
    } catch (err) {
      console.error('Failed to send DM:', err);
    }
  });

  // Edit a DM message — sender only
  socket.on('edit_dm', async ({ messageId, content, convId }) => {
    const user = connectedUsers[socket.id];
    if (!user?.userId || !content?.trim()) return;
    try {
      const { rows: check } = await pool.query('SELECT sender_id FROM dm_messages WHERE id=$1', [messageId]);
      if (!check.length || check[0].sender_id !== user.userId) return;
      const { rows } = await pool.query(
        'UPDATE dm_messages SET content=$1, edited=TRUE WHERE id=$2 RETURNING *',
        [content.trim(), messageId]
      );
      io.to(`dm_${convId}`).emit('dm_edited', { ...rows[0], username: user.username });
    } catch (err) { console.error('Failed to edit DM:', err); }
  });

  // Delete a DM message — sender only (soft delete)
  socket.on('delete_dm', async ({ messageId, convId }) => {
    const user = connectedUsers[socket.id];
    if (!user?.userId) return;
    try {
      const { rows: check } = await pool.query('SELECT sender_id FROM dm_messages WHERE id=$1', [messageId]);
      if (!check.length || check[0].sender_id !== user.userId) return;
      await pool.query('UPDATE dm_messages SET deleted=TRUE WHERE id=$1', [messageId]);
      io.to(`dm_${convId}`).emit('dm_deleted', messageId);
    } catch (err) { console.error('Failed to delete DM:', err); }
  });

  socket.on('disconnect', () => {
    const user = connectedUsers[socket.id];
    if (!user) return;

    console.log(`${user.username} disconnected`);
    delete connectedUsers[socket.id];

    if (user.userId && !isUserStillConnected(user.userId)) {
      pool.query('UPDATE users SET last_seen = NOW() WHERE id = $1', [user.userId]).catch(() => {});
      io.emit('user-left', user.username);
    }
    broadcastOnlineUsers();
  });
});

const PORT = process.env.PORT || 5000;
pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen TIMESTAMP WITH TIME ZONE')
  .catch((err) => console.error('Failed to ensure last_seen column:', err.message));

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});

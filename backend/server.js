const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('./db');

require('dotenv').config();

const app = express();

// ─── CORS ────────────────────────────────────────────────────────────────────
// Always open — no env var dependency. Any origin is allowed.
const corsOptions = {
  origin: true,           // reflect the request origin, allow all
  credentials: true,
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));

// Handle preflight for every route (Express 5 compatible — no wildcard string)
app.options(/.*/, cors(corsOptions));

app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'changeme_use_env_var';

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

// ─── AUTH ROUTES ──────────────────────────────────────────────────────────────

// POST /api/register
// New users are created with approved=false and need admin approval
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username?.trim() || !password?.trim()) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  if (username.trim().length < 2) {
    return res.status(400).json({ error: 'Username must be at least 2 characters' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    // New users need approval (approved=false by default)
    const result = await pool.query(
      `INSERT INTO users (username, email, password_hash, approved)
       VALUES ($1, $2, $3, FALSE) RETURNING id, username, approved`,
      [username.trim(), `${username.trim()}_${Date.now()}@chat.local`, passwordHash]
    );
    const user = result.rows[0];
    
    // Return success but indicate pending approval
    res.status(201).json({ 
      message: 'Registration successful. Waiting for admin approval.',
      username: user.username,
      userId: user.id,
      approved: user.approved
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// POST /api/login
// Check if user is approved before allowing login
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username?.trim() || !password?.trim()) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  try {
    // Fetch all accounts with this username (newest first)
    const result = await pool.query(
      'SELECT id, username, password_hash, approved, is_admin FROM users WHERE username = $1 ORDER BY created_at DESC',
      [username.trim()]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    // Find the first account whose password matches
    let matched = null;
    for (const row of result.rows) {
      if (row.password_hash && await bcrypt.compare(password, row.password_hash)) {
        matched = row;
        break;
      }
    }

    if (!matched) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    // Check if user is approved
    if (!matched.approved) {
      return res.status(403).json({ error: 'Account pending admin approval' });
    }

    const token = jwt.sign({ 
      userId: matched.id, 
      username: matched.username,
      isAdmin: matched.is_admin 
    }, JWT_SECRET, { expiresIn: '7d' });
    
    res.json({ 
      token, 
      username: matched.username, 
      userId: matched.id,
      isAdmin: matched.is_admin
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

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
      await pool.query('UPDATE users SET username = $1 WHERE id = $2', [username.trim(), userId]);
    }
    if (password?.trim()) {
      if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
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

// ─── MESSAGES ROUTES ──────────────────────────────────────────────────────────

// GET /api/messages — paginated history for a room
// Admin sees all messages including soft-deleted; regular users only see non-deleted
app.get('/api/messages', authMiddleware, async (req, res) => {
  const { room_id = 'general', limit = 30, before_id } = req.query;
  const isAdmin = req.user.isAdmin || false;

  try {
    let query = `
      SELECT m.*, u.username
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      WHERE m.room_id = $1
    `;
    const params = [room_id];

    // Regular users never see deleted messages
    if (!isAdmin) {
      query += ` AND m.deleted = FALSE`;
    }

    if (before_id) {
      params.push(before_id);
      query += ` AND m.id < $${params.length}`;
    }

    params.push(limit);
    query += ` ORDER BY m.id DESC LIMIT $${params.length}`;

    const { rows } = await pool.query(query, params);
    res.json(rows.reverse());
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
    await pool.query('DELETE FROM messages WHERE id = $1', [id]);
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
    origin: true,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Map socketId → { username, userId }
const connectedUsers = {};

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // Join chat — expects { token } for authenticated users
  socket.on('join', async ({ token, username: guestName } = {}) => {
    let username = guestName;
    let userId = null;
    let isAdmin = false;

    // Validate JWT if provided
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        username = decoded.username;
        userId = decoded.userId;
        isAdmin = decoded.isAdmin || false;
      } catch {
        // bad token — ignore, fall through to guest
      }
    }

    if (!username) {
      socket.emit('error', 'Username is required');
      return;
    }

    connectedUsers[socket.id] = { username, userId, isAdmin };

    // Update last_seen to NULL (meaning online now) when user connects
    if (userId) {
      pool.query('UPDATE users SET last_seen = NULL WHERE id = $1', [userId]).catch(() => {});
    }

    // Join the default room
    socket.join('general');

    console.log(`${username} joined`);

    io.emit('users-list', Object.values(connectedUsers).map(u => u.username));
    socket.broadcast.emit('user-joined', username);
  });

  // Join a specific room
  socket.on('join-room', (roomId) => {
    // Leave all rooms except the socket's own room
    socket.rooms.forEach(r => {
      if (r !== socket.id) socket.leave(r);
    });
    socket.join(roomId);
  });

  // Send a message
  socket.on('send_message', async (data) => {
    const { room_id = 'general', content, message_type = 'text' } = data;
    const user = connectedUsers[socket.id];

    if (!user) return;

    // Guest users without a userId get a new row for storage
    let senderId = user.userId;
    if (!senderId) {
      try {
        const r = await pool.query(
          `INSERT INTO users (username, email) VALUES ($1, $2) RETURNING id`,
          [user.username, `${user.username}_${Date.now()}@chat.local`]
        );
        senderId = r.rows[0].id;
        connectedUsers[socket.id].userId = senderId;
      } catch (err) {
        console.error('Failed to insert guest user:', err);
        return;
      }
    }

    try {
      const { rows } = await pool.query(
        `INSERT INTO messages (room_id, sender_id, content, message_type)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [room_id, senderId, content, message_type]
      );
      const msg = { ...rows[0], username: user.username };
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
        'SELECT sender_id FROM messages WHERE id = $1', [messageId]
      );
      if (rows.length === 0) return;
      if (rows[0].sender_id !== user.userId) return;

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

  socket.on('disconnect', () => {
    const user = connectedUsers[socket.id];
    if (user) {
      console.log(`${user.username} disconnected`);

      // Save last_seen timestamp when user goes offline
      if (user.userId) {
        pool.query('UPDATE users SET last_seen = NOW() WHERE id = $1', [user.userId]).catch(() => {});
      }

      delete connectedUsers[socket.id];
      io.emit('user-left', user.username);
      io.emit('users-list', Object.values(connectedUsers).map(u => u.username));
    }
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});

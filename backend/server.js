const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const pool = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

// Health check endpoint for Render
app.get('/', (req, res) => {
  res.send('Chat App Backend is running');
});

// API endpoint for fetching messages with pagination
app.get('/api/messages', async (req, res) => {
  const { room_id = 'general', limit = 30, before_id } = req.query;

  try {
    let query = `
      SELECT m.*, u.username 
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      WHERE m.room_id = $1
    `;
    const params = [room_id];

    // If fetching older messages upon scrolling up
    if (before_id) {
      params.push(before_id);
      query += ` AND m.id < $${params.length}`;
    }

    params.push(limit);
    query += ` ORDER BY m.id DESC LIMIT $${params.length}`;

    const { rows } = await pool.query(query, params);

    // Reverse array so the client gets chronological order [oldest ... newest]
    res.json(rows.reverse());
  } catch (err) {
    console.error('Failed to fetch messages:', err);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ["http://localhost:5173", "http://localhost:5174", "http://10.69.12.207:5174"],
    methods: ["GET", "POST"]
  }
});

// Store connected users and their socket IDs
const users = {};

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // User joins with a username
  socket.on('join', async (username) => {
    try {
      // Create or get user
      const userResult = await pool.query(
        'INSERT INTO users (username, email) VALUES ($1, $2) ON CONFLICT (username) DO UPDATE SET email = EXCLUDED.email RETURNING id',
        [username, `${username}@chat.app.local`]
      );
      
      const userId = userResult.rows[0].id;
      users[socket.id] = { username, userId };
      
      // Join default room
      socket.join('general');
      
      console.log(`${username} joined the chat`);
      
      // Broadcast to all users that someone joined
      io.emit('user-joined', username);
      
      // Send current users list to the new user
      io.emit('users-list', Object.values(users).map(u => u.username));
    } catch (err) {
      console.error('Error joining chat:', err);
    }
  });

  // Handle incoming messages
  socket.on('send_message', async (data) => {
    const { room_id = 'general', content, message_type = 'text' } = data;
    const user = users[socket.id];
    
    if (!user) {
      console.error('User not found for socket:', socket.id);
      return;
    }

    try {
      const result = await pool.query(
        `INSERT INTO messages (room_id, sender_id, content, message_type) 
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [room_id, user.userId, content, message_type]
      );

      const savedMessage = result.rows[0];
      
      // Add username to the message for the client
      savedMessage.username = user.username;

      // Emit live to everyone in the chat room
      io.to(room_id).emit('receive_message', savedMessage);
    } catch (err) {
      console.error('Failed to save message:', err);
    }
  });

  // Handle user disconnect
  socket.on('disconnect', () => {
    const user = users[socket.id];
    if (user) {
      console.log(`${user.username} left the chat`);
      delete users[socket.id];
      
      // Broadcast to all users that someone left
      io.emit('user-left', user.username);
      
      // Update users list
      io.emit('users-list', Object.values(users).map(u => u.username));
    }
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});

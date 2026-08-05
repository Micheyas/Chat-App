const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

// Health check endpoint for Render
app.get('/', (req, res) => {
  res.send('Chat App Backend is running');
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
  socket.on('join', (username) => {
    users[socket.id] = username;
    console.log(`${username} joined the chat`);
    
    // Broadcast to all users that someone joined
    io.emit('user-joined', username);
    
    // Send current users list to the new user
    io.emit('users-list', Object.values(users));
  });

  // Handle incoming messages
  socket.on('message', (data) => {
    const { username, message } = data;
    console.log(`${username}: ${message}`);
    
    // Broadcast message to all connected users
    io.emit('message', {
      username: username,
      message: message,
      timestamp: new Date().toISOString()
    });
  });

  // Handle user disconnect
  socket.on('disconnect', () => {
    const username = users[socket.id];
    if (username) {
      console.log(`${username} left the chat`);
      delete users[socket.id];
      
      // Broadcast to all users that someone left
      io.emit('user-left', username);
      
      // Update users list
      io.emit('users-list', Object.values(users));
    }
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});

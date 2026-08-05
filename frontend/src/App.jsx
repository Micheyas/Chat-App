import { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import axios from 'axios';
import './App.css';

const socket = io.connect(import.meta.env.VITE_BACKEND_URL || 
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
    ? 'http://localhost:5000' 
    : `http://${window.location.hostname}:5000`));

const API_URL = import.meta.env.VITE_BACKEND_URL || 
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
    ? 'http://localhost:5000' 
    : `http://${window.location.hostname}:5000`);

function App() {
  const [username, setUsername] = useState('');
  const [isJoined, setIsJoined] = useState(false);
  const [currentChat, setCurrentChat] = useState(null);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [users, setUsers] = useState([]);
  const [showChatList, setShowChatList] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    socket.on('receive_message', (data) => {
      setMessages(prev => [...prev, data]);
    });

    socket.on('user-joined', (joinedUsername) => {
      setUsers(prev => [...prev, joinedUsername]);
    });

    socket.on('user-left', (leftUsername) => {
      setUsers(prev => prev.filter(u => u !== leftUsername));
    });

    socket.on('users-list', (usersList) => {
      setUsers(usersList);
    });

    return () => {
      socket.off('receive_message');
      socket.off('user-joined');
      socket.off('user-left');
      socket.off('users-list');
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load initial messages when joining a chat
  const loadMessages = async (beforeId = null) => {
    if (loading) return;
    
    setLoading(true);
    try {
      const params = { room_id: 'general', limit: 30 };
      if (beforeId) params.before_id = beforeId;
      
      const response = await axios.get(`${API_URL}/api/messages`, { params });
      const newMessages = response.data;
      
      if (newMessages.length < 30) {
        setHasMore(false);
      }
      
      if (beforeId) {
        // Prepend older messages
        setMessages(prev => [...newMessages, ...prev]);
      } else {
        // Initial load
        setMessages(newMessages);
      }
    } catch (error) {
      console.error('Failed to load messages:', error);
    } finally {
      setLoading(false);
    }
  };

  // Handle scroll for pagination
  const handleScroll = () => {
    if (!messagesContainerRef.current || loading || !hasMore) return;
    
    const { scrollTop } = messagesContainerRef.current;
    if (scrollTop === 0 && messages.length > 0) {
      const oldestMessage = messages[0];
      loadMessages(oldestMessage.id);
    }
  };

  const joinChat = () => {
    if (username.trim()) {
      socket.emit('join', username);
      setIsJoined(true);
      loadMessages(); // Load initial messages
    }
  };

  const sendMessage = () => {
    if (message.trim()) {
      socket.emit('send_message', {
        room_id: 'general',
        content: message,
        message_type: 'text'
      });
      setMessage('');
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('upload_preset', import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET);

      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${import.meta.env.VITE_CLOUDINARY_CLOUD_NAME}/auto/upload`,
        {
          method: 'POST',
          body: formData
        }
      );

      const data = await response.json();

      socket.emit('send_message', {
        room_id: 'general',
        content: data.secure_url,
        message_type: file.type.startsWith('image/') ? 'image' : 'document'
      });
    } catch (error) {
      console.error('Upload failed:', error);
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      sendMessage();
    }
  };

  const goBack = () => {
    setShowChatList(true);
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (!isJoined) {
    return (
      <div className="join-container">
        <div className="join-box">
          <div className="telegram-logo">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M21.928 2.628a1.143 1.143 0 0 0-1.516-1.508L2.428 9.378a1.143 1.143 0 0 0 .04 2.12l4.778 1.556 1.78 5.718a.571.571 0 0 0 .983.258l2.5-2.5 4.875 3.714a1.143 1.143 0 0 0 1.784-.666l2.57-15.65z" fill="#0088cc"/>
            </svg>
          </div>
          <h1>Telegram Clone</h1>
          <input
            type="text"
            placeholder="Enter your username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && joinChat()}
            className="username-input"
          />
          <button onClick={joinChat} className="join-button">
            Start Messaging
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-app">
      <div className="chat-view-container">
        <div className="chat-view-header">
          <div className="chat-view-info">
            <h3>General Chat</h3>
            <span className="chat-view-status">{users.length} online</span>
          </div>
        </div>
        
        <div 
          className="messages-container"
          ref={messagesContainerRef}
          onScroll={handleScroll}
        >
          {loading && <div className="loading-more">Loading older messages...</div>}
          {messages.map((msg, index) => (
            <div key={index} className={`message ${msg.username === username ? 'own-message' : 'other-message'}`}>
              <div className="message-bubble">
                {msg.username !== username && (
                  <span className="message-sender">{msg.username}</span>
                )}
                {msg.message_type === 'image' ? (
                  <img src={msg.content} alt="Shared image" className="message-image" />
                ) : msg.message_type === 'document' ? (
                  <a href={msg.content} target="_blank" rel="noopener noreferrer" className="message-document">
                    📎 {msg.content.split('/').pop()}
                  </a>
                ) : (
                  <span className="message-text">{msg.content}</span>
                )}
                <div className="message-meta">
                  <span className="message-time">{formatTime(msg.created_at)}</span>
                  {msg.username === username && (
                    <span className="message-status">
                      <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M18 7l-1.41-1.41-6.34 6.34 1.41 1.41L18 7zm4.24-1.41L11.66 16.17 7.48 12l-1.41 1.41L11.66 19l12-12-1.42-1.41zM.41 13.41L6 19l1.41-1.41L1.83 12 .41 13.41z"/>
                      </svg>
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
        
        <div className="input-container">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            className="file-input"
            accept="image/*,.pdf,.doc,.docx"
            style={{ display: 'none' }}
          />
          <button 
            className="attach-button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? '⏳' : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
              </svg>
            )}
          </button>
          <input
            type="text"
            placeholder="Message..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            className="message-input"
          />
          <button 
            onClick={sendMessage} 
            className="send-button"
            disabled={!message.trim()}
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;

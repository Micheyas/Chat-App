import { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import './App.css';

const socket = io.connect(import.meta.env.VITE_BACKEND_URL || 
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
    ? 'http://localhost:5000' 
    : `http://${window.location.hostname}:5000`));

function App() {
  const [username, setUsername] = useState('');
  const [isJoined, setIsJoined] = useState(false);
  const [currentChat, setCurrentChat] = useState(null);
  const [message, setMessage] = useState('');
  const [chats, setChats] = useState({});
  const [users, setUsers] = useState([]);
  const [showChatList, setShowChatList] = useState(true);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    socket.on('message', (data) => {
      const { username: sender, message: msg, timestamp } = data;
      
      setChats(prevChats => {
        const updatedChats = { ...prevChats };
        
        // Determine which chat this message belongs to
        const chatKey = sender === username ? 'all' : sender;
        
        if (!updatedChats[chatKey]) {
          updatedChats[chatKey] = {
            username: sender === username ? 'All Users' : sender,
            messages: [],
            lastMessage: msg,
            lastTime: timestamp,
            unread: sender !== username ? 1 : 0
          };
        }
        
        updatedChats[chatKey].messages.push({
          sender,
          message: msg,
          timestamp,
          isOwn: sender === username
        });
        
        updatedChats[chatKey].lastMessage = msg;
        updatedChats[chatKey].lastTime = timestamp;
        
        if (sender !== username) {
          updatedChats[chatKey].unread = (updatedChats[chatKey].unread || 0) + 1;
        }
        
        return updatedChats;
      });
    });

    socket.on('user-joined', (joinedUsername) => {
      setUsers(prev => [...prev, joinedUsername]);
      
      setChats(prevChats => {
        const updatedChats = { ...prevChats };
        if (!updatedChats[joinedUsername]) {
          updatedChats[joinedUsername] = {
            username: joinedUsername,
            messages: [],
            lastMessage: 'joined the chat',
            lastTime: new Date().toISOString(),
            unread: 0
          };
        }
        return updatedChats;
      });
    });

    socket.on('user-left', (leftUsername) => {
      setUsers(prev => prev.filter(u => u !== leftUsername));
    });

    socket.on('users-list', (usersList) => {
      setUsers(usersList);
    });

    return () => {
      socket.off('message');
      socket.off('user-joined');
      socket.off('user-left');
      socket.off('users-list');
    };
  }, [username]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentChat, chats]);

  const joinChat = () => {
    if (username.trim()) {
      socket.emit('join', username);
      setIsJoined(true);
      
      // Initialize "All Users" chat
      setChats({
        'all': {
          username: 'All Users',
          messages: [],
          lastMessage: 'Group chat started',
          lastTime: new Date().toISOString(),
          unread: 0
        }
      });
    }
  };

  const sendMessage = () => {
    if (message.trim() && currentChat) {
      socket.emit('message', { username, message });
      setMessage('');
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      sendMessage();
    }
  };

  const openChat = (chatKey) => {
    setCurrentChat(chatKey);
    setShowChatList(false);
    
    // Mark as read
    setChats(prevChats => {
      const updatedChats = { ...prevChats };
      if (updatedChats[chatKey]) {
        updatedChats[chatKey].unread = 0;
      }
      return updatedChats;
    });
  };

  const goBack = () => {
    setShowChatList(true);
    setCurrentChat(null);
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

  if (showChatList) {
    return (
      <div className="chat-app">
        <div className="chat-list-container">
          <div className="chat-list-header">
            <h2>Chats</h2>
            <div className="user-info">{username}</div>
          </div>
          
          <div className="online-users">
            <h3>Online Users ({users.length})</h3>
            <div className="users-scroll">
              {users.map((user, index) => (
                <div 
                  key={index} 
                  className="user-item"
                  onClick={() => openChat(user)}
                >
                  <div className="user-avatar">
                    {user.charAt(0).toUpperCase()}
                  </div>
                  <div className="user-details">
                    <span className="user-name">{user}</span>
                    <span className="user-status">online</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          <div className="chats-list">
            {Object.entries(chats).map(([key, chat]) => (
              <div 
                key={key} 
                className={`chat-item ${currentChat === key ? 'active' : ''}`}
                onClick={() => openChat(key)}
              >
                <div className="chat-avatar">
                  {chat.username.charAt(0).toUpperCase()}
                </div>
                <div className="chat-info">
                  <div className="chat-header-row">
                    <span className="chat-name">{chat.username}</span>
                    {chat.lastTime && (
                      <span className="chat-time">{formatTime(chat.lastTime)}</span>
                    )}
                  </div>
                  <div className="chat-preview-row">
                    <span className="chat-last-message">
                      {chat.lastMessage}
                    </span>
                    {chat.unread > 0 && (
                      <span className="unread-badge">{chat.unread}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const currentChatData = chats[currentChat];

  return (
    <div className="chat-app">
      <div className="chat-view-container">
        <div className="chat-view-header">
          <button className="back-button" onClick={goBack}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6"/>
            </svg>
          </button>
          <div className="chat-view-avatar">
            {currentChatData?.username.charAt(0).toUpperCase()}
          </div>
          <div className="chat-view-info">
            <h3>{currentChatData?.username}</h3>
            <span className="chat-view-status">online</span>
          </div>
        </div>
        
        <div className="messages-container">
          {currentChatData?.messages.map((msg, index) => (
            <div
              key={index}
              className={`message ${msg.isOwn ? 'own-message' : 'other-message'}`}
            >
              <div className="message-bubble">
                {!msg.isOwn && (
                  <span className="message-sender">{msg.sender}</span>
                )}
                <span className="message-text">{msg.message}</span>
                <div className="message-meta">
                  <span className="message-time">{formatTime(msg.timestamp)}</span>
                  {msg.isOwn && (
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
          <button className="attach-button">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
            </svg>
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

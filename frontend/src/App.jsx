import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import socket, { BACKEND_URL } from './socket';
import JoinScreen from './components/JoinScreen';
import RoomSidebar from './components/RoomSidebar';
import MessageList from './components/MessageList';
import MessageInput from './components/MessageInput';
import AdminPanel from './components/AdminPanel';
import SettingsPanel from './components/SettingsPanel';
import './App.css';

// ─── Session helpers ──────────────────────────────────────────────────────────
const SESSION_KEY = 'chat_session';

function saveSession(data) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(data));
}

function loadSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY));
  } catch {
    return null;
  }
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  // Auth
  const [auth, setAuth] = useState(null); // { token, username, userId }

  // Rooms
  const [rooms, setRooms] = useState([]);
  const [activeRoom, setActiveRoom] = useState(null);

  // Messages
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);

  // File upload
  const [uploading, setUploading] = useState(false);

  // Online users
  const [users, setUsers] = useState([]);

  // Typing
  const [typingUsers, setTypingUsers] = useState([]);

  // Mobile sidebar visibility
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Admin panel visibility
  const [showAdmin, setShowAdmin] = useState(false);

  // Settings panel visibility
  const [showSettings, setShowSettings] = useState(false);

  // ── Restore session on mount ──────────────────────────────────────────────
  useEffect(() => {
    const session = loadSession();
    if (session?.token && session?.username) {
      setAuth(session);
    }
  }, []);

  // ── Connect socket when auth is ready ─────────────────────────────────────
  useEffect(() => {
    if (!auth) return;

    if (!socket.connected) socket.connect();

    socket.emit('join', { token: auth.token, username: auth.username });

    return () => {
      // Don't disconnect on re-render, only on logout
    };
  }, [auth]);

  // ── Socket event listeners ────────────────────────────────────────────────
  useEffect(() => {
    const onReceive = (msg) => setMessages(prev => [...prev, msg]);
    const onDeleted = (id) => setMessages(prev => prev.filter(m => m.id !== id));
    const onEdited  = (msg) => setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, content: msg.content, edited: true } : m));
    const onUserJoined = (u) => setUsers(prev => prev.includes(u) ? prev : [...prev, u]);
    const onUserLeft = (u) => setUsers(prev => prev.filter(x => x !== u));
    const onUsersList = (list) => setUsers(list);
    const onTyping = ({ username: u, isTyping }) => {
      setTypingUsers(prev =>
        isTyping ? (prev.includes(u) ? prev : [...prev, u]) : prev.filter(x => x !== u)
      );
    };

    socket.on('receive_message', onReceive);
    socket.on('message_deleted', onDeleted);
    socket.on('message_edited',  onEdited);
    socket.on('user-joined', onUserJoined);
    socket.on('user-left', onUserLeft);
    socket.on('users-list', onUsersList);
    socket.on('user-typing', onTyping);

    return () => {
      socket.off('receive_message', onReceive);
      socket.off('message_deleted', onDeleted);
      socket.off('message_edited',  onEdited);
      socket.off('user-joined', onUserJoined);
      socket.off('user-left', onUserLeft);
      socket.off('users-list', onUsersList);
      socket.off('user-typing', onTyping);
    };
  }, []);

  // ── Fetch rooms once authenticated ───────────────────────────────────────
  useEffect(() => {
    if (!auth) return;
    axios
      .get(`${BACKEND_URL}/api/rooms`, {
        headers: { Authorization: `Bearer ${auth.token}` },
      })
      .then(({ data }) => {
        setRooms(data);
        if (data.length > 0) setActiveRoom(data[0]);
      })
      .catch(console.error);
  }, [auth]);

  // ── Load messages when room changes ──────────────────────────────────────
  const loadMessages = useCallback(
    async (beforeId = null) => {
      if (!auth || !activeRoom || loadingMsgs) return;

      setLoadingMsgs(true);
      try {
        const params = { room_id: String(activeRoom.id), limit: 30 };
        if (beforeId) params.before_id = beforeId;

        const { data } = await axios.get(`${BACKEND_URL}/api/messages`, {
          params,
          headers: { Authorization: `Bearer ${auth.token}` },
        });

        if (data.length < 30) setHasMore(false);
        else setHasMore(true);

        if (beforeId) {
          setMessages(prev => [...data, ...prev]);
        } else {
          setMessages(data);
        }
      } catch (err) {
        console.error('Failed to load messages:', err);
      } finally {
        setLoadingMsgs(false);
      }
    },
    [auth, activeRoom, loadingMsgs]
  );

  useEffect(() => {
    if (!activeRoom) return;
    setMessages([]);
    setHasMore(true);
    // Tell the server we're joining this specific room
    socket.emit('join-room', String(activeRoom.id));
    loadMessages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRoom]);

  // ── Auth handlers ─────────────────────────────────────────────────────────
  const handleAuth = (data) => {
    saveSession(data);
    setAuth(data);
  };

  const handleLogout = () => {
    clearSession();
    setAuth(null);
    setRooms([]);
    setActiveRoom(null);
    setMessages([]);
    setUsers([]);
    setTypingUsers([]);
    socket.disconnect();
  };

  // Called when user saves new username/password — refresh token + session
  const handleSettingsSaved = (data) => {
    saveSession(data);
    setAuth(data);
    // Rejoin socket with new token so username updates live
    socket.emit('join', { token: data.token, username: data.username });
  };

  // ── Room handlers ─────────────────────────────────────────────────────────
  const handleRoomSelect = (room) => {
    if (activeRoom?.id === room.id) return;
    setActiveRoom(room);
    setSidebarOpen(false);
  };

  const handleRoomCreated = (room) => {
    setRooms(prev => [...prev, room]);
    setActiveRoom(room);
  };

  // ── Message handlers ──────────────────────────────────────────────────────
  const handleSend = (text) => {
    socket.emit('send_message', {
      room_id: String(activeRoom.id),
      content: text,
      message_type: 'text',
    });
  };

  const handleDeleteMessage = (messageId) => {
    socket.emit('delete_message', {
      messageId,
      room_id: String(activeRoom.id),
    });
  };

  const handleEditMessage = (messageId, content) => {
    socket.emit('edit_message', {
      messageId,
      content,
      room_id: String(activeRoom.id),
    });
  };

  // ── File upload ───────────────────────────────────────────────────────────
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('upload_preset', import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET);

      const res = await fetch(
        `https://api.cloudinary.com/v1_1/${import.meta.env.VITE_CLOUDINARY_CLOUD_NAME}/auto/upload`,
        { method: 'POST', body: formData }
      );
      const data = await res.json();

      socket.emit('send_message', {
        room_id: String(activeRoom.id),
        content: data.secure_url,
        message_type: file.type.startsWith('image/') ? 'image' : 'document',
      });
    } catch (err) {
      console.error('Upload failed:', err);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  if (!auth) return <JoinScreen onAuth={handleAuth} />;

  return (
    <div className="chat-app">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Left sidebar */}
      <div className={`sidebar-wrapper ${sidebarOpen ? 'sidebar-wrapper--open' : ''}`}>
        <RoomSidebar
          rooms={rooms}
          activeRoom={activeRoom}
          onRoomSelect={handleRoomSelect}
          users={users}
          username={auth.username}
          token={auth.token}
          isAdmin={auth.isAdmin}
          onRoomCreated={handleRoomCreated}
          onLogout={handleLogout}
          onShowAdmin={() => setShowAdmin(true)}
          onShowSettings={() => setShowSettings(true)}
        />
      </div>

      {/* Right: chat view */}
      <div className="chat-view-container">
        {/* Header */}
        <div className="chat-view-header">
          {/* Mobile hamburger */}
          <button
            className="hamburger-btn"
            onClick={() => setSidebarOpen(v => !v)}
            aria-label="Open rooms"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="6" x2="21" y2="6"/>
              <line x1="3" y1="12" x2="21" y2="12"/>
              <line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>

          <div className="chat-view-avatar">
            {activeRoom ? activeRoom.name.charAt(0).toUpperCase() : '#'}
          </div>

          <div className="chat-view-info">
            <h3>{activeRoom ? `# ${activeRoom.name}` : 'Select a room'}</h3>
            <span className="chat-view-status">{users.length} online</span>
          </div>
        </div>

        {/* Messages */}
        {activeRoom ? (
          <>
            <MessageList
              messages={messages}
              username={auth.username}
              isAdmin={auth.isAdmin}
              loading={loadingMsgs}
              hasMore={hasMore}
              onLoadMore={(id) => loadMessages(id)}
              onDeleteMessage={handleDeleteMessage}
              onEditMessage={handleEditMessage}
              typingUsers={typingUsers}
            />
            <MessageInput
              onSend={handleSend}
              onFileUpload={handleFileUpload}
              uploading={uploading}
              roomId={String(activeRoom.id)}
            />
          </>
        ) : (
          <div className="no-room-selected">
            <p>Select or create a room to start chatting</p>
          </div>
        )}
      </div>

      {/* Admin Panel (modal) */}
      {showAdmin && auth.isAdmin && (
        <AdminPanel token={auth.token} onClose={() => setShowAdmin(false)} />
      )}

      {/* Settings Panel (modal) */}
      {showSettings && (
        <SettingsPanel
          auth={auth}
          onClose={() => setShowSettings(false)}
          onSaved={handleSettingsSaved}
        />
      )}
    </div>
  );
}

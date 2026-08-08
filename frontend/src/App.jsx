import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import socket, { BACKEND_URL } from './socket';
import JoinScreen    from './components/JoinScreen';
import RoomSidebar   from './components/RoomSidebar';
import MessageList   from './components/MessageList';
import MessageInput  from './components/MessageInput';
import DMView        from './components/DMView';
import AdminPanel    from './components/AdminPanel';
import SettingsPanel from './components/SettingsPanel';
import './App.css';

// ── Session helpers ────────────────────────────────────────────────────────
const SESSION_KEY = 'chat_session';
const saveSession  = (d) => localStorage.setItem(SESSION_KEY, JSON.stringify(d));
const loadSession  = () => { try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; } };
const clearSession = () => localStorage.removeItem(SESSION_KEY);

export default function App() {
  // Auth
  const [auth, setAuth] = useState(null);

  // Rooms
  const [rooms,      setRooms]      = useState([]);
  const [activeRoom, setActiveRoom] = useState(null);

  // Active DM (null = viewing a room)
  const [activeDM, setActiveDM] = useState(null);

  // Room messages
  const [messages,    setMessages]    = useState([]);
  const [hasMore,     setHasMore]     = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);

  // Reply state for room chat
  const [replyTo, setReplyTo] = useState(null);

  // File upload
  const [uploading, setUploading] = useState(false);

  // Online users list (usernames)
  const [onlineUsers, setOnlineUsers] = useState([]);

  // Typing (room)
  const [typingUsers, setTypingUsers] = useState([]);

  // UI
  const [sidebarOpen,   setSidebarOpen]   = useState(false);
  const [showAdmin,     setShowAdmin]     = useState(false);
  const [showSettings,  setShowSettings]  = useState(false);

  // ── Restore session ──────────────────────────────────────────────────────
  useEffect(() => {
    const s = loadSession();
    if (s?.token && s?.username) setAuth(s);
  }, []);

  // ── Connect socket ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!auth) return;
    if (!socket.connected) socket.connect();
    socket.emit('join', { token: auth.token, username: auth.username });
  }, [auth]);

  // ── Socket listeners ─────────────────────────────────────────────────────
  useEffect(() => {
    const onReceive   = (msg) => setMessages(prev => [...prev, msg]);
    const onDeleted   = (id)  => setMessages(prev => prev.filter(m => m.id !== id));
    const onEdited    = (msg) => setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, content: msg.content, edited: true } : m));
    const onJoined    = (u)   => setOnlineUsers(prev => prev.includes(u) ? prev : [...prev, u]);
    const onLeft      = (u)   => setOnlineUsers(prev => prev.filter(x => x !== u));
    const onList      = (l)   => setOnlineUsers(l);
    const onTyping    = ({ username: u, isTyping }) =>
      setTypingUsers(prev => isTyping ? (prev.includes(u) ? prev : [...prev, u]) : prev.filter(x => x !== u));

    socket.on('receive_message', onReceive);
    socket.on('message_deleted', onDeleted);
    socket.on('message_edited',  onEdited);
    socket.on('user-joined',     onJoined);
    socket.on('user-left',       onLeft);
    socket.on('users-list',      onList);
    socket.on('user-typing',     onTyping);

    return () => {
      socket.off('receive_message', onReceive);
      socket.off('message_deleted', onDeleted);
      socket.off('message_edited',  onEdited);
      socket.off('user-joined',     onJoined);
      socket.off('user-left',       onLeft);
      socket.off('users-list',      onList);
      socket.off('user-typing',     onTyping);
    };
  }, []);

  // ── Fetch rooms ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!auth) return;
    axios.get(`${BACKEND_URL}/api/rooms`, { headers: { Authorization: `Bearer ${auth.token}` } })
      .then(({ data }) => { setRooms(data); if (data.length > 0) setActiveRoom(data[0]); })
      .catch(console.error);
  }, [auth]);

  // ── Load room messages ───────────────────────────────────────────────────
  const loadMessages = useCallback(async (beforeId = null) => {
    if (!auth || !activeRoom || loadingMsgs) return;
    setLoadingMsgs(true);
    try {
      const params = { room_id: String(activeRoom.id), limit: 30 };
      if (beforeId) params.before_id = beforeId;
      const { data } = await axios.get(`${BACKEND_URL}/api/messages`, {
        params, headers: { Authorization: `Bearer ${auth.token}` },
      });
      if (data.length < 30) setHasMore(false); else setHasMore(true);
      setMessages(prev => beforeId ? [...data, ...prev] : data);
    } catch (err) { console.error('Failed to load messages:', err); }
    finally { setLoadingMsgs(false); }
  }, [auth, activeRoom, loadingMsgs]);

  useEffect(() => {
    if (!activeRoom) return;
    setMessages([]); setHasMore(true); setReplyTo(null);
    socket.emit('join-room', String(activeRoom.id));
    loadMessages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRoom]);

  // ── Auth ─────────────────────────────────────────────────────────────────
  const handleAuth = (data) => { saveSession(data); setAuth(data); };
  const handleLogout = () => {
    clearSession(); setAuth(null); setRooms([]); setActiveRoom(null);
    setActiveDM(null); setMessages([]); setOnlineUsers([]); setTypingUsers([]);
    socket.disconnect();
  };
  const handleSettingsSaved = (data) => {
    saveSession(data); setAuth(data);
    socket.emit('join', { token: data.token, username: data.username });
  };

  // ── Room handlers ─────────────────────────────────────────────────────────
  const handleRoomSelect = (room) => {
    if (activeRoom?.id === room.id && !activeDM) return;
    setActiveDM(null);
    setActiveRoom(room);
    setSidebarOpen(false);
  };
  const handleRoomCreated = (room) => { setRooms(prev => [...prev, room]); handleRoomSelect(room); };

  // ── DM handlers ───────────────────────────────────────────────────────────
  const handleDMSelect = (conv) => {
    setActiveDM(conv);
    // Let sidebar's socket listener know which DM is open (to skip incrementing unread)
    window.__activeDMId = conv.id;
    setSidebarOpen(false);
  };

  // ── Room message handlers ─────────────────────────────────────────────────
  const handleSend = (text) => {
    socket.emit('send_message', {
      room_id:      String(activeRoom.id),
      content:      text,
      message_type: 'text',
      reply_to_id:  replyTo?.id || null,
    });
    setReplyTo(null);
  };
  const handleDeleteMessage = (id) => socket.emit('delete_message', { messageId: id, room_id: String(activeRoom.id) });
  const handleEditMessage   = (id, content) => socket.emit('edit_message', { messageId: id, content, room_id: String(activeRoom.id) });
  const handleReplyMessage  = (msg) => setReplyTo(msg);

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('upload_preset', import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET);
      const res  = await fetch(`https://api.cloudinary.com/v1_1/${import.meta.env.VITE_CLOUDINARY_CLOUD_NAME}/auto/upload`, { method: 'POST', body: fd });
      const data = await res.json();
      socket.emit('send_message', {
        room_id: String(activeRoom.id),
        content: data.secure_url,
        message_type: file.type.startsWith('image/') ? 'image' : 'document',
      });
    } catch (err) { console.error('Upload failed:', err); }
    finally { setUploading(false); e.target.value = ''; }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  if (!auth) return <JoinScreen onAuth={handleAuth} />;

  return (
    <div className="chat-app">
      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}

      {/* Sidebar */}
      <div className={`sidebar-wrapper ${sidebarOpen ? 'sidebar-wrapper--open' : ''}`}>
        <RoomSidebar
          rooms={rooms}
          activeRoom={activeRoom}
          onRoomSelect={handleRoomSelect}
          activeDM={activeDM}
          onDMSelect={handleDMSelect}
          onlineUsers={onlineUsers}
          username={auth.username}
          userId={auth.userId}
          token={auth.token}
          isAdmin={auth.isAdmin}
          onRoomCreated={handleRoomCreated}
          onLogout={handleLogout}
          onShowAdmin={() => setShowAdmin(true)}
          onShowSettings={() => setShowSettings(true)}
        />
      </div>

      {/* Main area — DM or Room */}
      {activeDM ? (
        <DMView
          conv={activeDM}
          auth={auth}
          onClose={() => { setActiveDM(null); window.__activeDMId = null; }}
          onUnreadCleared={(convId) => {
            // Tell sidebar to zero-out the badge for this conv
            window.__activeDMId = convId;
          }}
        />
      ) : (
        <div className="chat-view-container">
          {/* Header */}
          <div className="chat-view-header">
            <button className="hamburger-btn" onClick={() => setSidebarOpen(v => !v)} aria-label="Open sidebar">
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
              <span className="chat-view-status">{onlineUsers.length} online</span>
            </div>
          </div>

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
                onReplyMessage={handleReplyMessage}
                typingUsers={typingUsers}
              />
              <MessageInput
                onSend={handleSend}
                onFileUpload={handleFileUpload}
                uploading={uploading}
                roomId={String(activeRoom.id)}
                replyTo={replyTo}
                onCancelReply={() => setReplyTo(null)}
              />
            </>
          ) : (
            <div className="no-room-selected">
              <p>Select a room to start chatting</p>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {showAdmin && auth.isAdmin && <AdminPanel token={auth.token} onClose={() => setShowAdmin(false)} />}
      {showSettings && <SettingsPanel auth={auth} onClose={() => setShowSettings(false)} onSaved={handleSettingsSaved} />}
    </div>
  );
}

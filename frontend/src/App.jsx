import { useState, useEffect } from 'react';
import { useAuth } from './hooks/useAuth';
import { useSocket } from './hooks/useSocket';
import { useChat } from './hooks/useChat';
import api from './services/api';
import JoinScreen    from './components/Auth/JoinScreen';
import RoomSidebar   from './components/Sidebar/RoomSidebar';
import MessageList   from './components/Chat/MessageList';
import MessageInput  from './components/Chat/MessageInput';
import DMView        from './components/Chat/DMView';
import AdminPanel    from './components/Admin/AdminPanel';
import SettingsPanel from './components/Admin/SettingsPanel';
import './App.css';

export default function App() {
  const { auth, login, logout, updateAuth } = useAuth();
  const socket = useSocket();

  const [rooms,      setRooms]      = useState([]);
  const [activeRoom, setActiveRoom] = useState(null);
  const [activeDM,   setActiveDM]   = useState(null);
  const [uploading,  setUploading]  = useState(false);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [sidebarOpen,  setSidebarOpen]  = useState(false);
  const [showAdmin,    setShowAdmin]    = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [roomUnread,   setRoomUnread]   = useState({});
  const [isOnline,     setIsOnline]     = useState(navigator.onLine);

  const {
    messages, hasMore, loading, typingUsers,
    replyTo, setReplyTo,
    loadMessages, sendMessage, deleteMessage, editMessage, sendFile,
  } = useChat(auth, activeRoom);

  useEffect(() => {
    if (!auth) return;
    socket.auth = { token: auth.token };
    const join = () => socket.emit('join', { token: auth.token });
    if (!socket.connected) socket.connect();
    else join();
    socket.on('connect', join);
    return () => socket.off('connect', join);
  }, [auth, socket]);

  useEffect(() => {
    const onJoined = (u) => setOnlineUsers(prev => prev.includes(u) ? prev : [...prev, u]);
    const onLeft   = (u) => setOnlineUsers(prev => prev.filter(x => x !== u));
    const onList   = (l) => setOnlineUsers(Array.isArray(l) ? l.map(x => typeof x === 'string' ? x : x.username) : []);

    socket.on('user-joined',  onJoined);
    socket.on('user-left',    onLeft);
    socket.on('users-list',   onList);
    socket.on('online-users', onList);

    return () => {
      socket.off('user-joined',  onJoined);
      socket.off('user-left',    onLeft);
      socket.off('users-list',   onList);
      socket.off('online-users', onList);
    };
  }, [socket]);

  useEffect(() => {
    if (!auth) return;
    api
      .get('/api/rooms')
      .then(({ data }) => { setRooms(data); if (data.length > 0) setActiveRoom(data[0]); })
      .catch(console.error);
  }, [auth]);

  useEffect(() => {
    if (!auth) return;
    const loadUnread = async () => {
      try {
        const { data } = await api.get('/api/rooms/unread');
        setRoomUnread(Object.fromEntries(data.map(row => [String(row.id), Number(row.unread_count) || 0])));
      } catch { /* The chat remains usable if unread counts cannot load. */ }
    };
    loadUnread();
    const interval = setInterval(loadUnread, 15000);
    return () => clearInterval(interval);
  }, [auth]);

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  const handleLogout = () => {
    logout();
    setRooms([]);
    setActiveRoom(null);
    setActiveDM(null);
    setOnlineUsers([]);
    socket.disconnect();
  };

  const handleSettingsSaved = (data) => {
    updateAuth(data);
    socket.auth = { token: data.token };
    if (socket.connected) {
      socket.disconnect();
      socket.connect();
    }
  };

  const handleRoomSelect = (room) => {
    if (activeRoom?.id === room.id && !activeDM) return;
    setActiveDM(null);
    setActiveRoom(room);
    setRoomUnread(prev => ({ ...prev, [String(room.id)]: 0 }));
    setSidebarOpen(false);
  };
  const handleRoomCreated = (room) => { setRooms(prev => [...prev, room]); handleRoomSelect(room); };

  const handleDeleteRoom = async (room) => {
    if (!confirm(`Delete room "#${room.name}" and all its messages? This cannot be undone.`)) return;
    try {
      await api.delete(`/api/rooms/${room.id}`);
      setRooms(prev => prev.filter(r => r.id !== room.id));
      if (activeRoom?.id === room.id) {
        setActiveRoom(() => {
          const remaining = rooms.filter(r => r.id !== room.id);
          return remaining.length > 0 ? remaining[0] : null;
        });
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete room');
    }
  };

  const handleDMSelect = (conv) => {
    setActiveDM(conv);
    setSidebarOpen(false);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      await sendFile(file);
    } catch (err) {
      console.error('Upload failed:', err);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  if (!auth) return <JoinScreen onAuth={login} />;

  return (
    <div className="chat-app">
      {!isOnline && <div className="network-status" role="status">You are offline. New messages will send once you reconnect.</div>}
      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}

      <div className={`sidebar-wrapper ${sidebarOpen ? 'sidebar-wrapper--open' : ''}`}>
        <RoomSidebar
          rooms={rooms}
          activeRoom={activeRoom}
          onRoomSelect={handleRoomSelect}
          activeDM={activeDM}
          onDMSelect={handleDMSelect}
          onlineUsers={onlineUsers}
          roomUnread={roomUnread}
          username={auth.username}
          userId={auth.userId}
          token={auth.token}
          isAdmin={auth.isAdmin}
          onRoomCreated={handleRoomCreated}
          onDeleteRoom={handleDeleteRoom}
          onLogout={handleLogout}
          onShowAdmin={() => setShowAdmin(true)}
          onShowSettings={() => setShowSettings(true)}
        />
      </div>

      {activeDM ? (
        <DMView
          conv={activeDM}
          auth={auth}
          onClose={() => setActiveDM(null)}
        />
      ) : (
        <div className="chat-view-container">
          <div className="chat-view-header">
            <button className="hamburger-btn" onClick={() => setSidebarOpen(v => !v)} aria-label="Open sidebar">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="6"  x2="21" y2="6"/>
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
                loading={loading}
                hasMore={hasMore}
                onLoadMore={(id) => loadMessages(id)}
                onDeleteMessage={deleteMessage}
                onEditMessage={editMessage}
                onReplyMessage={setReplyTo}
                typingUsers={typingUsers}
                myUserId={auth.userId}
              />
              <MessageInput
                onSend={sendMessage}
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

      {showAdmin && auth.isAdmin && (
        <AdminPanel token={auth.token} onClose={() => setShowAdmin(false)} />
      )}
      {showSettings && (
        <SettingsPanel auth={auth} onClose={() => setShowSettings(false)} onSaved={handleSettingsSaved} />
      )}
    </div>
  );
}

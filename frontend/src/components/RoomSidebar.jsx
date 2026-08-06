import { useState, useEffect } from 'react';
import axios from 'axios';
import { BACKEND_URL } from '../socket';

/**
 * Formats a last_seen timestamp into a human-readable string.
 * NULL means the user is currently online.
 */
function formatLastSeen(lastSeen) {
  if (!lastSeen) return null; // online now
  const diff = Math.floor((Date.now() - new Date(lastSeen)) / 1000);
  if (diff < 60)   return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(lastSeen).toLocaleDateString([], { day: '2-digit', month: 'short' });
}

/**
 * RoomSidebar — shows the list of rooms, online users with last seen, and lets admins create rooms.
 */
export default function RoomSidebar({ rooms, activeRoom, onRoomSelect, users, username, token, isAdmin, onRoomCreated, onLogout, onShowAdmin, onShowSettings }) {
  const [showNewRoom, setShowNewRoom] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [creating, setCreating]       = useState(false);
  const [createError, setCreateError] = useState('');
  const [lastSeenMap, setLastSeenMap] = useState({}); // { username: timestamp | null }
  const [showAllUsers, setShowAllUsers] = useState(false);

  // Fetch last-seen data periodically
  useEffect(() => {
    const fetch = async () => {
      try {
        const { data } = await axios.get(`${BACKEND_URL}/api/users/last-seen`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const map = {};
        data.forEach(u => { map[u.username] = u.last_seen; });
        setLastSeenMap(map);
      } catch { /* silent */ }
    };
    fetch();
    const interval = setInterval(fetch, 30000); // refresh every 30s
    return () => clearInterval(interval);
  }, [token]);

  const handleCreateRoom = async (e) => {
    e.preventDefault();
    if (!newRoomName.trim()) return;
    setCreating(true);
    setCreateError('');
    try {
      const { data } = await axios.post(
        `${BACKEND_URL}/api/rooms`,
        { name: newRoomName.trim() },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      onRoomCreated(data);
      setNewRoomName('');
      setShowNewRoom(false);
    } catch (err) {
      setCreateError(err.response?.data?.error || 'Failed to create room');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="sidebar">
      {/* Header */}
      <div className="sidebar-header">
        <div className="sidebar-user">
          <div className="user-avatar sidebar-avatar">
            {username.charAt(0).toUpperCase()}
          </div>
          <span className="sidebar-username">{username}</span>
        </div>
        <div className="sidebar-header-btns">
          {isAdmin && (
            <button className="admin-open-btn" onClick={onShowAdmin} title="Admin Panel">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
            </button>
          )}
          {/* Settings button — all users */}
          <button className="settings-btn" onClick={onShowSettings} title="Settings">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.52V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
          <button className="logout-btn" onClick={onLogout} title="Sign out">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Users section — online + last seen */}
      <div className="sidebar-section users-section">
        <div className="sidebar-section-header">
          <p className="sidebar-section-title">Users</p>
          <button
            className="toggle-users-btn"
            onClick={() => setShowAllUsers(v => !v)}
            title={showAllUsers ? 'Show online only' : 'Show all users'}
          >
            {showAllUsers ? 'Online' : 'All'}
          </button>
        </div>

        <div className="users-list-vertical">
          {Object.entries(lastSeenMap)
            .filter(([uname, lastSeen]) => showAllUsers || users.includes(uname))
            .sort(([, a], [, b]) => {
              // Online (null) first, then by most recently seen
              if (!a && b) return -1;
              if (a && !b) return 1;
              if (!a && !b) return 0;
              return new Date(b) - new Date(a);
            })
            .map(([uname, lastSeen]) => {
              const isOnline = users.includes(uname);
              const lastSeenText = formatLastSeen(lastSeen);
              return (
                <div key={uname} className="user-row">
                  <div className={`user-row-avatar ${isOnline ? 'user-row-avatar--online' : ''}`}>
                    {uname.charAt(0).toUpperCase()}
                  </div>
                  <div className="user-row-info">
                    <span className="user-row-name">{uname}</span>
                    <span className={`user-row-status ${isOnline ? 'user-row-status--online' : ''}`}>
                      {isOnline ? '● Online' : lastSeenText ? `Last seen ${lastSeenText}` : 'Never seen'}
                    </span>
                  </div>
                </div>
              );
            })}
          {Object.keys(lastSeenMap).length === 0 && (
            <span className="sidebar-empty">No users yet</span>
          )}
        </div>
      </div>

      {/* Rooms list */}
      <div className="sidebar-section rooms-section">
        <div className="sidebar-section-header">
          <p className="sidebar-section-title">Rooms</p>
          {/* Only admins can create rooms */}
          {isAdmin && (
            <button
              className="new-room-btn"
              onClick={() => { setShowNewRoom(v => !v); setCreateError(''); }}
              title="Create room"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
            </button>
          )}
        </div>

        {showNewRoom && (
          <form className="new-room-form" onSubmit={handleCreateRoom}>
            <input
              type="text"
              placeholder="Room name…"
              value={newRoomName}
              onChange={(e) => setNewRoomName(e.target.value)}
              className="new-room-input"
              maxLength={50}
              disabled={creating}
              autoFocus
            />
            {createError && <p className="auth-error">{createError}</p>}
            <button type="submit" className="new-room-submit" disabled={creating || !newRoomName.trim()}>
              {creating ? 'Creating…' : 'Create'}
            </button>
          </form>
        )}

        <div className="rooms-list">
          {rooms.map((room) => (
            <button
              key={room.id}
              className={`room-item ${activeRoom?.id === room.id ? 'room-item--active' : ''}`}
              onClick={() => onRoomSelect(room)}
            >
              <span className="room-hash">#</span>
              <span className="room-name">{room.name}</span>
            </button>
          ))}
          {rooms.length === 0 && <p className="sidebar-empty">No rooms yet</p>}
        </div>
      </div>
    </div>
  );
}

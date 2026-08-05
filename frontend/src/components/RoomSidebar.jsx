import { useState } from 'react';
import axios from 'axios';
import { BACKEND_URL } from '../socket';

/**
 * RoomSidebar — shows the list of rooms, online users, and lets you create rooms.
 */
export default function RoomSidebar({ rooms, activeRoom, onRoomSelect, users, username, token, onRoomCreated, onLogout }) {
  const [showNewRoom, setShowNewRoom] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

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
        <button className="logout-btn" onClick={onLogout} title="Sign out">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </button>
      </div>

      {/* Online users strip */}
      <div className="sidebar-section">
        <p className="sidebar-section-title">Online ({users.length})</p>
        <div className="users-scroll">
          {users.map((u, i) => (
            <div key={i} className="online-user-chip">
              <div className="online-avatar">{u.charAt(0).toUpperCase()}</div>
              <span className="online-name">{u}</span>
            </div>
          ))}
          {users.length === 0 && <span className="sidebar-empty">No one online</span>}
        </div>
      </div>

      {/* Rooms list */}
      <div className="sidebar-section rooms-section">
        <div className="sidebar-section-header">
          <p className="sidebar-section-title">Rooms</p>
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

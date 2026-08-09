import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import socket, { BACKEND_URL } from '../../socket';

function fmtSeen(ts) {
  if (!ts) return null;
  const diff = Math.floor((Date.now() - new Date(ts)) / 1000);
  if (diff < 60)    return 'just now';
  if (diff < 3600)  return `${Math.floor(diff/60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
  return new Date(ts).toLocaleDateString([], { day: '2-digit', month: 'short' });
}

function fmtLastMsg(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (d.toDateString() === new Date().toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { day: '2-digit', month: 'short' });
}

export default function RoomSidebar({
  rooms, activeRoom, onRoomSelect,
  activeDM, onDMSelect,
  onlineUsers, onlineUsersData, username, token, isAdmin, userId,
  onRoomCreated, onLogout, onShowAdmin, onShowSettings, onStartCall,
}) {
  const [tab,           setTab]           = useState('chats');
  const [showNewRoom,   setShowNewRoom]   = useState(false);
  const [newRoomName,   setNewRoomName]   = useState('');
  const [creating,      setCreating]      = useState(false);
  const [createError,   setCreateError]   = useState('');
  const [search,        setSearch]        = useState('');
  const [conversations, setConversations] = useState([]);
  const [lastSeenMap,   setLastSeenMap]   = useState({});
  const [startingDM,    setStartingDM]    = useState(false);
  const [callMode,      setCallMode]      = useState('video');

  // ── useCallback declarations FIRST — must come before any useEffect that uses them ──

  const fetchLastSeen = useCallback(async () => {
    try {
      const { data } = await axios.get(`${BACKEND_URL}/api/users/last-seen`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const map = {};
      data.forEach(u => { map[u.username] = u.last_seen; });
      setLastSeenMap(map);
    } catch { /* silent */ }
  }, [token]);

  const fetchConversations = useCallback(async () => {
    try {
      const { data } = await axios.get(`${BACKEND_URL}/api/dm/conversations`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setConversations(data);
    } catch { /* silent */ }
  }, [token]);

  // ── useEffect hooks AFTER useCallback declarations ──────────────────────────

  // Poll + reconnect refetch
  useEffect(() => {
    fetchLastSeen();
    fetchConversations();
    const i1 = setInterval(fetchLastSeen,     30000);
    const i2 = setInterval(fetchConversations, 5000);

    const onReconnect = () => fetchConversations();
    socket.on('connect', onReconnect);

    return () => {
      clearInterval(i1);
      clearInterval(i2);
      socket.off('connect', onReconnect);
    };
  }, [fetchLastSeen, fetchConversations]);

  // Socket DM events + focus/visibility refetch
  useEffect(() => {
    const onReceiveDM = (msg) => {
      setConversations(prev => prev.map(c => {
        if (String(c.id) !== String(msg.conv_id)) return c;
        const currentlyOpen = window.__activeDMId && String(window.__activeDMId) === String(c.id);
        if (currentlyOpen) return { ...c, last_message: msg.content, last_message_at: msg.created_at };
        return {
          ...c,
          last_message: msg.content,
          last_message_at: msg.created_at,
          unread_count: (Number(c.unread_count) || 0) + 1,
        };
      }));
    };

    const onDmRead = ({ convId: cid, readerId }) => {
      if (String(readerId) !== String(userId)) return;
      setConversations(prev => prev.map(c =>
        String(c.id) === String(cid) ? { ...c, unread_count: 0 } : c
      ));
    };

    const onFocus = () => fetchConversations();
    const onVisibility = () => { if (!document.hidden) fetchConversations(); };

    socket.on('receive_dm', onReceiveDM);
    socket.on('dm_read',    onDmRead);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      socket.off('receive_dm', onReceiveDM);
      socket.off('dm_read',    onDmRead);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [userId, fetchConversations]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleCreateRoom = async (e) => {
    e.preventDefault();
    if (!newRoomName.trim()) return;
    setCreating(true); setCreateError('');
    try {
      const { data } = await axios.post(
        `${BACKEND_URL}/api/rooms`,
        { name: newRoomName.trim() },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      onRoomCreated(data);
      setNewRoomName(''); setShowNewRoom(false);
    } catch (err) {
      setCreateError(err.response?.data?.error || 'Failed to create room');
    } finally { setCreating(false); }
  };

  const handleStartDM = async (targetUsername) => {
    if (startingDM) return;
    setStartingDM(true);
    try {
      const { data } = await axios.post(
        `${BACKEND_URL}/api/dm/conversations`,
        { targetUsername },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      data.is_other_online = onlineUsers.includes(data.other_username);
      setConversations(prev => {
        const exists = prev.find(c => c.id === data.id);
        return exists ? prev : [data, ...prev];
      });
      onDMSelect(data);
      setTab('chats');
      setSearch('');
    } catch (err) {
      console.error('Failed to start DM:', err);
    } finally { setStartingDM(false); }
  };

  // ── Derived values ─────────────────────────────────────────────────────────

  const enrichedConvs = conversations.map(c => ({
    ...c,
    is_other_online: onlineUsers.includes(c.other_username),
  }));

  const onlineByUsername = Object.fromEntries((onlineUsersData || []).map(user => [user.username, user]));
  const allUsers     = Object.keys(lastSeenMap).filter(u => u !== username);
  const filteredUsers = search.trim()
    ? allUsers.filter(u => u.toLowerCase().includes(search.toLowerCase()))
    : allUsers;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="sidebar">
      {/* Header */}
      <div className="sidebar-header">
        <div className="sidebar-user">
          <div className="user-avatar sidebar-avatar">{username.charAt(0).toUpperCase()}</div>
          <span className="sidebar-username">{username}</span>
        </div>
        <div className="sidebar-header-btns">
          {isAdmin && (
            <button className="admin-open-btn" onClick={onShowAdmin} title="Admin Panel">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.52V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
            </button>
          )}
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

      {/* Tabs */}
      <div className="sidebar-tabs">
        <button className={`sidebar-tab ${tab === 'chats' ? 'sidebar-tab--active' : ''}`} onClick={() => setTab('chats')}>
          Chats
        </button>
        <button className={`sidebar-tab ${tab === 'users' ? 'sidebar-tab--active' : ''}`} onClick={() => setTab('users')}>
          Users <span className="online-count">{onlineUsers.length}</span>
        </button>
      </div>

      {/* ── CHATS TAB ── */}
      {tab === 'chats' && (
        <div className="sidebar-content">
          <div className="sidebar-section-header">
            <p className="sidebar-section-title">Rooms</p>
            {isAdmin && (
              <button className="new-room-btn" onClick={() => { setShowNewRoom(v => !v); setCreateError(''); }} title="Create room">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
              </button>
            )}
          </div>

          {showNewRoom && (
            <form className="new-room-form" onSubmit={handleCreateRoom}>
              <input type="text" placeholder="Room name…" value={newRoomName}
                onChange={e => setNewRoomName(e.target.value)} className="new-room-input"
                maxLength={50} disabled={creating} autoFocus />
              {createError && <p className="auth-error">{createError}</p>}
              <button type="submit" className="new-room-submit" disabled={creating || !newRoomName.trim()}>
                {creating ? 'Creating…' : 'Create'}
              </button>
            </form>
          )}

          <div className="chat-list">
            {rooms.map(room => (
              <button key={room.id}
                className={`chat-list-item ${activeRoom?.id === room.id && !activeDM ? 'chat-list-item--active' : ''}`}
                onClick={() => onRoomSelect(room)}>
                <div className="chat-list-avatar chat-list-avatar--room">
                  {room.name.charAt(0).toUpperCase()}
                </div>
                <div className="chat-list-info">
                  <span className="chat-list-name"># {room.name}</span>
                </div>
              </button>
            ))}
          </div>

          {enrichedConvs.length > 0 && (
            <>
              <div className="sidebar-section-header" style={{ marginTop: 12 }}>
                <p className="sidebar-section-title">Direct Messages</p>
              </div>
              <div className="chat-list">
                {enrichedConvs.map(conv => {
                  const unread = Number(conv.unread_count) || 0;
                  return (
                    <button key={conv.id}
                      className={`chat-list-item ${activeDM?.id === conv.id ? 'chat-list-item--active' : ''}`}
                      onClick={() => onDMSelect({ ...conv })}>
                      <div className={`chat-list-avatar ${conv.is_other_online ? 'chat-list-avatar--online' : ''}`}>
                        {conv.other_username?.charAt(0).toUpperCase()}
                      </div>
                      <div className="chat-list-info">
                        <div className="chat-list-row">
                          <span className={`chat-list-name ${unread > 0 ? 'chat-list-name--unread' : ''}`}>
                            {conv.other_username}
                          </span>
                          <div className="chat-list-row-right">
                            {conv.last_message_at && (
                              <span className="chat-list-time">{fmtLastMsg(conv.last_message_at)}</span>
                            )}
                            {unread > 0 && (
                              <span className="unread-badge">{unread > 99 ? '99+' : unread}</span>
                            )}
                          </div>
                        </div>
                        {conv.last_message && (
                          <span className={`chat-list-preview ${unread > 0 ? 'chat-list-preview--unread' : ''}`}>
                            {conv.last_message}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── USERS TAB ── */}
      {tab === 'users' && (
        <div className="sidebar-content">
          <div className="user-search-wrap">
            <input type="text" placeholder="Search users…" value={search}
              onChange={e => setSearch(e.target.value)} className="user-search-input" />
          </div>
          <div className="call-mode-picker">
            <label>
              <input type="radio" name="callMode" value="video" checked={callMode === 'video'}
                onChange={() => setCallMode('video')} /> Video
            </label>
            <label>
              <input type="radio" name="callMode" value="audio" checked={callMode === 'audio'}
                onChange={() => setCallMode('audio')} /> Audio
            </label>
          </div>
          <div className="users-list-vertical">
            {filteredUsers.map(uname => {
              const isOnline = onlineUsers.includes(uname);
              const seenText = fmtSeen(lastSeenMap[uname]);
              return (
                <div key={uname} className="user-row">
                  <div className={`user-row-avatar ${isOnline ? 'user-row-avatar--online' : ''}`}>
                    {uname.charAt(0).toUpperCase()}
                  </div>
                  <div className="user-row-info">
                    <span className="user-row-name">{uname}</span>
                    <span className={`user-row-status ${isOnline ? 'user-row-status--online' : ''}`}>
                      {isOnline ? '● Online' : seenText ? `Last seen ${seenText}` : ''}
                    </span>
                  </div>
                  {uname !== username && (
                    <div className="user-row-actions">
                      <button className="dm-start-btn" onClick={() => handleStartDM(uname)}
                        disabled={startingDM} title={`Message ${uname}`}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                        </svg>
                      </button>
                      {onlineByUsername[uname] && onStartCall && (
                        <button className="call-start-btn" onClick={() => onStartCall(onlineByUsername[uname].userId, uname, callMode)}
                          title={`Call ${uname}`}>
                          📞
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {filteredUsers.length === 0 && <p className="sidebar-empty">No users found</p>}
          </div>
        </div>
      )}
    </div>
  );
}

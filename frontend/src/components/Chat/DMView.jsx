import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import socket, { BACKEND_URL } from '../../socket';
import { useWebRTC } from '../../hooks/useWebRTC';
import MessageList  from './MessageList';
import MessageInput from './MessageInput';
import CallUI       from './CallUI';

function fmtSeen(ts) {
  const diff = Math.floor((Date.now() - new Date(ts)) / 1000);
  if (diff < 60)    return 'just now';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(ts).toLocaleDateString([], { day: '2-digit', month: 'short' });
}

export default function DMView({ conv, auth, onClose, onUnreadCleared }) {
  const [messages,        setMessages]        = useState([]);
  const [hasMore,         setHasMore]         = useState(true);
  const [loading,         setLoading]         = useState(false);
  const [uploading,       setUploading]       = useState(false);
  const [replyTo,         setReplyTo]         = useState(null);
  const [typingUsers,     setTypingUsers]     = useState([]);
  const [otherLastReadId, setOtherLastReadId] = useState(Number(conv.other_last_read_id) || 0);

  const convId      = String(conv.id);
  const messagesRef = useRef([]);
  messagesRef.current = messages;

  // ── WebRTC ──────────────────────────────────────────────────────────────────
  const {
    callState, callMode, remoteInfo,
    localStream, remoteStream,
    isMuted, isCamOff, callError,
    startCall, acceptCall, rejectCall,
    endCall, toggleMute, toggleCamera,
  } = useWebRTC(auth);

  const handleStartCall = (mode) => {
    startCall(conv.other_user_id, conv.other_username, mode);
  };

  const handleEndCall = () => {
    const targetId = remoteInfo?.callerId || remoteInfo?.calleeSocketId;
    endCall(targetId);
  };

  // ── Mark read ───────────────────────────────────────────────────────────────
  const markRead = useCallback(() => {
    const msgs = messagesRef.current;
    if (!msgs.length) return;
    const lastId = msgs[msgs.length - 1].id;
    socket.emit('mark_dm_read', { convId, lastMessageId: lastId });
    if (onUnreadCleared) onUnreadCleared(convId);
  }, [convId, onUnreadCleared]);

  // ── Socket room ─────────────────────────────────────────────────────────────
  useEffect(() => {
    socket.emit('join_dm', convId);
    return () => socket.emit('leave_dm', convId);
  }, [convId]);

  // ── Socket listeners ────────────────────────────────────────────────────────
  useEffect(() => {
    const onReceive = (msg) => {
      if (String(msg.conv_id) !== convId) return;
      setMessages(prev => [...prev, msg]);
      if (msg.other_last_read_id !== undefined) setOtherLastReadId(Number(msg.other_last_read_id) || 0);
      socket.emit('mark_dm_read', { convId, lastMessageId: msg.id });
      if (onUnreadCleared) onUnreadCleared(convId);
    };
    const onEdited  = (msg) => {
      if (String(msg.conv_id) !== convId) return;
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, content: msg.content, edited: true } : m));
    };
    const onDeleted = (id) => setMessages(prev => prev.filter(m => m.id !== id));
    const onTyping  = ({ username: u, isTyping }) =>
      setTypingUsers(prev => isTyping ? (prev.includes(u) ? prev : [...prev, u]) : prev.filter(x => x !== u));
    const onDmRead  = ({ convId: cid, readerId, lastReadId }) => {
      if (cid !== convId || readerId === auth.userId) return;
      setOtherLastReadId(prev => Math.max(prev, Number(lastReadId) || 0));
    };

    socket.on('receive_dm',     onReceive);
    socket.on('dm_edited',      onEdited);
    socket.on('dm_deleted',     onDeleted);
    socket.on('dm_user_typing', onTyping);
    socket.on('dm_read',        onDmRead);
    return () => {
      socket.off('receive_dm',     onReceive);
      socket.off('dm_edited',      onEdited);
      socket.off('dm_deleted',     onDeleted);
      socket.off('dm_user_typing', onTyping);
      socket.off('dm_read',        onDmRead);
    };
  }, [convId, auth.userId, onUnreadCleared]);

  // ── Load messages ───────────────────────────────────────────────────────────
  const loadMessages = useCallback(async (beforeId = null) => {
    if (loading) return;
    setLoading(true);
    try {
      const params = { limit: 30 };
      if (beforeId) params.before_id = beforeId;
      const { data } = await axios.get(`${BACKEND_URL}/api/dm/${convId}/messages`, {
        params, headers: { Authorization: `Bearer ${auth.token}` },
      });
      if (data.length < 30) setHasMore(false); else setHasMore(true);
      if (data.length > 0 && data[0].other_last_read_id !== undefined) {
        setOtherLastReadId(Number(data[0].other_last_read_id) || 0);
      }
      setMessages(prev => beforeId ? [...data, ...prev] : data);
    } catch (err) { console.error('Failed to load DM messages:', err); }
    finally { setLoading(false); }
  }, [convId, auth.token, loading]);

  useEffect(() => {
    setMessages([]); setHasMore(true);
    setOtherLastReadId(Number(conv.other_last_read_id) || 0);
    loadMessages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convId]);

  useEffect(() => { markRead(); }, [markRead]);

  // ── Message actions ─────────────────────────────────────────────────────────
  const handleSend = (text) => {
    socket.emit('send_dm', { convId, content: text, message_type: 'text', reply_to_id: replyTo?.id || null });
    setReplyTo(null);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('upload_preset', import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET);
      const res  = await fetch(
        `https://api.cloudinary.com/v1_1/${import.meta.env.VITE_CLOUDINARY_CLOUD_NAME}/auto/upload`,
        { method: 'POST', body: fd }
      );
      const data = await res.json();
      socket.emit('send_dm', {
        convId, content: data.secure_url,
        message_type: file.type.startsWith('image/') ? 'image' : 'document',
      });
    } catch (err) { console.error('DM upload failed:', err); }
    finally { setUploading(false); e.target.value = ''; }
  };

  const handleDelete = (id)          => socket.emit('delete_dm', { messageId: id, convId });
  const handleEdit   = (id, content) => socket.emit('edit_dm',   { messageId: id, content, convId });
  const handleReply  = (msg)         => setReplyTo(msg);

  // ── Status ──────────────────────────────────────────────────────────────────
  const isOnline   = conv.is_other_online;
  const statusText = callState === 'connected'
    ? '● On a call'
    : isOnline
      ? '● Online'
      : conv.other_last_seen
        ? `Last seen ${fmtSeen(conv.other_last_seen)}`
        : '';

  const inCall = callState !== 'idle';

  return (
    <>
      {/* ── Call overlay ─────────────────────────────────────────────────── */}
      <CallUI
        callState={callState}
        callMode={callMode}
        remoteInfo={remoteInfo}
        localStream={localStream}
        remoteStream={remoteStream}
        isMuted={isMuted}
        isCamOff={isCamOff}
        callError={callError}
        onAccept={acceptCall}
        onReject={rejectCall}
        onEnd={handleEndCall}
        onToggleMute={toggleMute}
        onToggleCamera={toggleCamera}
      />

      {/* ── Chat area ────────────────────────────────────────────────────── */}
      <div className="chat-view-container">
        <div className="chat-view-header">
          <button className="back-to-rooms" onClick={onClose} aria-label="Back">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>

          <div className="chat-view-avatar dm-avatar">
            {conv.other_username?.charAt(0).toUpperCase()}
          </div>

          <div className="chat-view-info">
            <h3>{conv.other_username}</h3>
            <span className={`chat-view-status ${isOnline ? 'status-online' : ''}`}>
              {statusText}
            </span>
          </div>

          {/* Call buttons — only show when not already in a call */}
          {!inCall && (
            <div className="dm-call-btns">
              {/* Voice call */}
              <button
                className="call-header-btn"
                onClick={() => handleStartCall('audio')}
                title="Voice call"
                aria-label="Start voice call"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
                </svg>
              </button>
              {/* Video call */}
              <button
                className="call-header-btn"
                onClick={() => handleStartCall('video')}
                title="Video call"
                aria-label="Start video call"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="23 7 16 12 23 17 23 7"/>
                  <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
                </svg>
              </button>
            </div>
          )}

          {/* In-call indicator */}
          {inCall && callState !== 'connected' && (
            <span className="call-header-status">
              {callState === 'calling' ? '📞 Calling…' : '📲 Incoming…'}
            </span>
          )}
        </div>

        {/* Error toast (busy / declined) */}
        {callError && (
          <div className="call-toast">{callError}</div>
        )}

        <MessageList
          messages={messages}
          username={auth.username}
          isAdmin={auth.isAdmin}
          loading={loading}
          hasMore={hasMore}
          onLoadMore={(id) => loadMessages(id)}
          onDeleteMessage={handleDelete}
          onEditMessage={handleEdit}
          onReplyMessage={handleReply}
          typingUsers={typingUsers}
          otherLastReadId={otherLastReadId}
          myUserId={auth.userId}
        />

        <MessageInput
          onSend={handleSend}
          onFileUpload={handleFileUpload}
          uploading={uploading}
          roomId={convId}
          replyTo={replyTo}
          onCancelReply={() => setReplyTo(null)}
          isDM
        />
      </div>
    </>
  );
}

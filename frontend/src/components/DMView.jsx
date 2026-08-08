import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import socket, { BACKEND_URL } from '../socket';
import MessageList from './MessageList';
import MessageInput from './MessageInput';

/**
 * DMView — private 1-to-1 chat with a user.
 * Manages its own message state and socket room.
 */
export default function DMView({ conv, auth, onClose }) {
  const [messages,    setMessages]    = useState([]);
  const [hasMore,     setHasMore]     = useState(true);
  const [loading,     setLoading]     = useState(false);
  const [uploading,   setUploading]   = useState(false);
  const [replyTo,     setReplyTo]     = useState(null);
  const [typingUsers, setTypingUsers] = useState([]);
  const convId = String(conv.id);

  // Join DM socket room
  useEffect(() => {
    socket.emit('join_dm', convId);
    return () => socket.emit('leave_dm', convId);
  }, [convId]);

  // Socket listeners
  useEffect(() => {
    const onReceive = (msg) => {
      if (String(msg.conv_id) !== convId) return;
      setMessages(prev => [...prev, msg]);
    };
    const onEdited = (msg) => {
      if (String(msg.conv_id) !== convId) return;
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, content: msg.content, edited: true } : m));
    };
    const onDeleted = (id) => setMessages(prev => prev.filter(m => m.id !== id));
    const onTyping  = ({ username: u, isTyping }) => {
      setTypingUsers(prev => isTyping ? (prev.includes(u) ? prev : [...prev, u]) : prev.filter(x => x !== u));
    };

    socket.on('receive_dm', onReceive);
    socket.on('dm_edited',  onEdited);
    socket.on('dm_deleted', onDeleted);
    socket.on('dm_user_typing', onTyping);
    return () => {
      socket.off('receive_dm', onReceive);
      socket.off('dm_edited',  onEdited);
      socket.off('dm_deleted', onDeleted);
      socket.off('dm_user_typing', onTyping);
    };
  }, [convId]);

  // Load messages
  const loadMessages = useCallback(async (beforeId = null) => {
    if (loading) return;
    setLoading(true);
    try {
      const params = { limit: 30 };
      if (beforeId) params.before_id = beforeId;
      const { data } = await axios.get(`${BACKEND_URL}/api/dm/${convId}/messages`, {
        params,
        headers: { Authorization: `Bearer ${auth.token}` },
      });
      if (data.length < 30) setHasMore(false);
      else setHasMore(true);
      setMessages(prev => beforeId ? [...data, ...prev] : data);
    } catch (err) {
      console.error('Failed to load DM messages:', err);
    } finally {
      setLoading(false);
    }
  }, [convId, auth.token, loading]);

  useEffect(() => {
    setMessages([]);
    setHasMore(true);
    loadMessages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convId]);

  const handleSend = (text) => {
    socket.emit('send_dm', {
      convId,
      content: text,
      message_type: 'text',
      reply_to_id: replyTo?.id || null,
    });
    setReplyTo(null);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('upload_preset', import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET);
      const res  = await fetch(
        `https://api.cloudinary.com/v1_1/${import.meta.env.VITE_CLOUDINARY_CLOUD_NAME}/auto/upload`,
        { method: 'POST', body: formData }
      );
      const data = await res.json();
      socket.emit('send_dm', {
        convId,
        content: data.secure_url,
        message_type: file.type.startsWith('image/') ? 'image' : 'document',
      });
    } catch (err) { console.error('DM upload failed:', err); }
    finally { setUploading(false); e.target.value = ''; }
  };

  const handleDelete = (msgId) => socket.emit('delete_dm', { messageId: msgId, convId });
  const handleEdit   = (msgId, content) => socket.emit('edit_dm', { messageId: msgId, content, convId });
  const handleReply  = (msg) => setReplyTo(msg);

  // Online status of the other user
  const isOnline = conv.is_other_online;
  const lastSeen = conv.other_last_seen;
  const statusText = isOnline ? '● Online' :
    lastSeen ? `Last seen ${fmtSeen(lastSeen)}` : '';

  return (
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
      </div>

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
  );
}

function fmtSeen(ts) {
  const diff = Math.floor((Date.now() - new Date(ts)) / 1000);
  if (diff < 60)    return 'just now';
  if (diff < 3600)  return `${Math.floor(diff/60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
  return new Date(ts).toLocaleDateString([], { day: '2-digit', month: 'short' });
}

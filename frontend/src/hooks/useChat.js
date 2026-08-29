import { useState, useEffect, useCallback } from 'react';
import { useSocket } from './useSocket';
import api from '../services/api';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/**
 * useChat — manages room message state for a given room.
 * Returns messages, loading state, and handlers.
 */
export function useChat(auth, activeRoom) {
  const socket = useSocket();
  const [messages,    setMessages]    = useState([]);
  const [hasMore,     setHasMore]     = useState(true);
  const [loading,     setLoading]     = useState(false);
  const [typingUsers, setTypingUsers] = useState([]);
  const [replyTo,     setReplyTo]     = useState(null);

  const loadMessages = useCallback(async (beforeId = null) => {
    if (!auth || !activeRoom || loading) return;
    setLoading(true);
    try {
      const params = { room_id: String(activeRoom.id), limit: 30 };
      if (beforeId) params.before_id = beforeId;
      const { data } = await api.get('/api/messages', { params });
      if (data.length < 30) setHasMore(false); else setHasMore(true);
      setMessages(prev => beforeId ? [...data, ...prev] : data);
    } catch (err) {
      console.error('Failed to load messages:', err);
    } finally {
      setLoading(false);
    }
  }, [auth, activeRoom, loading]);

  useEffect(() => {
    if (!activeRoom) return;
    setMessages([]);
    setHasMore(true);
    setReplyTo(null);
    socket.emit('join-room', String(activeRoom.id));
    loadMessages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRoom?.id]);

  useEffect(() => {
    const onReceive = (msg) => setMessages(prev => [...prev, msg]);
    const onDeleted = (id)  => setMessages(prev => prev.filter(m => m.id !== id));
    const onEdited  = (msg) => setMessages(prev =>
      prev.map(m => m.id === msg.id ? { ...m, content: msg.content, edited: true } : m)
    );
    const onReacted = ({ messageId, reactions }) => setMessages(prev =>
      prev.map(m => m.id === messageId ? { ...m, reactions } : m)
    );
    const onTyping = ({ username: u, isTyping }) =>
      setTypingUsers(prev =>
        isTyping ? (prev.includes(u) ? prev : [...prev, u]) : prev.filter(x => x !== u)
      );

    socket.on('receive_message', onReceive);
    socket.on('message_deleted', onDeleted);
    socket.on('message_edited',  onEdited);
    socket.on('message_reactions_updated', onReacted);
    socket.on('user-typing',     onTyping);

    return () => {
      socket.off('receive_message', onReceive);
      socket.off('message_deleted', onDeleted);
      socket.off('message_edited',  onEdited);
      socket.off('message_reactions_updated', onReacted);
      socket.off('user-typing',     onTyping);
    };
  }, [socket]);

  const sendMessage = (text) => {
    if (!activeRoom) return;
    socket.emit('send_message', {
      room_id:      String(activeRoom.id),
      content:      text,
      message_type: 'text',
      reply_to_id:  replyTo?.id || null,
    });
    setReplyTo(null);
  };

  const deleteMessage = (id) => {
    if (!activeRoom) return;
    socket.emit('delete_message', { messageId: id, room_id: String(activeRoom.id) });
  };

  const editMessage = (id, content) => {
    if (!activeRoom) return;
    socket.emit('edit_message', { messageId: id, content, room_id: String(activeRoom.id) });
  };

  const sendFile = async (file) => {
    if (!activeRoom || !file) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new Error('File too large (max 10MB)');
    }
    const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
    const preset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;
    if (!cloudName || !preset) {
      throw new Error('File uploads are not configured');
    }
    const fd = new FormData();
    fd.append('file', file);
    fd.append('upload_preset', preset);
    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`,
      { method: 'POST', body: fd }
    );
    const data = await res.json();
    if (!data.secure_url) {
      throw new Error(data.error?.message || 'Upload failed');
    }
    socket.emit('send_message', {
      room_id: String(activeRoom.id),
      content: data.secure_url,
      message_type: file.type.startsWith('image/') ? 'image' : 'document',
    });
  };

  return {
    messages, hasMore, loading, typingUsers,
    replyTo, setReplyTo,
    loadMessages, sendMessage, deleteMessage, editMessage, sendFile,
  };
}

import { useRef, useState, useEffect, lazy, Suspense } from 'react';
import socket from '../socket';

// Lazy-load emoji picker to avoid Rolldown initialization order bug
const EmojiPicker = lazy(() => import('emoji-picker-react'));

/**
 * MessageInput — text input + file attachment + emoji picker + send button.
 * Supports reply context and typing events with debounce.
 */
export default function MessageInput({ onSend, onFileUpload, uploading, roomId, replyTo, onCancelReply, isDM }) {
  const [message, setMessage]       = useState('');
  const [showEmoji, setShowEmoji]   = useState(false);
  const fileInputRef                = useRef(null);
  const textareaRef                 = useRef(null);
  const typingTimerRef              = useRef(null);
  const isTypingRef                 = useRef(false);
  const emojiRef                    = useRef(null);

  // Close emoji picker when clicking outside
  useEffect(() => {
    const handler = (e) => {
      if (emojiRef.current && !emojiRef.current.contains(e.target)) {
        setShowEmoji(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Cleanup typing timer on unmount
  useEffect(() => () => clearTimeout(typingTimerRef.current), []);

  const emitTyping = (typing) => {
    if (isTypingRef.current === typing) return;
    isTypingRef.current = typing;
    if (isDM) {
      socket.emit('dm_typing', { convId: roomId, isTyping: typing });
    } else {
      socket.emit('typing', { room_id: roomId, isTyping: typing });
    }
  };

  const handleChange = (e) => {
    setMessage(e.target.value);
    // Auto-resize textarea
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
    emitTyping(true);
    clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => emitTyping(false), 1500);
  };

  const handleSend = () => {
    const text = message.trim();
    if (!text) return;
    onSend(text);
    setMessage('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    emitTyping(false);
    clearTimeout(typingTimerRef.current);
    setShowEmoji(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleEmojiClick = (emojiData) => {
    const emoji = emojiData.emoji;
    const ta = textareaRef.current;
    if (ta) {
      const start = ta.selectionStart;
      const end   = ta.selectionEnd;
      const newMsg = message.slice(0, start) + emoji + message.slice(end);
      setMessage(newMsg);
      // Restore cursor after emoji
      setTimeout(() => {
        ta.selectionStart = ta.selectionEnd = start + emoji.length;
        ta.focus();
      }, 0);
    } else {
      setMessage(prev => prev + emoji);
    }
  };

  return (
    <div className="input-area">
      {/* Reply context bar */}
      {replyTo && (
        <div className="reply-bar">
          <div className="reply-bar-content">
            <span className="reply-bar-name">{replyTo.username}</span>
            <span className="reply-bar-text">
              {replyTo.message_type === 'image' ? '📷 Photo' :
               replyTo.message_type === 'document' ? '📎 File' :
               replyTo.content?.slice(0, 60)}
            </span>
          </div>
          <button className="reply-bar-close" onClick={onCancelReply} aria-label="Cancel reply">✕</button>
        </div>
      )}

      <div className="input-container">
        {/* Hidden file input */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={onFileUpload}
          className="file-input"
          accept="image/*,.pdf,.doc,.docx"
          style={{ display: 'none' }}
        />

        {/* Attachment button */}
        <button
          className="attach-button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          title="Attach file"
          aria-label="Attach file"
        >
          {uploading ? <span>⏳</span> : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
          )}
        </button>

        {/* Text input */}
        <textarea
          ref={textareaRef}
          placeholder="Message…"
          value={message}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          className="message-input"
          rows={1}
          aria-label="Message input"
        />

        {/* Emoji button */}
        <div className="emoji-wrap" ref={emojiRef}>
          <button
            className="emoji-btn"
            onClick={() => setShowEmoji(v => !v)}
            title="Emoji"
            aria-label="Emoji picker"
            type="button"
          >
            😊
          </button>
          {showEmoji && (
            <div className="emoji-picker-wrap">
              <Suspense fallback={<div style={{width:320,height:380,background:'#1a1a1a'}}/>}>
                <EmojiPicker
                  onEmojiClick={handleEmojiClick}
                  theme="dark"
                  height={380}
                  width={320}
                  searchDisabled={false}
                  skinTonesDisabled
                  previewConfig={{ showPreview: false }}
                />
              </Suspense>
            </div>
          )}
        </div>

        {/* Send button */}
        <button
          onClick={handleSend}
          className="send-button"
          disabled={!message.trim()}
          title="Send"
          aria-label="Send message"
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
          </svg>
        </button>
      </div>
    </div>
  );
}

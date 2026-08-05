import { useRef, useState, useEffect } from 'react';
import socket from '../socket';

/**
 * MessageInput — text input + file attachment + send button.
 * Emits typing events with a 1 s debounce.
 */
export default function MessageInput({ onSend, onFileUpload, uploading, roomId }) {
  const [message, setMessage] = useState('');
  const fileInputRef = useRef(null);
  const typingTimerRef = useRef(null);
  const isTypingRef = useRef(false);

  // Cleanup timer on unmount
  useEffect(() => () => clearTimeout(typingTimerRef.current), []);

  const emitTyping = (typing) => {
    if (isTypingRef.current === typing) return;
    isTypingRef.current = typing;
    socket.emit('typing', { room_id: roomId, isTyping: typing });
  };

  const handleChange = (e) => {
    setMessage(e.target.value);
    emitTyping(true);
    clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => emitTyping(false), 1500);
  };

  const handleSend = () => {
    const text = message.trim();
    if (!text) return;
    onSend(text);
    setMessage('');
    emitTyping(false);
    clearTimeout(typingTimerRef.current);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
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
        {uploading ? (
          <span className="upload-spinner">⏳</span>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
        )}
      </button>

      {/* Text input */}
      <textarea
        placeholder="Message…"
        value={message}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        className="message-input"
        rows={1}
        aria-label="Message input"
      />

      {/* Send button */}
      <button
        onClick={handleSend}
        className="send-button"
        disabled={!message.trim()}
        title="Send message"
        aria-label="Send message"
      >
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
        </svg>
      </button>
    </div>
  );
}

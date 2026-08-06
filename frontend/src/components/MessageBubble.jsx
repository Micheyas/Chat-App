import { useState, useRef, useEffect } from 'react';

/**
 * MessageBubble — renders a single chat message.
 * - Own messages: edit (pencil) + delete (trash) buttons on hover
 * - Admin viewing others' messages: delete button on hover
 * - Edited messages show a small "edited" label
 */
export default function MessageBubble({ msg, isOwn, isAdmin, onDelete, onEdit }) {
  const [editing, setEditing]   = useState(false);
  const [editText, setEditText] = useState(msg.content);
  const inputRef                = useRef(null);

  const formatTime = (ts) =>
    new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Focus input when entering edit mode
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      const len = inputRef.current.value.length;
      inputRef.current.setSelectionRange(len, len);
    }
  }, [editing]);

  const handleEditSubmit = () => {
    const trimmed = editText.trim();
    if (!trimmed || trimmed === msg.content) {
      setEditing(false);
      setEditText(msg.content);
      return;
    }
    onEdit(msg.id, trimmed);
    setEditing(false);
  };

  const handleEditKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleEditSubmit(); }
    if (e.key === 'Escape') { setEditing(false); setEditText(msg.content); }
  };

  const canDelete = isOwn || isAdmin;

  // Admin sees soft-deleted messages in full with a deleted badge
  // Regular users never receive deleted messages from the server at all
  if (msg.deleted) {
    if (!isAdmin) return null;
    // Fall through to normal render — just mark it visually as deleted
  }

  return (
    <div className={`message ${isOwn ? 'own-message' : 'other-message'}`}>
      <div className={`message-bubble${msg.deleted ? ' message-bubble--deleted' : ''}`}>
        {/* Sender name (only for other people's messages) */}
        {!isOwn && <span className="message-sender">{msg.username}</span>}

        {/* Content */}
        {editing ? (
          <div className="edit-input-wrap">
            <textarea
              ref={inputRef}
              className="edit-input"
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={handleEditKeyDown}
              rows={1}
            />
            <div className="edit-actions">
              <button className="edit-confirm-btn" onClick={handleEditSubmit}>Save</button>
              <button className="edit-cancel-btn" onClick={() => { setEditing(false); setEditText(msg.content); }}>Cancel</button>
            </div>
          </div>
        ) : msg.message_type === 'image' ? (
          <img src={msg.content} alt="Shared" className="message-image" />
        ) : msg.message_type === 'document' ? (
          <a href={msg.content} target="_blank" rel="noopener noreferrer" className="message-document">
            📎 {msg.content.split('/').pop()}
          </a>
        ) : (
          <span className="message-text">
            {msg.content}
            {msg.edited && <span className="edited-label"> (edited)</span>}
          </span>
        )}

        {/* Meta row */}
        {!editing && (
          <div className="message-meta">
            <span className="message-time">{formatTime(msg.created_at)}</span>
            {msg.deleted && <span className="deleted-badge">deleted</span>}

            {isOwn && (
              <span className="message-status">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18 7l-1.41-1.41-6.34 6.34 1.41 1.41L18 7zm4.24-1.41L11.66 16.17 7.48 12l-1.41 1.41L11.66 19l12-12-1.42-1.41zM.41 13.41L6 19l1.41-1.41L1.83 12 .41 13.41z" />
                </svg>
              </span>
            )}

            {/* Edit button — own text messages only */}
            {isOwn && msg.message_type === 'text' && (
              <button
                className="edit-msg-btn"
                onClick={() => setEditing(true)}
                title="Edit message"
                aria-label="Edit message"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </button>
            )}

            {/* Delete button — own messages OR admin */}
            {canDelete && (
              <button
                className="delete-msg-btn"
                onClick={() => onDelete(msg.id)}
                title="Delete message"
                aria-label="Delete message"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                  <path d="M10 11v6M14 11v6"/>
                  <path d="M9 6V4h6v2"/>
                </svg>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

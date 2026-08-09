import { useState, useRef, useEffect } from 'react';
import ReactionPicker from './ReactionPicker';

export default function MessageBubble({ msg, isOwn, isAdmin, onDelete, onEdit, onReply, onReact, otherLastReadId, myUserId }) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(msg.content);
  const inputRef = useRef(null);

  const fmt = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      const len = inputRef.current.value.length;
      inputRef.current.setSelectionRange(len, len);
    }
  }, [editing]);

  const handleEditSubmit = () => {
    const trimmed = editText.trim();
    if (!trimmed || trimmed === msg.content) { setEditing(false); setEditText(msg.content); return; }
    onEdit(msg.id, trimmed);
    setEditing(false);
  };

  const handleEditKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleEditSubmit(); }
    if (e.key === 'Escape') { setEditing(false); setEditText(msg.content); }
  };

  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const canDelete = isOwn || isAdmin;

  // Compute tick state outside JSX — no IIFE
  const isDM   = otherLastReadId !== undefined;
  const isRead = isDM && msg.id && msg.id <= otherLastReadId;

  // Admin sees soft-deleted messages with badge; regular users never get them from server
  if (msg.deleted && !isAdmin) return null;

  return (
    <div className={`message ${isOwn ? 'own-message' : 'other-message'}`}>
      <div className={`message-bubble${msg.deleted ? ' message-bubble--deleted' : ''}`}>

        {/* Sender name for others */}
        {!isOwn && <span className="message-sender">{msg.username}</span>}

        {/* Reply preview */}
        {msg.reply_to && (
          <div className="reply-preview">
            <span className="reply-preview-name">{msg.reply_to.reply_username}</span>
            <span className="reply-preview-text">
              {msg.reply_to.message_type === 'image' ? '📷 Photo' :
               msg.reply_to.message_type === 'document' ? '📎 File' :
               msg.reply_to.content?.slice(0, 60)}
            </span>
          </div>
        )}

        {/* Content */}
        {editing ? (
          <div className="edit-input-wrap">
            <textarea
              ref={inputRef}
              className="edit-input"
              value={editText}
              onChange={e => setEditText(e.target.value)}
              onKeyDown={handleEditKey}
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
            {msg.edited && !msg.deleted && <span className="edited-label"> (edited)</span>}
          </span>
        )}

        {/* Meta row */}
        {!editing && (
          <div className="message-meta">
            <span className="message-time">{fmt(msg.created_at)}</span>
            {msg.deleted && <span className="deleted-badge">deleted</span>}
            {isOwn && !msg.deleted && isDM && isRead && (
              <span className="message-status message-status--read" title="Read">
                <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                  <path d="M18 7l-1.41-1.41-6.34 6.34 1.41 1.41L18 7zm4.24-1.41L11.66 16.17 7.48 12l-1.41 1.41L11.66 19l12-12-1.42-1.41zM.41 13.41L6 19l1.41-1.41L1.83 12 .41 13.41z"/>
                </svg>
              </span>
            )}
            {isOwn && !msg.deleted && (!isDM || !isRead) && (
              <span className="message-status message-status--sent" title="Sent">
                <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                </svg>
              </span>
            )}

            {/* Reply button — any non-deleted text/image message */}
            {!msg.deleted && (
              <button className="reply-msg-btn" onClick={() => onReply(msg)} title="Reply" aria-label="Reply">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9 17 4 12 9 7"/>
                  <path d="M20 18v-2a4 4 0 0 0-4-4H4"/>
                </svg>
              </button>
            )}
            {!msg.deleted && onReact && (
              <button className="reaction-toggle-btn" onClick={() => setShowReactionPicker(prev => !prev)} title="React" aria-label="React">
                😊
              </button>
            )}

            {/* Edit — own text messages only */}
            {isOwn && msg.message_type === 'text' && !msg.deleted && (
              <button className="edit-msg-btn" onClick={() => setEditing(true)} title="Edit" aria-label="Edit message">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </button>
            )}

            {/* Delete */}
            {canDelete && !msg.deleted && (
              <button className="delete-msg-btn" onClick={() => onDelete(msg.id)} title="Delete" aria-label="Delete message">
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

        {/* Reactions display */}
        {msg.reactions?.length > 0 && (
          <div className="message-reactions">
            {Object.entries(msg.reactions.reduce((acc, r) => {
              acc[r.reaction] = (acc[r.reaction] || 0) + 1;
              return acc;
            }, {})).map(([emoji, count]) => (
              <span key={emoji} className="reaction-badge">{emoji} {count}</span>
            ))}
          </div>
        )}

        {showReactionPicker && onReact && (
          <ReactionPicker
            messageId={msg.id}
            existingReactions={msg.reactions}
            onReact={onReact}
            onClose={() => setShowReactionPicker(false)}
            currentUserId={myUserId}
          />
        )}
      </div>
    </div>
  );
}

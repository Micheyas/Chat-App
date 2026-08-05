/**
 * MessageBubble — renders a single chat message.
 * Shows a delete button on hover for the sender's own messages.
 */
export default function MessageBubble({ msg, isOwn, onDelete }) {
  const formatTime = (ts) =>
    new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className={`message ${isOwn ? 'own-message' : 'other-message'}`}>
      <div className="message-bubble">
        {/* Sender name (only for other people's messages) */}
        {!isOwn && <span className="message-sender">{msg.username}</span>}

        {/* Content */}
        {msg.message_type === 'image' ? (
          <img src={msg.content} alt="Shared" className="message-image" />
        ) : msg.message_type === 'document' ? (
          <a
            href={msg.content}
            target="_blank"
            rel="noopener noreferrer"
            className="message-document"
          >
            📎 {msg.content.split('/').pop()}
          </a>
        ) : (
          <span className="message-text">{msg.content}</span>
        )}

        {/* Meta row: time + status + delete */}
        <div className="message-meta">
          <span className="message-time">{formatTime(msg.created_at)}</span>
          {isOwn && (
            <>
              {/* Double-tick delivered indicator */}
              <span className="message-status">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18 7l-1.41-1.41-6.34 6.34 1.41 1.41L18 7zm4.24-1.41L11.66 16.17 7.48 12l-1.41 1.41L11.66 19l12-12-1.42-1.41zM.41 13.41L6 19l1.41-1.41L1.83 12 .41 13.41z" />
                </svg>
              </span>
              {/* Delete button */}
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}

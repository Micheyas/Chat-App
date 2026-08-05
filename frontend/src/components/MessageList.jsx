import { useEffect, useRef } from 'react';
import MessageBubble from './MessageBubble';

/**
 * MessageList — scrollable message history with infinite-scroll pagination.
 */
export default function MessageList({ messages, username, loading, hasMore, onLoadMore, onDeleteMessage, typingUsers }) {
  const bottomRef = useRef(null);
  const containerRef = useRef(null);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Trigger load-more when scrolled to top
  const handleScroll = () => {
    if (!containerRef.current || loading || !hasMore) return;
    if (containerRef.current.scrollTop === 0 && messages.length > 0) {
      onLoadMore(messages[0].id);
    }
  };

  // Typing users excluding self
  const others = typingUsers.filter(u => u !== username);

  return (
    <div
      className="messages-container"
      ref={containerRef}
      onScroll={handleScroll}
    >
      {loading && <div className="loading-more">Loading older messages…</div>}

      {messages.map((msg, i) => (
        <MessageBubble
          key={msg.id ?? i}
          msg={msg}
          isOwn={msg.username === username}
          onDelete={onDeleteMessage}
        />
      ))}

      {/* Typing indicator */}
      {others.length > 0 && (
        <div className="typing-indicator">
          <span className="typing-dots">
            <span/><span/><span/>
          </span>
          <span className="typing-text">
            {others.length === 1
              ? `${others[0]} is typing…`
              : `${others.slice(0, 2).join(', ')} are typing…`}
          </span>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}

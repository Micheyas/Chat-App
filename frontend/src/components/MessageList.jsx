import { useEffect, useRef } from 'react';
import MessageBubble from './MessageBubble';

export default function MessageList({ messages, username, isAdmin, loading, hasMore, onLoadMore, onDeleteMessage, onEditMessage, onReplyMessage, typingUsers }) {
  const bottomRef    = useRef(null);
  const containerRef = useRef(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleScroll = () => {
    if (!containerRef.current || loading || !hasMore) return;
    if (containerRef.current.scrollTop === 0 && messages.length > 0) {
      onLoadMore(messages[0].id);
    }
  };

  const others = (typingUsers || []).filter(u => u !== username);

  return (
    <div className="messages-container" ref={containerRef} onScroll={handleScroll}>
      {loading && <div className="loading-more">Loading older messages…</div>}

      {messages.map((msg, i) => (
        <MessageBubble
          key={msg.id ?? i}
          msg={msg}
          isOwn={msg.username === username}
          isAdmin={isAdmin}
          onDelete={onDeleteMessage}
          onEdit={onEditMessage}
          onReply={onReplyMessage}
        />
      ))}

      {others.length > 0 && (
        <div className="typing-indicator">
          <span className="typing-dots"><span/><span/><span/></span>
          <span className="typing-text">
            {others.length === 1 ? `${others[0]} is typing…` : `${others.slice(0,2).join(', ')} are typing…`}
          </span>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}

import { useEffect, useRef } from 'react';

const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '😡', '🎉', '👏', '🔥', '💯'];

const ReactionPicker = ({ onReact, messageId, existingReactions = [], onClose, currentUserId }) => {
  const pickerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const handleReaction = (reaction) => {
    const userReacted = existingReactions.some(
      (r) => r.reaction === reaction && r.user_id === currentUserId
    );
    onReact(messageId, reaction, userReacted ? 'remove' : 'add');
    onClose();
  };

  return (
    <div className="reaction-picker" ref={pickerRef}>
      <div className="reactions-grid">
        {REACTIONS.map((emoji) => {
          const count = existingReactions.filter((r) => r.reaction === emoji).length;
          const userReacted = existingReactions.some(
            (r) => r.reaction === emoji && r.user_id === currentUserId
          );
          return (
            <button
              key={emoji}
              type="button"
              className={`reaction-btn ${userReacted ? 'active' : ''}`}
              onClick={() => handleReaction(emoji)}
              title={`${count} reaction${count === 1 ? '' : 's'}`}
            >
              {emoji}
              {count > 0 && <span className="reaction-count">{count}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default ReactionPicker;

import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { BACKEND_URL } from '../socket';

/**
 * AdminPanel — shows pending users and lets admin approve or reject them.
 */
export default function AdminPanel({ token, onClose }) {
  const [pendingUsers, setPendingUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState({});
  const [message, setMessage] = useState('');

  const fetchPending = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${BACKEND_URL}/api/admin/pending-users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setPendingUsers(data);
    } catch (err) {
      console.error('Failed to fetch pending users:', err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchPending();
  }, [fetchPending]);

  const handleApprove = async (userId, username) => {
    setActionLoading(prev => ({ ...prev, [userId]: 'approving' }));
    try {
      await axios.post(
        `${BACKEND_URL}/api/admin/approve/${userId}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setPendingUsers(prev => prev.filter(u => u.id !== userId));
      setMessage(`✅ ${username} approved`);
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setMessage(`❌ Failed to approve ${username}`);
      setTimeout(() => setMessage(''), 3000);
    } finally {
      setActionLoading(prev => ({ ...prev, [userId]: null }));
    }
  };

  const handleReject = async (userId, username) => {
    if (!confirm(`Reject and delete account "${username}"?`)) return;
    setActionLoading(prev => ({ ...prev, [userId]: 'rejecting' }));
    try {
      await axios.delete(
        `${BACKEND_URL}/api/admin/reject/${userId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setPendingUsers(prev => prev.filter(u => u.id !== userId));
      setMessage(`🗑️ ${username} rejected`);
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setMessage(`❌ Failed to reject ${username}`);
      setTimeout(() => setMessage(''), 3000);
    } finally {
      setActionLoading(prev => ({ ...prev, [userId]: null }));
    }
  };

  const formatDate = (ts) =>
    new Date(ts).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="admin-overlay">
      <div className="admin-panel">
        {/* Header */}
        <div className="admin-header">
          <div className="admin-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            <h2>Pending Approvals</h2>
          </div>
          <button className="admin-close" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Feedback message */}
        {message && <p className="admin-message">{message}</p>}

        {/* Refresh button */}
        <button className="admin-refresh" onClick={fetchPending} disabled={loading}>
          {loading ? 'Loading…' : `Refresh (${pendingUsers.length} pending)`}
        </button>

        {/* Users list */}
        <div className="admin-list">
          {loading ? (
            <p className="admin-empty">Loading…</p>
          ) : pendingUsers.length === 0 ? (
            <div className="admin-empty">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="40" height="40">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
              <p>No pending users</p>
            </div>
          ) : (
            pendingUsers.map((user) => (
              <div key={user.id} className="admin-user-item">
                <div className="admin-user-avatar">
                  {user.username.charAt(0).toUpperCase()}
                </div>
                <div className="admin-user-info">
                  <span className="admin-user-name">{user.username}</span>
                  <span className="admin-user-date">Registered {formatDate(user.created_at)}</span>
                </div>
                <div className="admin-user-actions">
                  <button
                    className="admin-approve-btn"
                    onClick={() => handleApprove(user.id, user.username)}
                    disabled={!!actionLoading[user.id]}
                  >
                    {actionLoading[user.id] === 'approving' ? '…' : '✓ Approve'}
                  </button>
                  <button
                    className="admin-reject-btn"
                    onClick={() => handleReject(user.id, user.username)}
                    disabled={!!actionLoading[user.id]}
                  >
                    {actionLoading[user.id] === 'rejecting' ? '…' : '✕ Reject'}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

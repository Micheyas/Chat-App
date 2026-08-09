import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { BACKEND_URL } from '../../socket';

const api = (token) => ({
  headers: { Authorization: `Bearer ${token}` },
});

const fmt = (ts) =>
  new Date(ts).toLocaleDateString([], {
    day: '2-digit', month: 'short', year: 'numeric',
  });

// ─── Edit modal ───────────────────────────────────────────────────────────────
function EditModal({ user, token, onClose, onSaved }) {
  const [username, setUsername] = useState(user.username);
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [saving, setSaving]     = useState(false);

  const handleSave = async (e) => {
    e.preventDefault();
    setError('');
    if (!username.trim() && !password.trim()) {
      setError('Fill in at least one field.');
      return;
    }
    setSaving(true);
    try {
      const body = {};
      if (username.trim() !== user.username) body.username = username.trim();
      if (password.trim()) body.password = password;

      if (Object.keys(body).length === 0) { onClose(); return; }

      const { data } = await axios.patch(
        `${BACKEND_URL}/api/admin/users/${user.id}`,
        body,
        api(token)
      );
      onSaved(data.user);
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Edit — {user.username}</h3>
          <button className="admin-close" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <form onSubmit={handleSave} className="modal-form">
          <div className="lamp-input-group">
            <label className="lamp-label">NEW USERNAME</label>
            <input
              className="lamp-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Leave as-is to keep current"
              disabled={saving}
            />
          </div>
          <div className="lamp-input-group">
            <label className="lamp-label">NEW PASSWORD</label>
            <input
              type="password"
              className="lamp-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Leave blank to keep current"
              disabled={saving}
            />
          </div>
          {error && <p className="lamp-error">{error}</p>}
          <button type="submit" className="admin-save-btn" disabled={saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────
export default function AdminPanel({ token, onClose }) {
  const [tab, setTab]             = useState('pending'); // 'pending' | 'all' | 'create'
  const [pendingUsers, setPending] = useState([]);
  const [allUsers, setAll]         = useState([]);
  const [loading, setLoading]      = useState(false);
  const [editUser, setEditUser]    = useState(null);
  const [flash, setFlash]          = useState('');

  // create form
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newIsAdmin,  setNewIsAdmin]  = useState(false);
  const [createError, setCreateError] = useState('');
  const [creating, setCreating]       = useState(false);

  const showFlash = (msg) => { setFlash(msg); setTimeout(() => setFlash(''), 3000); };

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchPending = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${BACKEND_URL}/api/admin/pending-users`, api(token));
      setPending(data);
    } catch { /* silent */ } finally { setLoading(false); }
  }, [token]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${BACKEND_URL}/api/admin/users`, api(token));
      setAll(data);
    } catch { /* silent */ } finally { setLoading(false); }
  }, [token]);

  useEffect(() => {
    if (tab === 'pending') fetchPending();
    if (tab === 'all')     fetchAll();
  }, [tab, fetchPending, fetchAll]);

  // ── Approve ────────────────────────────────────────────────────────────────
  const handleApprove = async (user) => {
    try {
      await axios.post(`${BACKEND_URL}/api/admin/approve/${user.id}`, {}, api(token));
      setPending(prev => prev.filter(u => u.id !== user.id));
      showFlash(`✅ ${user.username} approved`);
    } catch { showFlash('❌ Approve failed'); }
  };

  // ── Reject ─────────────────────────────────────────────────────────────────
  const handleReject = async (user) => {
    if (!confirm(`Reject and delete "${user.username}"?`)) return;
    try {
      await axios.delete(`${BACKEND_URL}/api/admin/reject/${user.id}`, api(token));
      setPending(prev => prev.filter(u => u.id !== user.id));
      showFlash(`🗑️ ${user.username} rejected`);
    } catch { showFlash('❌ Reject failed'); }
  };

  // ── Delete ─────────────────────────────────────────────────────────────────
  const handleDelete = async (user) => {
    if (!confirm(`Permanently delete "${user.username}"? This cannot be undone.`)) return;
    try {
      await axios.delete(`${BACKEND_URL}/api/admin/users/${user.id}`, api(token));
      setAll(prev => prev.filter(u => u.id !== user.id));
      showFlash(`🗑️ ${user.username} deleted`);
    } catch (err) {
      showFlash(err.response?.data?.error || '❌ Delete failed');
    }
  };

  // ── After edit saved ───────────────────────────────────────────────────────
  const handleSaved = (updated) => {
    setAll(prev => prev.map(u => u.id === updated.id ? { ...u, ...updated } : u));
    showFlash(`✅ ${updated.username} updated`);
  };

  // ── Create ─────────────────────────────────────────────────────────────────
  const handleCreate = async (e) => {
    e.preventDefault();
    setCreateError('');
    if (!newUsername.trim() || !newPassword.trim()) {
      setCreateError('Username and password are required.');
      return;
    }
    setCreating(true);
    try {
      const { data } = await axios.post(
        `${BACKEND_URL}/api/admin/users`,
        { username: newUsername.trim(), password: newPassword, isAdmin: newIsAdmin },
        api(token)
      );
      showFlash(`✅ Account "${data.username}" created`);
      setNewUsername(''); setNewPassword(''); setNewIsAdmin(false);
      setTab('all');
    } catch (err) {
      setCreateError(err.response?.data?.error || 'Creation failed');
    } finally {
      setCreating(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="admin-overlay">
        <div className="admin-panel">

          {/* Header */}
          <div className="admin-header">
            <div className="admin-title">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.52V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
              <h2>Admin Panel</h2>
            </div>
            <button className="admin-close" onClick={onClose}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          {/* Flash message */}
          {flash && <p className="admin-message">{flash}</p>}

          {/* Tabs */}
          <div className="admin-tabs">
            <button className={`admin-tab-btn ${tab === 'pending' ? 'admin-tab-btn--active' : ''}`} onClick={() => setTab('pending')}>
              Pending {pendingUsers.length > 0 && <span className="admin-badge">{pendingUsers.length}</span>}
            </button>
            <button className={`admin-tab-btn ${tab === 'all' ? 'admin-tab-btn--active' : ''}`} onClick={() => setTab('all')}>
              All Users
            </button>
            <button className={`admin-tab-btn ${tab === 'create' ? 'admin-tab-btn--active' : ''}`} onClick={() => setTab('create')}>
              + Create
            </button>
          </div>

          {/* ── PENDING TAB ──────────────────────────────────────── */}
          {tab === 'pending' && (
            <div className="admin-list">
              {loading ? (
                <p className="admin-empty">Loading…</p>
              ) : pendingUsers.length === 0 ? (
                <div className="admin-empty">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="36" height="36"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                  <p>No pending approvals</p>
                </div>
              ) : pendingUsers.map(user => (
                <div key={user.id} className="admin-user-item">
                  <div className="admin-user-avatar">{user.username.charAt(0).toUpperCase()}</div>
                  <div className="admin-user-info">
                    <span className="admin-user-name">{user.username}</span>
                    <span className="admin-user-date">Registered {fmt(user.created_at)}</span>
                  </div>
                  <div className="admin-user-actions">
                    <button className="admin-approve-btn" onClick={() => handleApprove(user)}>✓ Approve</button>
                    <button className="admin-reject-btn"  onClick={() => handleReject(user)}>✕ Reject</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── ALL USERS TAB ────────────────────────────────────── */}
          {tab === 'all' && (
            <div className="admin-list">
              {loading ? (
                <p className="admin-empty">Loading…</p>
              ) : allUsers.length === 0 ? (
                <p className="admin-empty">No users found</p>
              ) : allUsers.map(user => (
                <div key={user.id} className="admin-user-item">
                  <div className={`admin-user-avatar ${user.is_admin ? 'admin-user-avatar--admin' : ''}`}>
                    {user.username.charAt(0).toUpperCase()}
                  </div>
                  <div className="admin-user-info">
                    <span className="admin-user-name">
                      {user.username}
                      {user.is_admin && <span className="admin-badge-role">ADMIN</span>}
                      {!user.approved && <span className="admin-badge-pending">PENDING</span>}
                    </span>
                    <span className="admin-user-date">Joined {fmt(user.created_at)}</span>
                  </div>
                  <div className="admin-user-actions">
                    <button className="admin-edit-btn" onClick={() => setEditUser(user)} title="Edit">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      Edit
                    </button>
                    <button className="admin-reject-btn" onClick={() => handleDelete(user)} title="Delete">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── CREATE TAB ───────────────────────────────────────── */}
          {tab === 'create' && (
            <div className="admin-create">
              <form onSubmit={handleCreate} className="modal-form">
                <div className="lamp-input-group">
                  <label className="lamp-label">USERNAME</label>
                  <input
                    className="lamp-input"
                    placeholder="Enter username"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    disabled={creating}
                  />
                </div>
                <div className="lamp-input-group">
                  <label className="lamp-label">PASSWORD</label>
                  <input
                    type="password"
                    className="lamp-input"
                    placeholder="Min 6 characters"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    disabled={creating}
                  />
                </div>
                <label className="admin-checkbox-label">
                  <input
                    type="checkbox"
                    checked={newIsAdmin}
                    onChange={(e) => setNewIsAdmin(e.target.checked)}
                    disabled={creating}
                  />
                  <span>Grant admin privileges</span>
                </label>
                {createError && <p className="lamp-error">{createError}</p>}
                <button type="submit" className="admin-save-btn" disabled={creating}>
                  {creating ? 'Creating…' : 'Create Account'}
                </button>
              </form>
            </div>
          )}

        </div>
      </div>

      {/* Edit modal */}
      {editUser && (
        <EditModal
          user={editUser}
          token={token}
          onClose={() => setEditUser(null)}
          onSaved={handleSaved}
        />
      )}
    </>
  );
}

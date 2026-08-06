import { useState } from 'react';
import axios from 'axios';
import { BACKEND_URL } from '../socket';

/**
 * SettingsPanel — lets users update their own username and/or password.
 * On success, calls onSaved({ token, username, userId, isAdmin }) with
 * the new session data so App can refresh auth state.
 */
export default function SettingsPanel({ auth, onClose, onSaved }) {
  const [username, setUsername] = useState(auth.username);
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [error,    setError]    = useState('');
  const [success,  setSuccess]  = useState('');
  const [saving,   setSaving]   = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const body = {};
    if (username.trim() !== auth.username) body.username = username.trim();
    if (password.trim()) {
      if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
      if (password !== confirm) { setError('Passwords do not match.'); return; }
      body.password = password;
    }

    if (Object.keys(body).length === 0) {
      setError('No changes to save.');
      return;
    }

    setSaving(true);
    try {
      const { data } = await axios.patch(`${BACKEND_URL}/api/me`, body, {
        headers: { Authorization: `Bearer ${auth.token}` },
      });
      setSuccess('Saved! Your session has been updated.');
      setPassword('');
      setConfirm('');
      onSaved(data); // update auth state in App
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-overlay">
      <div className="admin-panel" style={{ maxWidth: 420 }}>
        {/* Header */}
        <div className="admin-header">
          <div className="admin-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
              <circle cx="12" cy="8" r="4"/>
              <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
            </svg>
            <h2>Account Settings</h2>
          </div>
          <button className="admin-close" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form" style={{ padding: '20px' }}>
          {/* Username */}
          <div className="lamp-input-group">
            <label className="lamp-label">USERNAME</label>
            <input
              className="lamp-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="New username"
              disabled={saving}
              minLength={2}
              maxLength={50}
            />
          </div>

          {/* New password */}
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

          {/* Confirm password */}
          {password && (
            <div className="lamp-input-group">
              <label className="lamp-label">CONFIRM PASSWORD</label>
              <input
                type="password"
                className="lamp-input"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Repeat new password"
                disabled={saving}
              />
            </div>
          )}

          {error   && <p className="lamp-error">{error}</p>}
          {success && <p className="settings-success">{success}</p>}

          <button type="submit" className="admin-save-btn" disabled={saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </form>
      </div>
    </div>
  );
}

import { useState } from 'react';
import axios from 'axios';
import { BACKEND_URL } from '../socket';

/**
 * JoinScreen — handles register / login.
 * Calls onAuth({ token, username, userId }) when successful.
 */
export default function JoinScreen({ onAuth }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!username.trim() || !password.trim()) {
      setError('Please fill in all fields.');
      return;
    }

    setLoading(true);
    try {
      const endpoint = mode === 'register' ? '/api/register' : '/api/login';
      const { data } = await axios.post(`${BACKEND_URL}${endpoint}`, {
        username: username.trim(),
        password,
      });
      onAuth(data); // { token, username, userId }
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="join-container">
      <div className="join-box">
        {/* Logo */}
        <div className="telegram-logo">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M21.928 2.628a1.143 1.143 0 0 0-1.516-1.508L2.428 9.378a1.143 1.143 0 0 0 .04 2.12l4.778 1.556 1.78 5.718a.571.571 0 0 0 .983.258l2.5-2.5 4.875 3.714a1.143 1.143 0 0 0 1.784-.666l2.57-15.65z"
              fill="#0088cc"
            />
          </svg>
        </div>

        <h1>Telegram Clone</h1>

        {/* Mode toggle */}
        <div className="auth-tabs">
          <button
            className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
            onClick={() => { setMode('login'); setError(''); }}
            type="button"
          >
            Sign In
          </button>
          <button
            className={`auth-tab ${mode === 'register' ? 'active' : ''}`}
            onClick={() => { setMode('register'); setError(''); }}
            type="button"
          >
            Register
          </button>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="username-input"
            autoComplete="username"
            disabled={loading}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="username-input"
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            disabled={loading}
          />

          {error && <p className="auth-error">{error}</p>}

          <button type="submit" className="join-button" disabled={loading}>
            {loading ? 'Please wait…' : mode === 'register' ? 'Create Account' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}

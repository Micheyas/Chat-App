import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { BACKEND_URL } from '../../socket';

/**
 * JoinScreen — lamp toggle login effect with GSAP animation.
 * Pull the cord to turn the lamp on and reveal the login card.
 */
export default function JoinScreen({ onAuth }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register' | 'pending'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [lampOn, setLampOn] = useState(false);

  const cardRef = useRef(null);
  const timelineRef = useRef(null);

  // Build GSAP timeline once on mount
  useEffect(() => {
    if (typeof window.gsap === 'undefined' || !cardRef.current) return;
    timelineRef.current = window.gsap
      .timeline({ paused: true })
      .to(cardRef.current, { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out' });
  }, []);

  // Play / reverse when lamp toggles
  useEffect(() => {
    if (!timelineRef.current) return;
    if (lampOn) {
      timelineRef.current.play();
    } else {
      timelineRef.current.reverse();
    }
  }, [lampOn]);

  const toggleLamp = () => setLampOn(v => !v);

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
      if (mode === 'register' && !data.token) {
        setMode('pending');
        setLoading(false);
        return;
      }
      onAuth(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  };

  // Pending approval screen
  if (mode === 'pending') {
    return (
      <div className="lamp-page">
        <div className="join-box">
          <div className="lamp-logo">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M21.928 2.628a1.143 1.143 0 0 0-1.516-1.508L2.428 9.378a1.143 1.143 0 0 0 .04 2.12l4.778 1.556 1.78 5.718a.571.571 0 0 0 .983.258l2.5-2.5 4.875 3.714a1.143 1.143 0 0 0 1.784-.666l2.57-15.65z" fill="#0088cc" />
            </svg>
          </div>
          <h1 style={{ color: '#fff', marginBottom: '16px' }}>Registration Pending</h1>
          <p style={{ color: '#aaa', marginBottom: '24px', lineHeight: '1.6', textAlign: 'center' }}>
            Your account <strong style={{ color: '#fff' }}>{username}</strong> has been created and is waiting for admin approval.
            You can log in once an admin approves your account.
          </p>
          <button
            onClick={() => { setMode('login'); setUsername(''); setPassword(''); setError(''); }}
            className="lamp-btn"
          >
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="lamp-page" data-lamp={lampOn ? 'on' : 'off'}>

      {/* ── Lamp ─────────────────────────────────────────────────── */}
      <div className="lamp-wrap">
        <div className="lamp-shade" />
        <div className="lamp-base" />
        <div className="lamp-beam" />

        {/* Pull cord */}
        <div className="lamp-cord" onClick={toggleLamp} title="Toggle lamp">
          <div className="lamp-string" />
          <div className="lamp-handle" />
        </div>
      </div>

      {/* ── Login card ───────────────────────────────────────────── */}
      <div className="lamp-card" ref={cardRef}>
        <h2 className="lamp-card-title">Wegram</h2>

        {/* Mode tabs */}
        <div className="lamp-tabs">
          <button
            className={`lamp-tab ${mode === 'login' ? 'lamp-tab--active' : ''}`}
            onClick={() => { setMode('login'); setError(''); }}
            type="button"
          >
            Sign In
          </button>
          <button
            className={`lamp-tab ${mode === 'register' ? 'lamp-tab--active' : ''}`}
            onClick={() => { setMode('register'); setError(''); }}
            type="button"
          >
            Register
          </button>
        </div>

        <form onSubmit={handleSubmit} className="lamp-form">
          <div className="lamp-input-group">
            <label className="lamp-label">USERNAME</label>
            <input
              type="text"
              placeholder="Your username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="lamp-input"
              autoComplete="username"
              disabled={loading}
            />
          </div>
          <div className="lamp-input-group">
            <label className="lamp-label">PASSWORD</label>
            <input
              type="password"
              placeholder="Enter password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="lamp-input"
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              disabled={loading}
            />
          </div>

          {error && <p className="lamp-error">{error}</p>}

          <button type="submit" className="lamp-btn" disabled={loading}>
            {loading ? 'Please wait…' : mode === 'register' ? 'Create Account' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}

import { useEffect, useRef } from 'react';

/**
 * CallUI — renders the call overlay.
 * Shows:
 *   - Ringing screen  (incoming call)
 *   - Calling screen  (outgoing, waiting)
 *   - Connected screen (live video/audio call)
 */
export default function CallUI({
  callState, callMode, remoteInfo,
  localStream, remoteStream,
  isMuted, isCamOff, callError,
  onAccept, onReject, onEnd,
  onToggleMute, onToggleCamera, onSwitchToAudio,
}) {
  const localVideoRef  = useRef(null);
  const remoteVideoRef = useRef(null);

  // Attach streams to video elements
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  if (callState === 'idle') return null;

  // ── Ringing (incoming call) ───────────────────────────────────────────────
  if (callState === 'ringing') {
    return (
      <div className="call-overlay">
        <div className="call-modal call-modal--ringing">
          <div className="call-avatar-ring">
            <div className="call-avatar">{remoteInfo?.callerName?.charAt(0).toUpperCase()}</div>
            <div className="call-ring-pulse" />
          </div>
          <p className="call-name">{remoteInfo?.callerName}</p>
          <p className="call-subtitle">
            Incoming {remoteInfo?.mode === 'audio' ? 'voice' : 'video'} call…
          </p>
          {callError && <p className="call-error">{callError}</p>}
          <div className="call-actions">
            <button className="call-btn call-btn--reject" onClick={onReject} aria-label="Decline">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z" transform="rotate(135 12 12)"/>
              </svg>
            </button>
            <button className="call-btn call-btn--accept" onClick={onAccept} aria-label="Accept">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Calling (outgoing, waiting for answer) ────────────────────────────────
  if (callState === 'calling') {
    return (
      <div className="call-overlay">
        <div className="call-modal call-modal--calling">
          <div className="call-avatar-ring">
            <div className="call-avatar">{remoteInfo?.callerName?.charAt(0).toUpperCase()}</div>
            <div className="call-ring-pulse" />
            <div className="call-ring-pulse call-ring-pulse--delay" />
          </div>
          <p className="call-name">{remoteInfo?.callerName}</p>
          <p className="call-subtitle">Calling…</p>
          {callError && <p className="call-error">{callError}</p>}
          <div className="call-actions">
            <button className="call-btn call-btn--end" onClick={onEnd} aria-label="Cancel call">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z" transform="rotate(135 12 12)"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Connected ─────────────────────────────────────────────────────────────
  if (callState === 'connected') {
    const isVideo = callMode === 'video';
    return (
      <div className="call-overlay call-overlay--connected">
        {/* Remote video (full screen) */}
        {isVideo ? (
          <video
            ref={remoteVideoRef}
            className="call-remote-video"
            autoPlay
            playsInline
          />
        ) : (
          <div className="call-audio-bg">
            <div className="call-avatar call-avatar--large">
              {remoteInfo?.callerName?.charAt(0).toUpperCase()}
            </div>
            <p className="call-audio-name">{remoteInfo?.callerName}</p>
            <p className="call-audio-status">Connected</p>
          </div>
        )}

        {/* Local video (picture-in-picture) */}
        {isVideo && (
          <video
            ref={localVideoRef}
            className={`call-local-video ${isCamOff ? 'call-local-video--hidden' : ''}`}
            autoPlay
            playsInline
            muted
          />
        )}

        {/* Caller name overlay */}
        <div className="call-top-bar">
          <span className="call-top-name">{remoteInfo?.callerName}</span>
          <span className="call-top-status">● Connected</span>
        </div>

        {/* Controls bar */}
        <div className="call-controls">
          {/* Mute */}
          <button
            className={`call-ctrl-btn ${isMuted ? 'call-ctrl-btn--active' : ''}`}
            onClick={onToggleMute}
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="1" y1="1" x2="23" y2="23"/>
                <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/>
                <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/>
                <line x1="12" y1="19" x2="12" y2="23"/>
                <line x1="8" y1="23" x2="16" y2="23"/>
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                <line x1="12" y1="19" x2="12" y2="23"/>
                <line x1="8" y1="23" x2="16" y2="23"/>
              </svg>
            )}
          </button>

          {/* End call */}
          <button className="call-btn call-btn--end call-btn--large" onClick={onEnd} title="End call">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z" transform="rotate(135 12 12)"/>
            </svg>
          </button>

          {/* Camera toggle (video only) */}
          {isVideo && (
            <button
              className={`call-ctrl-btn ${isCamOff ? 'call-ctrl-btn--active' : ''}`}
              onClick={onToggleCamera}
              title={isCamOff ? 'Turn camera on' : 'Turn camera off'}
            >
              {isCamOff ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="1" y1="1" x2="23" y2="23"/>
                  <path d="M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2 3h2a2 2 0 0 1 2 2v9.34"/>
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M23 7l-7 5 7 5V7z"/>
                  <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
                </svg>
              )}
            </button>
          )}
        </div>
      </div>
    );
  }

  return null;
}

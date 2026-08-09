import React, { useRef, useEffect } from 'react';

const VideoCall = ({ localStream, remoteStream, isInCall, onEndCall }) => {
  const localRef = useRef(null);
  const remoteRef = useRef(null);

  useEffect(() => {
    if (localRef.current && localStream) {
      localRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteRef.current && remoteStream) {
      remoteRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  if (!isInCall) return null;

  return (
    <div className="video-call-container">
      <div className="remote-video-wrapper">
        <video ref={remoteRef} autoPlay playsInline className="remote-video" />
        {!remoteStream && (
          <div className="waiting-message">
            <div className="loader" />
            <p>Waiting for the other participant…</p>
          </div>
        )}
      </div>

      <div className="local-video-wrapper">
        <video ref={localRef} autoPlay playsInline muted className="local-video" />
      </div>

      <div className="call-controls">
        <button type="button" className="control-btn end-call-btn" onClick={onEndCall}>
          📞 End Call
        </button>
      </div>
    </div>
  );
};

export default VideoCall;

import { useState, useEffect, useRef, useCallback } from 'react';
import socket from '../socket';

// Public STUN servers — free, no config needed
const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

/**
 * call states:
 *   idle        — no call
 *   calling     — we initiated, waiting for other side to answer
 *   ringing     — someone is calling us
 *   connected   — call is live
 *   ended       — call just finished (brief before idle)
 */
export function useWebRTC(auth) {
  const [callState,    setCallState]    = useState('idle');
  const [callMode,     setCallMode]     = useState('video'); // 'video' | 'audio'
  const [remoteInfo,   setRemoteInfo]   = useState(null);   // { callerId, callerName }
  const [localStream,  setLocalStream]  = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isMuted,      setIsMuted]      = useState(false);
  const [isCamOff,     setIsCamOff]     = useState(false);
  const [callError,    setCallError]    = useState('');

  const pcRef          = useRef(null);   // RTCPeerConnection
  const localStreamRef = useRef(null);   // kept in sync with state for closures

  // ── helpers ────────────────────────────────────────────────────────────────

  const cleanup = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.onicecandidate    = null;
      pcRef.current.ontrack           = null;
      pcRef.current.onconnectionstatechange = null;
      pcRef.current.close();
      pcRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    setLocalStream(null);
    setRemoteStream(null);
    setRemoteInfo(null);
    setIsMuted(false);
    setIsCamOff(false);
    setCallError('');
  }, []);

  const endCall = useCallback((targetId) => {
    if (targetId) {
      socket.emit('end-call', { targetId });
    }
    cleanup();
    setCallState('idle');
  }, [cleanup]);

  const createPC = useCallback((targetId) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit('send-ice-candidate', { targetId, candidate: e.candidate });
      }
    };

    pc.ontrack = (e) => {
      setRemoteStream(e.streams[0]);
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        endCall(null);
      }
    };

    pcRef.current = pc;
    return pc;
  }, [endCall]);

  const getLocalStream = useCallback(async (mode) => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: mode === 'video',
    });
    localStreamRef.current = stream;
    setLocalStream(stream);
    return stream;
  }, []);

  // ── Initiate a call ─────────────────────────────────────────────────────────

  const startCall = useCallback(async (calleeId, calleeUsername, mode = 'video') => {
    try {
      setCallError('');
      setCallMode(mode);
      setCallState('calling');
      setRemoteInfo({ callerId: calleeId, callerName: calleeUsername });

      const stream = await getLocalStream(mode);
      const pc = createPC(calleeId);

      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      socket.emit('call-user', {
        calleeId,
        calleeUsername,
        callerName: auth.username,
        offer,
        mode,
      });
    } catch (err) {
      console.error('startCall error:', err);
      setCallError(err.name === 'NotAllowedError'
        ? 'Camera/microphone permission denied.'
        : 'Failed to start call.');
      cleanup();
      setCallState('idle');
    }
  }, [auth.username, getLocalStream, createPC, cleanup]);

  // ── Accept incoming call ────────────────────────────────────────────────────

  const acceptCall = useCallback(async () => {
    if (!remoteInfo) return;
    try {
      setCallError('');
      const stream = await getLocalStream(callMode);
      const pc = createPC(remoteInfo.callerId);

      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      await pc.setRemoteDescription(new RTCSessionDescription(remoteInfo.offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socket.emit('accept-call', { callerId: remoteInfo.callerId, answer });
      setCallState('connected');
    } catch (err) {
      console.error('acceptCall error:', err);
      setCallError(err.name === 'NotAllowedError'
        ? 'Camera/microphone permission denied.'
        : 'Failed to accept call.');
      rejectCall();
    }
  }, [remoteInfo, callMode, getLocalStream, createPC]);

  // ── Reject incoming call ────────────────────────────────────────────────────

  const rejectCall = useCallback(() => {
    if (remoteInfo?.callerId) {
      socket.emit('reject-call', { callerId: remoteInfo.callerId });
    }
    cleanup();
    setCallState('idle');
  }, [remoteInfo, cleanup]);

  // ── Media controls ──────────────────────────────────────────────────────────

  const toggleMute = useCallback(() => {
    if (!localStreamRef.current) return;
    localStreamRef.current.getAudioTracks().forEach(t => {
      t.enabled = !t.enabled;
    });
    setIsMuted(v => !v);
  }, []);

  const toggleCamera = useCallback(() => {
    if (!localStreamRef.current) return;
    localStreamRef.current.getVideoTracks().forEach(t => {
      t.enabled = !t.enabled;
    });
    setIsCamOff(v => !v);
  }, []);

  // ── Socket event listeners ──────────────────────────────────────────────────

  useEffect(() => {
    // Someone is calling us
    const onIncoming = (data) => {
      // { callerId, callerName, offer, mode, callerSocketId }
      setRemoteInfo(data);
      setCallMode(data.mode || 'video');
      setCallState('ringing');
    };

    // Our outgoing call was accepted
    const onAccepted = async ({ answer, calleeSocketId }) => {
      try {
        if (!pcRef.current) return;
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(answer));
        setCallState('connected');
        // store callee socket id for ice candidates
        if (remoteInfo) setRemoteInfo(prev => ({ ...prev, calleeSocketId }));
      } catch (err) {
        console.error('onAccepted error:', err);
      }
    };

    // Our outgoing call was rejected
    const onRejected = () => {
      cleanup();
      setCallState('idle');
      setCallError('Call was declined.');
      setTimeout(() => setCallError(''), 3000);
    };

    // Other party ended the call / went busy
    const onEnded = () => {
      cleanup();
      setCallState('idle');
    };

    const onBusy = ({ message }) => {
      cleanup();
      setCallState('idle');
      setCallError(message || 'User is busy.');
      setTimeout(() => setCallError(''), 3000);
    };

    // ICE candidates from the other peer
    const onIce = async ({ candidate }) => {
      try {
        if (pcRef.current && candidate) {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        }
      } catch (err) { /* may arrive before remote desc — safe to ignore */ }
    };

    socket.on('incoming-call',        onIncoming);
    socket.on('call-accepted',        onAccepted);
    socket.on('call-rejected',        onRejected);
    socket.on('call-ended',           onEnded);
    socket.on('call-busy',            onBusy);
    socket.on('receive-ice-candidate', onIce);

    return () => {
      socket.off('incoming-call',        onIncoming);
      socket.off('call-accepted',        onAccepted);
      socket.off('call-rejected',        onRejected);
      socket.off('call-ended',           onEnded);
      socket.off('call-busy',            onBusy);
      socket.off('receive-ice-candidate', onIce);
    };
  }, [cleanup, remoteInfo]);

  // Cleanup on unmount
  useEffect(() => () => cleanup(), [cleanup]);

  return {
    callState, callMode, remoteInfo,
    localStream, remoteStream,
    isMuted, isCamOff, callError,
    startCall, acceptCall, rejectCall,
    endCall, toggleMute, toggleCamera,
  };
}

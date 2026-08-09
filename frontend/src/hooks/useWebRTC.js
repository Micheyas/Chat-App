import { useState, useRef, useEffect } from 'react';

const configuration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' }
  ]
};

export const useWebRTC = (socket, currentUser) => {
  const [incomingCall, setIncomingCall] = useState(null);
  const [isInCall, setIsInCall] = useState(false);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);

  const peerConnection = useRef(null);
  const targetUserId = useRef(null);

  useEffect(() => {
    if (!socket) return;

    const onIncomingCall = (data) => {
      if (peerConnection.current || isInCall) {
        socket.emit('reject-call', { callerId: data.callerId });
        return;
      }
      setIncomingCall(data);
      playRingtone();
    };

    const onCallAccepted = async (data) => {
      await handleCallAccepted(data);
    };

    const onCallRejected = () => {
      cleanupCall();
      alert('Call was rejected');
    };

    const onCallEnded = () => {
      cleanupCall();
      alert('Call ended');
    };

    const onIceCandidate = async (data) => {
      await handleIceCandidate(data);
    };

    const onCallBusy = (data) => {
      alert(data.message || 'The person is busy');
    };

    socket.on('incoming-call', onIncomingCall);
    socket.on('call-accepted', onCallAccepted);
    socket.on('call-rejected', onCallRejected);
    socket.on('call-ended', onCallEnded);
    socket.on('receive-ice-candidate', onIceCandidate);
    socket.on('call-busy', onCallBusy);

    return () => {
      socket.off('incoming-call', onIncomingCall);
      socket.off('call-accepted', onCallAccepted);
      socket.off('call-rejected', onCallRejected);
      socket.off('call-ended', onCallEnded);
      socket.off('receive-ice-candidate', onIceCandidate);
      socket.off('call-busy', onCallBusy);
      cleanupCall();
    };
  }, [socket, isInCall]);

  const createPeerConnection = () => {
    const pc = new RTCPeerConnection(configuration);

    pc.onicecandidate = (event) => {
      if (event.candidate && targetUserId.current) {
        socket.emit('send-ice-candidate', {
          targetId: targetUserId.current,
          candidate: event.candidate,
        });
      }
    };

    pc.ontrack = (event) => {
      setRemoteStream(event.streams[0]);
    };

    peerConnection.current = pc;
    return pc;
  };

  const startCall = async (userId, userName, mode = 'video') => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: mode === 'video', audio: true });
      setLocalStream(stream);
      const pc = createPeerConnection();
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      targetUserId.current = userId;
      socket.emit('call-user', {
        calleeId: userId,
        callerName: currentUser?.username || userName || 'Unknown',
        offer,
        mode,
      });
      setIsInCall(true);
    } catch (error) {
      console.error('Error starting call:', error);
      if (error.name === 'NotAllowedError') {
        alert('Please allow camera and microphone access');
      }
      cleanupCall();
    }
  };

  const acceptCall = async () => {
    try {
      if (!incomingCall) return;
      const { callerId, offer, mode = 'video' } = incomingCall;
      const stream = await navigator.mediaDevices.getUserMedia({ video: mode === 'video', audio: true });
      setLocalStream(stream);
      const pc = createPeerConnection();
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      targetUserId.current = callerId;
      socket.emit('accept-call', {
        callerId,
        answer,
      });
      setIsInCall(true);
      setIncomingCall(null);
      stopRingtone();
    } catch (error) {
      console.error('Error accepting call:', error);
      cleanupCall();
    }
  };

  const rejectCall = () => {
    if (incomingCall) {
      socket.emit('reject-call', {
        callerId: incomingCall.callerId,
      });
      setIncomingCall(null);
      stopRingtone();
    }
  };

  const endCall = () => {
    if (targetUserId.current) {
      socket.emit('end-call', { targetId: targetUserId.current });
    }
    cleanupCall();
  };

  const cleanupCall = () => {
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
      setLocalStream(null);
    }

    if (peerConnection.current) {
      peerConnection.current.close();
      peerConnection.current = null;
    }

    setRemoteStream(null);
    setIsInCall(false);
    targetUserId.current = null;
    stopRingtone();
  };

  const handleCallAccepted = async (data) => {
    const pc = peerConnection.current;
    if (!pc || !data?.answer) return;
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
    } catch (error) {
      console.error('Error setting remote description:', error);
    }
  };

  const handleIceCandidate = async (data) => {
    const pc = peerConnection.current;
    if (!pc || !data?.candidate) return;
    try {
      await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
    } catch (error) {
      console.error('Error adding ICE candidate:', error);
    }
  };

  const playRingtone = () => {
    if (window._ringtone) return;
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = 440;
    gain.gain.value = 0.03;
    oscillator.connect(gain);
    gain.connect(audioCtx.destination);
    oscillator.start();
    window._ringtone = { oscillator, gain, audioCtx };
  };

  const stopRingtone = () => {
    if (window._ringtone) {
      try {
        window._ringtone.oscillator.stop();
        window._ringtone.audioCtx.close();
      } catch (err) {
        // ignore cleanup errors
      }
      window._ringtone = null;
    }
  };

  return {
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    incomingCall,
    isInCall,
    localStream,
    remoteStream,
    isCalling: !!incomingCall,
  };
};

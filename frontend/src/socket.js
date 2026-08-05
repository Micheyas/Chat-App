import { io } from 'socket.io-client';

const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL ||
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:5000'
    : `http://${window.location.hostname}:5000`);

// Single shared socket instance — connect lazily (autoConnect: false)
// so we only connect after the user logs in / picks a username.
const socket = io(BACKEND_URL, { autoConnect: false });

export default socket;
export { BACKEND_URL };

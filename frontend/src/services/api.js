import axios from 'axios';

const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL ||
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:5000'
    : `http://${window.location.hostname}:5000`);

export { BACKEND_URL };

// Shared axios instance — attaches the JWT token automatically
const api = axios.create({ baseURL: BACKEND_URL });

api.interceptors.request.use((config) => {
  try {
    const session = JSON.parse(localStorage.getItem('chat_session'));
    if (session?.token) {
      config.headers.Authorization = `Bearer ${session.token}`;
    }
  } catch { /* no session */ }
  return config;
});

export default api;

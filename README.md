# Chat App

A real-time chat application with room chat, direct messaging, WebRTC voice/video calls, and message reactions.

## Run locally

### 1. Backend

```bash
cd backend
npm install
node migrate-v4.js
node server.js
```

The backend listens on `http://localhost:5000` by default.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev -- --host 0.0.0.0
```

Open the app at `http://localhost:5173`.

## Environment

Copy `backend/.env.example` to `backend/.env` and set:

- `DATABASE_URL` for PostgreSQL
- `JWT_SECRET`
- `ALLOWED_ORIGINS`
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_UPLOAD_PRESET`

## New features

- WebRTC voice/video calling between online users
- Message reactions with live updates
- Message editing and deletion
- Room-based group chat
- Direct messages (DMs)

## Quick test checklist

1. Start backend and frontend.
2. Register and approve users through the app and (if enabled) admin flow.
3. Open the app with two users in different browsers or tabs.
4. Use the `Users` tab to call another online user.
5. Accept/reject incoming calls.
6. Send messages and add/remove reactions with the reaction picker.
7. Verify updates appear in real time for both users.

## Notes

- The backend uses Socket.IO for real-time messaging and signaling.
- The `migrate-v4.js` script adds reaction and edit/delete support to the database.

# Chat App Deployment Guide

This guide will help you deploy your chat app so it can be accessed from your Android phone.

## Step 1: Deploy Backend to Render

1. **Create a Render account**
   - Go to https://render.com
   - Sign up for a free account

2. **Create a new Web Service**
   - Click "New +" → "Web Service"
   - Connect your GitHub repository (you'll need to push your backend code to GitHub first)
   - If you haven't pushed to GitHub yet:
     ```bash
     cd "C:\Users\schoo\OneDrive\Desktop\Chat App\backend"
     git remote add origin https://github.com/YOUR_USERNAME/chat-app-backend.git
     git branch -M main
     git push -u origin main
     ```

3. **Configure the service**
   - Name: `chat-app-backend`
   - Region: Choose the closest region
   - Branch: `main`
   - Runtime: `Node`
   - Build Command: `npm install`
   - Start Command: `node server.js`
   - Instance Type: `Free`

4. **Add Environment Variables**
   - Add `PORT` with value `10000`
   - Add `ALLOWED_ORIGINS` with value `https://your-frontend-url.vercel.app` (update after frontend deployment)

5. **Deploy**
   - Click "Create Web Service"
   - Wait for deployment to complete (2-3 minutes)
   - Copy your backend URL (e.g., `https://chat-app-backend.onrender.com`)

## Step 2: Deploy Frontend to Vercel

1. **Create a Vercel account**
   - Go to https://vercel.com
   - Sign up for a free account

2. **Update frontend environment variable**
   - Edit `frontend/.env.production`
   - Replace `https://your-backend-url.onrender.com` with your actual Render backend URL
   - Example: `VITE_BACKEND_URL=https://chat-app-backend.onrender.com`

3. **Push frontend to GitHub**
   ```bash
   cd "C:\Users\schoo\OneDrive\Desktop\Chat App\frontend"
   git init
   git add .
   git commit -m "Initial commit: Chat app frontend"
   git remote add origin https://github.com/YOUR_USERNAME/chat-app-frontend.git
   git branch -M main
   git push -u origin main
   ```

4. **Deploy to Vercel**
   - Go to Vercel dashboard
   - Click "Add New Project"
   - Import your frontend GitHub repository
   - Configure:
     - Framework Preset: `Vite`
     - Root Directory: `./`
     - Build Command: `npm run build`
     - Output Directory: `dist`
   - Click "Deploy"
   - Wait for deployment to complete

5. **Update backend CORS**
   - Go back to Render dashboard
   - Edit your backend service
   - Update `ALLOWED_ORIGINS` to include your Vercel frontend URL
   - Example: `https://your-frontend-url.vercel.app`
   - Redeploy the backend

## Step 3: Access from Your Android Phone

1. **Get your frontend URL**
   - Copy the Vercel deployment URL (e.g., `https://your-frontend-url.vercel.app`)

2. **Open on your phone**
   - Open Chrome or any browser on your Android phone
   - Navigate to your Vercel URL
   - The chat app should load and work just like on your computer

3. **Test the connection**
   - Open the app on both your computer and phone
   - Join with different usernames
   - Send messages between devices

## Alternative: Netlify Deployment

If you prefer Netlify instead of Vercel:

1. Create account at https://netlify.com
2. Drag and drop your `frontend/dist` folder (after running `npm run build`)
3. Or connect your GitHub repository
4. Add environment variable `VITE_BACKEND_URL` in Netlify settings
5. Update backend CORS with your Netlify URL

## Troubleshooting

**Backend deployment fails:**
- Check Render logs for errors
- Ensure `package.json` has correct start script
- Verify port is set to 10000 for Render

**Frontend can't connect to backend:**
- Update `VITE_BACKEND_URL` with correct backend URL
- Check backend CORS settings include your frontend URL
- Ensure backend is deployed and running

**WebSocket connection issues:**
- Render free tier supports WebSockets
- Make sure backend uses `0.0.0.0` host binding
- Check browser console for connection errors

## Cost

Both Render and Vercel offer free tiers:
- Render: Free tier with limited resources
- Vercel: Free tier for personal projects
- No credit card required for basic usage

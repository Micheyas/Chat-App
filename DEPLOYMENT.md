# Chat App Deployment Guide

This guide will help you deploy your enhanced chat app with persistent storage, file uploads, and pagination so it can be accessed from your Android phone.

**Note:** Your repository is now set up as a monorepo with both backend and frontend in the same GitHub repository: https://github.com/Micheyas/Chat-App.git

## Prerequisites

### 1. Set up Neon PostgreSQL Database
1. Go to https://neon.tech and create a free account
2. Create a new project
3. Copy your connection string (DATABASE_URL)
4. Run the schema setup in your Neon SQL editor:
   ```sql
   -- Copy the contents of backend/schema.sql and run it in Neon
   ```

### 2. Set up Cloudinary for File Uploads
1. Go to https://cloudinary.com and create a free account
2. Navigate to Settings → Upload
3. Create an unsigned upload preset
4. Copy your Cloud Name and Upload Preset

## Step 1: Deploy Backend to Render

1. **Create a Render account**
   - Go to https://render.com
   - Sign up for a free account

2. **Create a new Web Service**
   - Click "New +" → "Web Service"
   - Connect your GitHub repository: `Micheyas/Chat-App`

3. **Configure the service**
   - Name: `chat-app-backend`
   - Region: Choose the closest region
   - Branch: `main`
   - Runtime: `Node`
   - Root Directory: `backend`
   - Build Command: `npm install`
   - Start Command: `node server.js`
   - Instance Type: `Free`

4. **Add Environment Variables**
   - Add `PORT` with value `10000`
   - Add `DATABASE_URL` with your Neon connection string
   - Add `ALLOWED_ORIGINS` with value `https://your-frontend-url.vercel.app` (update after frontend deployment)
   - Add `CLOUDINARY_CLOUD_NAME` with your Cloudinary cloud name
   - Add `CLOUDINARY_UPLOAD_PRESET` with your Cloudinary upload preset

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
   - Replace `your_cloud_name` with your Cloudinary cloud name
   - Replace `your_upload_preset` with your Cloudinary upload preset
   - Example:
     ```
     VITE_BACKEND_URL=https://chat-app-backend.onrender.com
     VITE_CLOUDINARY_CLOUD_NAME=your_cloud_name
     VITE_CLOUDINARY_UPLOAD_PRESET=your_upload_preset
     ```
   - Commit this change to GitHub:
     ```bash
     cd "C:\Users\schoo\OneDrive\Desktop\Chat App"
     git add frontend/.env.production
     git commit -m "Update environment variables for production"
     git push
     ```

3. **Deploy to Vercel**
   - Go to Vercel dashboard
   - Click "Add New Project"
   - Import your GitHub repository: `Micheyas/Chat-App`
   - Configure:
     - Framework Preset: `Vite`
     - Root Directory: `frontend`
     - Build Command: `npm run build`
     - Output Directory: `dist`
   - Click "Deploy"
   - Wait for deployment to complete

4. **Update backend CORS**
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

3. **Test the enhanced features**
   - Open the app on both your computer and phone
   - Join with different usernames
   - Send text messages between devices
   - Upload images using the attachment button
   - Scroll up to load older messages (pagination)
   - Verify messages persist after refresh

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
- Check DATABASE_URL is correctly set in environment variables

**Database connection issues:**
- Verify Neon DATABASE_URL is correct
- Ensure database schema was created using `schema.sql`
- Check Render logs for PostgreSQL connection errors

**Frontend can't connect to backend:**
- Update `VITE_BACKEND_URL` with correct backend URL
- Check backend CORS settings include your frontend URL
- Ensure backend is deployed and running

**File upload issues:**
- Verify Cloudinary credentials are correct
- Check upload preset is set to "unsigned" in Cloudinary
- Ensure file size doesn't exceed Cloudinary limits
- Check browser console for upload errors

**WebSocket connection issues:**
- Render free tier supports WebSockets
- Make sure backend uses `0.0.0.0` host binding
- Check browser console for connection errors

**Pagination not working:**
- Verify messages exist in database
- Check API endpoint `/api/messages` is accessible
- Ensure frontend is calling the correct API URL

## Cost

All services offer generous free tiers:
- **Render**: Free tier with limited resources (backend hosting)
- **Vercel**: Free tier for personal projects (frontend hosting)
- **Neon**: Free tier with 0.5 GB storage (PostgreSQL database)
- **Cloudinary**: Free tier with 25 credits/month (~25 GB bandwidth)
- No credit card required for basic usage

# Quick Startup Guide

## Problem: Admin Dashboard Shows 0 Cameras

If you're seeing "Failed to load cameras for dashboard: Network Error" in the admin web dashboard, it means the backend server is not running.

## Solution: Start the Backend Server

### Option 1: Using the Batch Script (Recommended)
1. Open a terminal in the project root
2. Run: `start_backend.bat`
3. Wait for the message: "🚀 Backend API started successfully"
4. Refresh your admin dashboard in the browser

### Option 2: Manual Start
1. Open a terminal
2. Navigate to backend folder: `cd backend`
3. Activate Python environment (if using venv)
4. Run: `uvicorn app.main:app --reload --host 0.0.0.0 --port 8000`
5. Refresh your admin dashboard

### Option 3: Using VS Code Terminal
1. Open VS Code
2. Open terminal (Ctrl+`)
3. Navigate to backend: `cd backend`
4. Run: `python -m uvicorn app.main:app --reload --port 8000`

## Verify Backend is Running

Open your browser and visit: http://localhost:8000/health

You should see:
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "components": {
    "api": "operational",
    "database": "operational",
    "celery": "operational"
  }
}
```

## Complete System Startup

To run the entire system, start these components in order:

### 1. Database (PostgreSQL)
```bash
docker-compose up -d postgres
# OR if you have PostgreSQL installed locally, ensure it's running
```

### 2. Backend API
```bash
start_backend.bat
# OR
cd backend
uvicorn app.main:app --reload --port 8000
```

### 3. Frontend (Web Dashboard)
```bash
cd frontend
npm install  # First time only
npm run dev
```

### 4. Mobile App (Optional)
```bash
cd mobile
npm install  # First time only
npm start
```

### 5. AI Worker (Optional - for camera processing)
```bash
scripts\start_ai_worker.bat
# OR
cd ai_worker
python -m ai_worker
```

## Checking All Services

| Service | URL | Expected Response |
|---------|-----|-------------------|
| Backend Health | http://localhost:8000/health | `{"status": "healthy"}` |
| Backend API Docs | http://localhost:8000/docs | Swagger UI |
| Frontend | http://localhost:5173 | Admin Dashboard UI |
| Mobile | http://localhost:19006 | Expo DevTools |

## Common Issues

### Issue: "Network Error" in Admin Dashboard
**Cause:** Backend server not running
**Solution:** Start the backend using `start_backend.bat`

### Issue: "401 Unauthorized" 
**Cause:** Not logged in as admin
**Solution:** 
1. Navigate to http://localhost:5173/login
2. Login with admin credentials
3. Go back to dashboard

### Issue: "No cameras configured"
**Cause:** No cameras added to the system yet
**Solution:**
1. Click "Manage Cameras" on admin dashboard
2. Click "Add Camera" button
3. Fill in camera details (name, stream URL, location)
4. Save

### Issue: Backend won't start - "Address already in use"
**Cause:** Port 8000 is already occupied
**Solution:**
```bash
# Windows - Find and kill process on port 8000
netstat -ano | findstr :8000
taskkill /PID <PID> /F

# Then restart backend
start_backend.bat
```

### Issue: Database connection failed
**Cause:** PostgreSQL not running
**Solution:**
```bash
# Check if Docker is running PostgreSQL
docker ps

# Start PostgreSQL if needed
docker-compose up -d postgres

# OR start local PostgreSQL service
```

## Environment Variables

Ensure these are set in your `.env` files:

### Backend `.env` (backend/.env)
```env
DATABASE_URL=postgresql://user:password@localhost:5432/ai_cctv_db
FRONTEND_URL=http://localhost:5173
SECRET_KEY=your-secret-key-here
```

### Frontend `.env` (frontend/.env)
```env
VITE_API_BASE_URL=http://127.0.0.1:8000
```

## Need Help?

1. Check terminal logs for error messages
2. Check browser console (F12) for frontend errors
3. Visit backend API docs: http://localhost:8000/docs
4. Ensure all prerequisites are installed (Python, Node.js, PostgreSQL)

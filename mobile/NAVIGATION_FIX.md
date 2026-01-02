# 🚨 STILL NOT NAVIGATING? QUICK FIX STEPS

## Step 1: Check Console Output (MOST IMPORTANT)

Open your browser console (F12) and look for these messages:

### ✅ What you SHOULD see:
```
[mobile/services/api] Platform.OS = web
[mobile/services/api] Using BASE_URL = http://localhost:8000
=== LOGIN DEBUG ===
BASE_URL: http://localhost:8000
Username/Email: your@email.com
Role: viewer
Attempting login to: http://localhost:8000/api/v1/auth/login
Response status: 200
Response ok: true
Login SUCCESS - returning success=true
[ViewerLogin] Login successful, navigating to dashboard...
```

### ❌ What indicates a problem:

**Problem 1: Connection timeout**
```
Failed to fetch
BASE_URL: http://10.0.2.2:8000  ❌ Wrong URL for web!
```
**Fix:** Clear browser cache/localStorage (see Step 2)

**Problem 2: Backend not running**
```
Response status: Failed to fetch
TypeError: Failed to fetch
```
**Fix:** Start the backend (see Step 3)

**Problem 3: Wrong credentials**
```
Response status: 401
Response ok: false
Login FAILED - response not ok
```
**Fix:** Use correct credentials (see Step 4)

## Step 2: Clear Browser Cache (If seeing 10.0.2.2)

**In browser console (F12), run this:**
```javascript
localStorage.clear();
sessionStorage.clear();
indexedDB.databases().then(dbs => dbs.forEach(db => indexedDB.deleteDatabase(db.name)));
location.reload();
```

**OR restart mobile app with:**
```bash
# Stop the app (Ctrl+C)
npm start -- --clear
# Press 'w' for web
```

## Step 3: Start Backend Server

**Option A: Quick Start**
```bash
cd C:\Users\dell\Desktop\Projects\AI_based_cctv_multi_detection
check_backend.bat
```

**Option B: Manual Start**
```bash
cd backend
conda activate ai_worker
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Option C: Using existing script**
```bash
cd C:\Users\dell\Desktop\Projects\AI_based_cctv_multi_detection
start_backend.bat
```

**Verify backend is running:** Open http://localhost:8000/docs in browser

## Step 4: Use Valid Test Credentials

Check your backend database or use these default credentials if seeded:

**Viewer:**
- Email: `viewer@example.com`
- Password: `viewerpass`

**Security:**
- Email: `security@example.com`
- Password: `securitypass`

**Admin:**
- Email: `admin@example.com`
- Password: `adminpass`

## Step 5: Check Navigation Setup

The console should show:
```
[ViewerLogin] Login response: {success: true, data: {...}}
[ViewerLogin] Login successful, navigating to dashboard...
```

If you see "Login successful" but no navigation:
1. Check if `ViewerDashboard` screen exists in App.jsx
2. Check for JavaScript errors in console
3. Make sure React Navigation is working

## Step 6: Nuclear Option - Full Reset

```bash
# Stop all running servers (Ctrl+C in all terminals)

# Clear mobile cache
cd mobile
npm start -- --clear

# In a NEW browser tab:
# 1. Press F12 (open console)
# 2. Run: localStorage.clear(); location.reload()
# 3. Press 'w' in the terminal to open web

# Start backend in separate terminal
cd backend
conda activate ai_worker
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## What I Just Added

Enhanced logging in `api.js` that shows:
- ✅ Exact BASE_URL being used
- ✅ Request details
- ✅ Response status and data
- ✅ Success/failure clearly marked
- ✅ Detailed error messages

**Now when you login, check the console and report back what you see!**

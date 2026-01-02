# 🚀 Quick Start Guide - Mobile App (Web, Android, iOS)

## ✅ Fixed Issues
- Removed hardcoded Android emulator URL from `app.json`
- Added automatic platform detection for Web, Android, and iOS
- Created `.env` configuration for easy customization
- App now works seamlessly on all platforms

## 📱 How to Start the Mobile App

### Step 1: Start the Backend Server (REQUIRED)

The mobile app needs the backend API running. Open a terminal and run:

**Windows:**
```bash
cd C:\Users\dell\Desktop\Projects\AI_based_cctv_multi_detection
start_backend.bat
```

**Or manually:**
```bash
cd backend
conda activate ai_worker
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

✅ You should see: `Uvicorn running on http://0.0.0.0:8000`

### Step 2: Start the Mobile App

Open a **new terminal** and run:

```bash
cd mobile
npm start
```

### Step 3: Choose Your Platform

After starting, press:
- **`w`** - Open in **web browser** (localhost:8000 automatically used)
- **`a`** - Open in **Android emulator** (10.0.2.2:8000 automatically used)  
- **`i`** - Open in **iOS simulator** (localhost:8000 automatically used)

## 📋 Platform-Specific URLs

The app **automatically** uses the correct URL based on your platform:

| Platform | Backend URL | Notes |
|----------|-------------|-------|
| 🌐 **Web** | `http://localhost:8000` | Auto-detected ✅ |
| 🤖 **Android Emulator** | `http://10.0.2.2:8000` | Auto-detected ✅ |
| 🍎 **iOS Simulator** | `http://localhost:8000` | Auto-detected ✅ |
| 📱 **Physical Devices** | `http://YOUR_IP:8000` | Manual setup needed ⚙️ |

## 📱 For Physical Devices (Android/iOS)

If testing on a **real phone or tablet**:

1. **Find your computer's IP address:**
   - Windows: `ipconfig` → Look for IPv4 Address (e.g., `192.168.1.100`)
   - Mac/Linux: `ifconfig` → Look for inet address

2. **Edit `.env` file** in `mobile/` folder:
   ```bash
   EXPO_PUBLIC_API_URL=http://192.168.1.100:8000
   ```
   (Replace `192.168.1.100` with YOUR computer's IP)

3. **Restart the Expo server:**
   ```bash
   npm start -- --clear
   ```

4. **Scan the QR code** with:
   - Android: Expo Go app
   - iOS: Camera app

⚠️ **Important**: Your phone and computer must be on the **same WiFi network**!

## 🧪 Testing Login

Once the app is running:

1. Navigate to the login screen (Viewer, Security, or Admin)
2. Enter credentials from your backend database
3. Click "Login"

**Test credentials** (if using default seeded data):
- Email: `viewer@example.com` / Password: `viewerpass`
- Email: `security@example.com` / Password: `securitypass`  
- Email: `admin@example.com` / Password: `adminpass`

## 🔍 Troubleshooting

### Error: "Failed to fetch" or "Connection timeout"

**Solution 1**: Make sure backend is running
```bash
# Check if backend is running on port 8000
# You should see uvicorn running in another terminal
```

**Solution 2**: Clear cache and restart
```bash
cd mobile
npm start -- --clear
```

**Solution 3**: Check the console logs
Look for this line when app starts:
```
[mobile/services/api] Using BASE_URL = http://localhost:8000
```

This confirms which URL the app is using.

### Still not working?

1. **Backend firewall**: Make sure Windows Firewall allows connections on port 8000
2. **Wrong platform**: Web should use `localhost`, Android emulator should use `10.0.2.2`
3. **Physical device**: Must use computer's IP address in `.env` file

## 📖 More Information

See [CONFIGURATION.md](./CONFIGURATION.md) for detailed platform configuration guide.

## ✨ What Was Changed

**Files modified:**
- ✅ `mobile/app.json` - Removed hardcoded `10.0.2.2:8000`
- ✅ `mobile/services/api.js` - Enhanced platform detection with proper priority order
- ✅ `mobile/.env` - Created with default settings
- ✅ `mobile/.env.example` - Template for configuration
- ✅ `mobile/.gitignore` - Added `.env` to prevent committing sensitive data

**How it works now:**
1. Checks for `EXPO_PUBLIC_API_URL` in `.env` file (highest priority)
2. Checks `app.json` for `EXPO_BASE_URL` (removed in this fix)
3. Auto-detects platform and uses appropriate default URL
4. Logs the selected URL to console for debugging

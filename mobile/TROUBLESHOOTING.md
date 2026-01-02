# 🚨 Quick Fix for "10.0.2.2 on Web" Issue

## Problem
You're seeing `BASE_URL= http://10.0.2.2:8000` when running on web, but it should be `http://localhost:8000`.

## Solution - Choose ONE:

### Option 1: Clear Cache via Dev Debug Screen (Recommended)

1. **On the login screen**, look for the yellow **"Open Dev Debug"** button
2. Click it to open the Dev Debug screen
3. Scroll down and click **"Clear All Cache & Restart"**
4. **Restart the mobile app** (stop with Ctrl+C and run `npm start` again)
5. Press **`w`** for web

### Option 2: Clear Browser Cache

If running on web browser:
1. Open **browser console** (F12)
2. Go to **Application** tab (Chrome) or **Storage** tab (Firefox)
3. Find **Local Storage** or **IndexedDB**
4. Delete all entries for your localhost
5. **Refresh the page** (F5 or Ctrl+R)

### Option 3: Clear from Code (Manual)

Run this in the browser console:
```javascript
localStorage.clear();
indexedDB.deleteDatabase('expo');
location.reload();
```

### Option 4: Restart Fresh

```bash
# Stop the mobile app (Ctrl+C)
cd mobile
npm start -- --clear
# Press 'w' for web
```

## Verify It's Fixed

After clearing cache, check the console. You should see:
```
[mobile/services/api] Platform.OS = web
[mobile/services/api] Using BASE_URL = http://localhost:8000
```

NOT:
```
[mobile/services/api] Platform.OS = web
[mobile/services/api] Using BASE_URL = http://10.0.2.2:8000  ❌ WRONG!
```

## Why This Happened

An old override URL was stored in AsyncStorage/LocalStorage from a previous test. The app was using that cached value instead of detecting your platform.

## Prevention

- The app now logs platform detection for easier debugging
- Dev Debug screen shows what URL is being used
- Always check the console logs when switching platforms

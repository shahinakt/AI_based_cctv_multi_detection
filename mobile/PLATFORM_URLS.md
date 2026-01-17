# Platform URL Configuration Guide

## 🎯 Quick Reference

The mobile app automatically configures the correct backend URL based on your platform:

| Platform | URL | Configuration |
|----------|-----|---------------|
| 🌐 **Web Browser** | `http://localhost:8000` | ✅ Auto-configured |
| 🍎 **iOS Simulator** | `http://localhost:8000` | ✅ Auto-configured |
| 🤖 **Android Emulator** | `http://10.0.2.2:8000` | ✅ Auto-configured |
| 📱 **Physical Devices** | `http://YOUR_IP:8000` | ⚙️ Manual setup required |

---

## 📋 Configuration Steps

### For Web Testing (Browser)
1. Make sure `.env` has: `EXPO_PUBLIC_API_URL=http://localhost:8000`
2. Start backend: `npm run start:backend` or `uvicorn app.main:app --reload`
3. Start mobile: `npm start`
4. Press `w` to open in web browser
5. ✅ Login should work!

### For iOS Simulator
1. Make sure `.env` has: `EXPO_PUBLIC_API_URL=http://localhost:8000`
2. Start backend on your Mac
3. Start mobile: `npm start`
4. Press `i` to open in iOS Simulator
5. ✅ Should work automatically!

### For Android Emulator
1. The app will auto-detect and use `http://10.0.2.2:8000`
2. This special IP allows the emulator to reach your computer's localhost
3. Start backend on `localhost:8000`
4. Start mobile: `npm start`
5. Press `a` to open in Android Emulator
6. ✅ Should work automatically!

### For Physical Devices (Android/iOS Phone)

#### Step 1: Find Your Computer's IP Address

**Windows:**
```bash
ipconfig
```
Look for "IPv4 Address" under your WiFi/Ethernet adapter
Example: `192.168.1.38`

**Mac/Linux:**
```bash
ifconfig | grep "inet "
# or
ip addr show
```
Look for your local network IP (192.168.x.x or 10.0.x.x)

#### Step 2: Update .env File
```bash
# Open mobile/.env
# Comment out localhost line and uncomment device line:

# EXPO_PUBLIC_API_URL=http://localhost:8000
EXPO_PUBLIC_API_URL=http://192.168.1.38:8000  # <-- Replace with YOUR IP
```

#### Step 3: Update Backend to Accept All IPs
Make sure your backend is running on `0.0.0.0:8000` (not just localhost):
```bash
cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

#### Step 4: Restart Mobile App
```bash
cd mobile
npm start -- --clear  # Clear cache
```

#### Step 5: Connect Your Phone
- Make sure your phone is on the **same WiFi network** as your computer
- Scan the QR code with Expo Go app
- ✅ Login should work!

---

## 🔧 Troubleshooting

### "Cannot connect to backend" on Web
- ✅ Make sure `.env` has `http://localhost:8000` (not 192.168.x.x)
- ✅ Make sure backend is running: `http://localhost:8000/docs`
- ✅ Clear browser cache
- ✅ Check browser console for errors

### "Network request failed" on Android Emulator
- ✅ The app should auto-use `10.0.2.2` - check console logs
- ✅ Make sure backend is running on `localhost:8000`
- ✅ Restart emulator if needed
- ✅ Check Expo console: `npm start` output

### "Network request failed" on Physical Device
- ✅ Phone and computer must be on **same WiFi network**
- ✅ Backend must be running on `0.0.0.0:8000` (not just localhost)
- ✅ Firewall might be blocking - allow port 8000
- ✅ Check IP address is correct in `.env`
- ✅ Try pinging your computer from phone: `ping 192.168.1.38`

### "Login works on emulator but not on phone"
- ✅ Update `.env` to use your IP instead of localhost
- ✅ Backend needs `--host 0.0.0.0` flag

---

## 📱 Platform Detection Logs

The app logs platform detection info in the console. Check these logs:

```
[mobile/services/api] ==========================================
[mobile/services/api] Platform Detection
[mobile/services/api] Platform.OS = web
[mobile/services/api] Initial BASE_URL = http://localhost:8000
[mobile/services/api] ✅ Final BASE_URL = http://localhost:8000
[mobile/services/api] ==========================================
```

If you see warnings about invalid URLs, the app will auto-fix them!

---

## 🎯 Current Configuration

Your current setup (as of this guide):
- **Default:** Web testing with `http://localhost:8000`
- **Your IP:** `192.168.1.38` (update in `.env` for physical devices)

---

## 💡 Pro Tips

1. **Keep it simple:** Use localhost for emulator/simulator testing
2. **For demos:** Use physical devices with your IP address
3. **For production:** Use actual server domain (e.g., `https://api.example.com`)
4. **Check logs:** Console logs will show which URL is being used
5. **Clear cache:** If changing .env, run `npm start -- --clear`

---

## 🆘 Still Having Issues?

1. Check console logs in both Expo and browser/device
2. Test backend directly: `http://localhost:8000/docs`
3. Verify CORS is enabled in backend (should allow all origins in dev)
4. Make sure all services are running:
   - Backend: `http://localhost:8000`
   - Frontend: `http://localhost:5173` (if needed)
   - Mobile: Expo dev server

---

Last Updated: January 11, 2026

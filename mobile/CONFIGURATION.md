# Mobile App Configuration Guide

## Platform Support

This mobile app works on:
- ✅ **Web browsers** (Chrome, Firefox, Safari, etc.)
- ✅ **Android** (emulators and physical devices)
- ✅ **iOS** (simulators and physical devices)

## Backend Connection Setup

### Automatic Configuration (Recommended)

The app automatically detects your platform and uses the appropriate backend URL:

| Platform | Default Backend URL |
|----------|---------------------|
| Web | `http://localhost:8000` |
| iOS Simulator | `http://localhost:8000` |
| Android Emulator | `http://10.0.2.2:8000` |
| Physical Devices | Use manual configuration below |

### Manual Configuration (For Physical Devices)

If you're testing on a **physical Android or iOS device**, you need to set your computer's IP address:

1. Find your computer's local IP address:
   - **Windows**: Run `ipconfig` and look for "IPv4 Address" (e.g., `192.168.1.100`)
   - **Mac/Linux**: Run `ifconfig` or `ip addr` and look for your local network IP

2. Create or edit `.env` file in the `mobile/` directory:
   ```bash
   EXPO_PUBLIC_API_URL=http://YOUR_COMPUTER_IP:8000
   ```
   
   Example:
   ```bash
   EXPO_PUBLIC_API_URL=http://192.168.1.100:8000
   ```

3. Restart the Expo development server

### Verification

Check the console logs when the app starts. You should see:
```
[mobile/services/api] Using BASE_URL = http://localhost:8000
```

This confirms which backend URL the app is using.

## Starting the App

### For Web:
```bash
cd mobile
npm start
# Press 'w' to open in web browser
```

### For Android:
```bash
cd mobile
npm start
# Press 'a' to open in Android emulator
# Or scan QR code with Expo Go app on physical device
```

### For iOS:
```bash
cd mobile
npm start
# Press 'i' to open in iOS simulator
# Or scan QR code with Expo Go app on physical device
```

## Troubleshooting

### "Failed to fetch" or "Connection timeout" errors:

1. **Make sure the backend is running**:
   ```bash
   cd backend
   venv\Scripts\activate  # Windows
   # source venv/bin/activate  # Mac/Linux
   uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
   ```

2. **For web**: Use `http://localhost:8000`

3. **For Android emulator**: Use `http://10.0.2.2:8000`

4. **For physical devices**: 
   - Ensure your phone and computer are on the **same WiFi network**
   - Use your computer's IP address in `.env` file
   - Make sure Windows Firewall allows connections on port 8000

5. **Clear app cache and restart**:
   ```bash
   npm start -- --clear
   ```

## Common Issues

### Issue: "ERR_CONNECTION_REFUSED"
- **Solution**: Backend server is not running. Start it with the command above.

### Issue: App loads but login fails
- **Solution**: Check the BASE_URL in console logs matches where your backend is running.

### Issue: Works on web but not on Android
- **Solution**: Android emulator needs `10.0.2.2` instead of `localhost`. This should be automatic.

### Issue: Works on emulator but not on physical device
- **Solution**: Set your computer's IP in `.env` file as shown above.

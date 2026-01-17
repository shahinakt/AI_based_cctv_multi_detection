# Push Notifications Setup Guide
## Real-time Incident Alerts for iOS & Android

This guide will help you set up **real push notifications** so you can receive incident alerts on your physical iOS and Android devices.

---

## 📋 Prerequisites

### For Both Platforms:
1. **Expo Account** (free)
   - Sign up at https://expo.dev

2. **Install EAS CLI**
   ```bash
   npm install -g eas-cli
   eas login
   ```

### For iOS Only:
3. **Apple Developer Account** ($99/year)
   - Required for push notifications on iOS
   - Sign up at https://developer.apple.com

### For Android Only:
3. **Enable Developer Mode** on your Android device

---

## 🚀 Quick Start

### Option 1: Automated Build Scripts

#### For Android (Easiest):
```bash
cd mobile
build_dev_android.bat
```

#### For iOS:
```bash
cd mobile
build_dev_ios.bat
```

#### For Both:
```bash
cd mobile
build_both_platforms.bat
```

### Option 2: Manual Commands

```bash
cd mobile

# Configure EAS (first time only)
eas build:configure

# Build for Android
eas build --profile development --platform android

# Build for iOS
eas build --profile development --platform ios

# Build both
eas build --profile development --platform all
```

---

## 📱 Installation on Devices

### **Android Installation (Simple)**

1. **Build completes** → Download the `.apk` file from:
   - The terminal link
   - Your email
   - https://expo.dev/accounts/YOUR_USERNAME/projects/ai-cctv-mobile/builds

2. **Transfer to device:**
   - Email it to yourself
   - Use USB cable
   - Use cloud storage (Google Drive, etc.)

3. **Install:**
   - On device: Settings → Security → Enable "Install from Unknown Sources"
   - Tap the `.apk` file
   - Tap "Install"

4. **Done!** The app is installed with push notification support.

---

### **iOS Installation (3 Methods)**

#### Method 1: TestFlight (Recommended - Easiest for Multiple Testers)

1. **After build completes**, submit to TestFlight:
   ```bash
   eas submit --platform ios --latest
   ```

2. **Add testers** in App Store Connect:
   - Go to https://appstoreconnect.apple.com
   - Select your app → TestFlight
   - Add testers by email

3. **Testers receive email** → Install TestFlight app → Install your app

4. **Benefits:**
   - Easy to share with team
   - Automatic updates
   - No cable needed

#### Method 2: Direct Install via Link (Quick for Personal Use)

1. **After build completes**, get the download link from terminal or email

2. **On your iOS device:**
   - Open the link in Safari
   - Tap "Install"
   - Go to Settings → General → VPN & Device Management
   - Trust the developer certificate

3. **Done!**

#### Method 3: Xcode Devices Window (Developer Option)

1. **Download** the `.ipa` file to your Mac

2. **Connect** your iOS device via USB

3. **Open Xcode** → Window → Devices and Simulators

4. **Drag** the `.ipa` file onto your device

---

## 🔔 Testing Push Notifications

### 1. **Test from Backend**

Your backend already has the notification system set up. When an incident is detected:

```python
# This code already exists in your backend
await notification_manager.send_incident_notification(
    incident_id=incident.id,
    title=f"🚨 {incident.incident_type.upper()} Detected",
    body=f"Camera: {incident.camera.name}, Severity: {incident.severity}",
    data={
        "incidentId": str(incident.id),
        "cameraId": str(incident.camera_id),
        "type": incident.incident_type
    }
)
```

### 2. **Manual Test via Expo Push Tool**

Visit https://expo.dev/notifications and send a test notification:

```json
{
  "to": "YOUR_EXPO_PUSH_TOKEN",
  "title": "🚨 Test Incident",
  "body": "Fall detected on Camera 1",
  "data": {
    "incidentId": "test-123",
    "type": "fall"
  }
}
```

### 3. **Get Your Push Token**

The app logs your push token on startup. Check:
- App console output
- DevDebug screen (if you add a display)
- Your backend logs when you register

---

## 🔧 Configuration Files Created

1. **[eas.json](mobile/eas.json)** - Build profiles
2. **[app.json](mobile/app.json)** - Updated with notification config
3. **build_dev_android.bat** - Android build script
4. **build_dev_ios.bat** - iOS build script
5. **build_both_platforms.bat** - Both platforms script

---

## 📊 Build Process Timeline

| Platform | Build Time | Installation Time |
|----------|-----------|-------------------|
| Android  | 15-20 min | 1 min            |
| iOS      | 20-30 min | 5-10 min         |
| Both     | 30-45 min | Varies           |

---

## ❗ Common Issues & Solutions

### Android Issues

**"Install blocked"**
- Solution: Settings → Security → Enable Unknown Sources

**"App not installed"**
- Solution: Uninstall old version first

### iOS Issues

**"Untrusted Developer"**
- Solution: Settings → General → VPN & Device Management → Trust

**"Unable to install"**
- Solution: Check if you have an active Apple Developer account

**Build fails with certificate error**
- Solution: Run `eas credentials` to manage certificates

---

## 🔐 Push Notification Credentials

### Android (Firebase)
If you want to use Firebase Cloud Messaging (FCM) for more features:

1. Create project at https://console.firebase.google.com
2. Download `google-services.json`
3. Place in `mobile/` directory
4. Rebuild

### iOS (APNs)
Handled automatically by EAS! Your Apple Developer account is linked during build.

---

## 🎯 Next Steps After Installation

1. **Open the app** on your device
2. **Login** as Security or Admin
3. **Grant notification permissions** when prompted
4. **Trigger a test incident** from your AI worker
5. **Receive the push notification!**

---

## 📞 Support

If builds fail:
```bash
# Check build logs
eas build:list

# View specific build
eas build:view [BUILD_ID]

# Re-configure credentials
eas credentials
```

---

## 💡 Tips

- **First build takes longest** (creates certificates)
- **Subsequent builds** are faster (~10-15 min)
- **Development builds** are larger than production
- **Keep your Expo CLI updated**: `npm install -g eas-cli@latest`
- **Check build queue**: https://expo.dev/accounts/YOUR_USERNAME/projects/ai-cctv-mobile/builds

---

## 🚀 Production Builds (When Ready)

For app store submission:

```bash
# Production build
eas build --profile production --platform android
eas build --profile production --platform ios

# Submit to stores
eas submit --platform android --latest
eas submit --platform ios --latest
```

---

## 🔄 Update Process

When you make changes to your app:

```bash
# Rebuild with changes
eas build --profile development --platform all

# Or push OTA updates (for JS-only changes)
eas update --branch development
```

OTA updates work instantly without rebuilding!

---

**Ready to build?** Run one of the `.bat` scripts in the `mobile/` folder!

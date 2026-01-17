# 🔔 Push Notifications Quick Start

Get real-time incident alerts on your iOS and Android devices!

## 🚀 Super Quick Start

```bash
cd mobile
setup_notifications.bat
```

Choose your platform and follow the prompts!

---

## 📱 What Gets Built

### Android
- **File:** `.apk`
- **Time:** 15-20 minutes
- **Install:** Direct install on device
- **Requirements:** None (just enable Unknown Sources)

### iOS  
- **File:** `.ipa`
- **Time:** 20-30 minutes
- **Install:** TestFlight or direct
- **Requirements:** Apple Developer Account ($99/year)

---

## 🎯 Simple 3-Step Process

### Step 1: Build
```bash
# Choose one:
build_dev_android.bat      # Android only
build_dev_ios.bat          # iOS only  
build_both_platforms.bat   # Both platforms
```

### Step 2: Install

**Android:**
1. Download `.apk` from build link
2. Install on device
3. Done! ✅

**iOS:**
1. Run: `eas submit --platform ios --latest`
2. Install via TestFlight
3. Done! ✅

### Step 3: Test
1. Open app on device
2. Login
3. Trigger incident from AI
4. Receive push notification! 🎉

---

## 📚 Documentation

- **Full Guide:** [PUSH_NOTIFICATIONS_SETUP.md](PUSH_NOTIFICATIONS_SETUP.md)
- **Quick Reference:** [QUICK_REFERENCE.txt](QUICK_REFERENCE.txt)

---

## ⚡ One-Line Commands

```bash
# Android
npm run build:dev:android

# iOS
npm run build:dev:ios

# Both
npm run build:dev:all
```

---

## ❓ Why Do I Need This?

**Problem:** Expo Go doesn't support remote push notifications

**Solution:** Development builds are like Expo Go but with full native capabilities including:
- ✅ Real push notifications
- ✅ Full camera access
- ✅ Background tasks
- ✅ Native modules

---

## 🆘 Help

**Build fails?**
```bash
eas build:list              # Check status
eas credentials             # Fix certificates
```

**Can't install?**
- Android: Enable "Unknown Sources" in Settings
- iOS: Trust certificate in Settings → General → Device Management

---

## 🎯 What You Get

After installation, your app will:
1. **Register for push notifications** on startup
2. **Send token to backend** automatically
3. **Receive real-time alerts** when incidents detected
4. **Navigate to incident** when notification tapped

Your backend already handles sending notifications - just install the app!

---

**Ready?** Run `setup_notifications.bat` to get started! 🚀

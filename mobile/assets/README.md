# Assets Directory

This directory should contain the following image files for the mobile app:

## Required Assets

1. **icon.png** - App icon (1024x1024px)
2. **splash.png** - Splash screen image (1284x2778px for iOS, can be centered)
3. **adaptive-icon.png** - Android adaptive icon foreground (1024x1024px)
4. **favicon.png** - Web favicon (48x48px or larger)
5. **notification-icon.png** - Notification icon (96x96px, transparent background)

## Creating Placeholder Assets

For development purposes, you can create simple placeholder images using any image editing tool or online services like:
- Canva
- Figma
- Adobe Express
- Or simply use solid color squares

## Temporary Solution

If you don't have assets yet, you can comment out the asset references in app.json temporarily:
- Remove or comment the `icon`, `splash`, and plugin configurations
- The app will work but won't have custom branding

## Production Assets

Before deploying to production:
1. Create professional icons and splash screens
2. Follow platform guidelines (iOS Human Interface Guidelines, Material Design)
3. Test on multiple device sizes
4. Ensure proper resolution and formats

// services/notifications.js
import * as Notifications from 'expo-notifications';
import * as Permissions from 'expo-permissions';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { CommonActions } from '@react-navigation/native'; // For deep linking

// This function should be called once, e.g., in App.jsx useEffect
export async function registerForPushNotificationsAsync() {
  let token;
  if (Constants.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      alert('Failed to get push token for push notification!');
      return;
    }
    token = (await Notifications.getExpoPushTokenAsync()).data;
    console.log('Expo Push Token:', token);
    // You might want to send this token to your backend
    // await sendPushTokenToBackend(token);
  } else {
    alert('Must use physical device for Push Notifications');
  }

  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  return token;
}

// This function handles notification responses (when user taps on a notification)
export function handleNotification(response) {
  const { notification } = response;
  const { data } = notification.request.content;

  console.log('Notification tapped:', data);

  // Example deep linking logic
  if (data && data.incidentId) {
    // Assuming your navigation ref is accessible or you pass it
    // For simplicity, we'll use a global navigation object if available,
    // or you'd typically pass `navigation` from the root component.
    // For this example, we'll assume `navigation` is passed or available.
    // In a real app, you'd use a NavigationContainer ref:
    // import { navigationRef } from '../App'; // if you export it
    // navigationRef.current?.dispatch(...)

    // For this example, we'll simulate navigation.
    // In a real app, you'd need to ensure the navigation object is available
    // or use a global navigation service.
    // For now, this will just log the intended navigation.
    console.log(`Navigating to IncidentDetail with incidentId: ${data.incidentId}`);
    // If you have a navigation ref, you would do:
    // navigationRef.current?.dispatch(
    //   CommonActions.navigate({
    //     name: 'IncidentDetail',
    //     params: { incident: { id: data.incidentId, ...data } }, // Pass incident data
    //   })
    // );
  }
}

// Example function to send push token to your backend (implement this)
// async function sendPushTokenToBackend(token) {
//   try {
//     // await api.post('/register-push-token', { token, userId: 'current_user_id' });
//     console.log('Push token sent to backend successfully.');
//   } catch (error) {
//     console.error('Failed to send push token to backend:', error);
//   }
// }
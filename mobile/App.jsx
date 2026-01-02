// App.jsx
import React, { useState, useEffect } from 'react';
import { Platform } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { TailwindProvider } from 'tailwind-rn';
import utilities from './tailwind.json'; // Ensure this path is correct
import { registerForPushNotificationsAsync, handleNotification } from './services/notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { registerPushToken } from './services/api';
import * as Notifications from 'expo-notifications';

// Import Screens
import RegistrationScreen from './screens/Registration';
import SecurityLoginScreen from './screens/SecurityLogin';
import ViewerLoginScreen from './screens/ViewerLogin';
import AdminLoginScreen from './screens/AdminLogin';
import DevDebugScreen from './screens/DevDebug';
import SecurityDashboardScreen from './screens/SecurityDashboardNew';
import ViewerDashboardScreen from './screens/ViewerDashboardNew';
import AdminDashboardScreen from './screens/AdminDashboard';
import IncidentListScreen from './screens/IncidentList';
import IncidentDetailScreen from './screens/IncidentDetail';
import ProfileScreen from './screens/Profile';
import GrantAccessScreen from './screens/GrantAccess';
import AdminProfileScreen from './screens/AdminProfile';
import EvidenceStoreScreen from './screens/EvidenceStore';
import AcknowledgementScreen from './screens/Acknowledgement';

const Stack = createNativeStackNavigator();

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export default function App() {
  const [expoPushToken, setExpoPushToken] = useState('');
  const [notification, setNotification] = useState(false);

  useEffect(() => {
    // Register for push notifications and persist token locally.
    registerForPushNotificationsAsync().then(async token => {
      setExpoPushToken(token);
      try {
        if (token) await AsyncStorage.setItem('expoPushToken', token);
      } catch (err) {
        console.warn('Failed to persist expo push token', err);
      }

      // If the user is already authenticated, try to register the push token with backend.
      try {
        const authToken = await AsyncStorage.getItem('userToken');
        if (authToken && token) {
          const res = await registerPushToken(token, authToken);
          if (res.success) console.log('Push token registered with backend');
          else console.warn('Push token registration failed:', res.message);
        }
      } catch (err) {
        console.warn('Error while auto-registering push token', err);
      }
    });

    const notificationListener = Notifications.addNotificationReceivedListener(notification => {
      setNotification(notification);
    });

    const responseListener = Notifications.addNotificationResponseReceivedListener(response => {
      handleNotification(response);
    });

    return () => {
      // Only remove subscriptions on native platforms, not on web
      if (Platform.OS !== 'web') {
        Notifications.removeNotificationSubscription(notificationListener);
        Notifications.removeNotificationSubscription(responseListener);
      }
    };
  }, []);

  return (
    <TailwindProvider utilities={utilities}>
      <NavigationContainer>
        <Stack.Navigator initialRouteName="Registration">
          <Stack.Screen name="Registration" component={RegistrationScreen} options={{ headerShown: false }} />
          <Stack.Screen name="DevDebug" component={DevDebugScreen} options={{ title: 'Dev Debug' }} />
          <Stack.Screen name="SecurityLogin" component={SecurityLoginScreen} options={{ title: 'Security Login' }} />
          <Stack.Screen name="ViewerLogin" component={ViewerLoginScreen} options={{ title: 'Viewer Login' }} />
          <Stack.Screen name="AdminLogin" component={AdminLoginScreen} options={{ title: 'Admin Login' }} />
          <Stack.Screen name="SecurityDashboard" component={SecurityDashboardScreen} options={{ headerShown: false }} />
          <Stack.Screen name="ViewerDashboard" component={ViewerDashboardScreen} options={{ title: 'Viewer Dashboard' }} />
          <Stack.Screen name="AdminDashboard" component={AdminDashboardScreen} options={{ headerShown: false }} />
          <Stack.Screen name="IncidentList" component={IncidentListScreen} options={{ title: 'Incidents' }} />
          <Stack.Screen name="IncidentDetail" component={IncidentDetailScreen} options={{ title: 'Incident Detail' }} />
          <Stack.Screen name="GrantAccess" component={GrantAccessScreen} options={{ title: 'Grant Access' }} />
          <Stack.Screen name="AdminProfile" component={AdminProfileScreen} options={{ title: 'Admin Profile' }} />
          <Stack.Screen name="EvidenceStore" component={EvidenceStoreScreen} options={{ title: 'Evidence Store' }} />
          <Stack.Screen name="Acknowledgement" component={AcknowledgementScreen} options={{ title: 'Acknowledge / Report' }} />
          <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profile' }} />
        </Stack.Navigator>
      </NavigationContainer>
    </TailwindProvider>
  );
}
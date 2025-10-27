// App.jsx
import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { TailwindProvider } from 'tailwind-rn';
import utilities from './tailwind.json'; // Ensure this path is correct
import { registerForPushNotificationsAsync, handleNotification } from './services/notifications';
import * as Notifications from 'expo-notifications';

// Import Screens
import RegistrationScreen from './screens/Registration';
import SecurityLoginScreen from './screens/SecurityLogin';
import ViewerLoginScreen from './screens/ViewerLogin';
import AdminLoginScreen from './screens/AdminLogin';
import SecurityDashboardScreen from './screens/SecurityDashboard';
import ViewerDashboardScreen from './screens/ViewerDashboard';
import AdminDashboardScreen from './screens/AdminDashboard';
import IncidentListScreen from './screens/IncidentList';
import IncidentDetailScreen from './screens/IncidentDetail';

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
    registerForPushNotificationsAsync().then(token => setExpoPushToken(token));

    const notificationListener = Notifications.addNotificationReceivedListener(notification => {
      setNotification(notification);
    });

    const responseListener = Notifications.addNotificationResponseReceivedListener(response => {
      handleNotification(response);
    });

    return () => {
      Notifications.removeNotificationSubscription(notificationListener);
      Notifications.removeNotificationSubscription(responseListener);
    };
  }, []);

  return (
    <TailwindProvider utilities={utilities}>
      <NavigationContainer>
        <Stack.Navigator initialRouteName="Registration">
          <Stack.Screen name="Registration" component={RegistrationScreen} options={{ headerShown: false }} />
          <Stack.Screen name="SecurityLogin" component={SecurityLoginScreen} options={{ title: 'Security Login' }} />
          <Stack.Screen name="ViewerLogin" component={ViewerLoginScreen} options={{ title: 'Viewer Login' }} />
          <Stack.Screen name="AdminLogin" component={AdminLoginScreen} options={{ title: 'Admin Login' }} />
          <Stack.Screen name="SecurityDashboard" component={SecurityDashboardScreen} options={{ title: 'Security Dashboard' }} />
          <Stack.Screen name="ViewerDashboard" component={ViewerDashboardScreen} options={{ title: 'Viewer Dashboard' }} />
          <Stack.Screen name="AdminDashboard" component={AdminDashboardScreen} options={{ title: 'Admin Dashboard' }} />
          <Stack.Screen name="IncidentList" component={IncidentListScreen} options={{ title: 'Incidents' }} />
          <Stack.Screen name="IncidentDetail" component={IncidentDetailScreen} options={{ title: 'Incident Detail' }} />
        </Stack.Navigator>
      </NavigationContainer>
    </TailwindProvider>
  );
}
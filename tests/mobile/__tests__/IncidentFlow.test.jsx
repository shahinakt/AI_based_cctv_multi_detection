// tests/mobile/__tests__/IncidentFlow.test.jsx
import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { TailwindProvider } from 'tailwind-rn';
import utilities from '../../../mobile/tailwind.json'; // Mock this if not generated

// Screens to test
import SecurityLoginScreen from '../../../mobile/screens/SecurityLogin';
import SecurityDashboardScreen from '../../../mobile/screens/SecurityDashboard';
import IncidentDetailScreen from '../../../mobile/screens/IncidentDetail';
import ViewerDashboardScreen from '../../../mobile/screens/ViewerDashboardClean'; // For viewer flow

// Mock API services
import { loginUser, getIncidents, acknowledgeIncident, getCameraFeeds } from '../../../mobile/services/api';
jest.mock('../../../mobile/services/api', () => ({
  loginUser: jest.fn(),
  getIncidents: jest.fn(),
  acknowledgeIncident: jest.fn(),
  getCameraFeeds: jest.fn(),
}));

// Mock Expo AV and WebView for dashboards/incident detail
jest.mock('expo-av', () => ({
  Video: 'Video', // Mock as a simple component
}));
jest.mock('react-native-webview', () => ({
  WebView: 'WebView', // Mock as a simple component
}));

// Mock Alert
jest.spyOn(require('react-native').Alert, 'alert');

const Stack = createNativeStackNavigator();

// Helper component to wrap screens with navigation and Tailwind
const AppNavigator = ({ initialRouteName = "SecurityLogin" }) => (
  <TailwindProvider utilities={utilities}>
    <NavigationContainer>
      <Stack.Navigator initialRouteName={initialRouteName}>
        <Stack.Screen name="SecurityLogin" component={SecurityLoginScreen} />
        <Stack.Screen name="SecurityDashboard" component={SecurityDashboardScreen} />
        <Stack.Screen name="ViewerDashboard" component={ViewerDashboardScreen} />
        <Stack.Screen name="IncidentDetail" component={IncidentDetailScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  </TailwindProvider>
);

describe('Incident Flow (Security User)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    require('react-native').Alert.alert.mockClear();
  });

  it('allows security user to login, view incidents, and acknowledge one', async () => {
    // 1. Mock successful login
    loginUser.mockResolvedValueOnce({ success: true, data: { access_token: 'mock_token' } });

    // 2. Mock incidents data for the dashboard
    const mockIncidents = [
      {
        id: 1,
        type: 'theft',
        timestamp: new Date().toISOString(),
        location: 'Store A',
        description: 'Shoplifting detected',
        status: 'pending',
        evidence: [{ url: 'http://example.com/img1.jpg', hash: 'hash1', blockchain_tx_id: null }],
      },
      {
        id: 2,
        type: 'abuse',
        timestamp: new Date().toISOString(),
        location: 'Playground',
        description: 'Abuse detected',
        status: 'pending',
        evidence: [],
      },
    ];
    getIncidents.mockResolvedValue({ success: true, data: mockIncidents });
    getCameraFeeds.mockResolvedValue({ success: true, data: [] }); // No camera feeds for this test

    // 3. Mock successful incident acknowledgment
    acknowledgeIncident.mockResolvedValueOnce({ success: true, message: 'Incident acknowledged successfully' });

    const { getByPlaceholderText, getByText, findByText, queryByText } = render(<AppNavigator />);

    // --- Login as Security ---
    fireEvent.changeText(getByPlaceholderText('Email'), 'security@example.com');
    fireEvent.changeText(getByPlaceholderText('Password'), 'password123');
    fireEvent.press(getByText('Login'));

    await waitFor(() => {
      expect(loginUser).toHaveBeenCalledWith('security@example.com', 'password123', 'security');
      expect(require('react-native').Alert.alert).toHaveBeenCalledWith('Success', 'Logged in as Security.');
    });

    // --- Verify Dashboard and navigate to Incident Detail ---
    await findByText('Recent Incidents'); // Wait for dashboard to load
    expect(getByText('Incident ID: 1')).toBeTruthy();
    expect(getByText('Type: theft')).toBeTruthy();
    expect(getByText('Status: pending')).toBeTruthy();

    fireEvent.press(getByText('Incident ID: 1')); // Tap on the first incident

    await findByText('Incident Details'); // Wait for incident detail screen to load
    expect(getByText('Incident ID: 1')).toBeTruthy();
    expect(getByText('Type: theft')).toBeTruthy();
    expect(getByText('Status: pending')).toBeTruthy();
    expect(getByText('Acknowledge Incident')).toBeTruthy();

    // --- Acknowledge Incident ---
    fireEvent.press(getByText('Acknowledge Incident'));

    await waitFor(() => {
      expect(acknowledgeIncident).toHaveBeenCalledWith(1);
      expect(require('react-native').Alert.alert).toHaveBeenCalledWith('Success', 'Incident acknowledged successfully.');
    });

    // Verify the status on the detail screen updates
    await findByText('Status: acknowledged');
    expect(queryByText('Acknowledge Incident')).toBeNull(); // Button should disappear
  });

  it('handles failed incident acknowledgment', async () => {
    loginUser.mockResolvedValueOnce({ success: true, data: { access_token: 'mock_token' } });
    const mockIncidents = [
      {
        id: 3,
        type: 'accident',
        timestamp: new Date().toISOString(),
        location: 'Road',
        description: 'Car accident',
        status: 'pending',
        evidence: [],
      },
    ];
    getIncidents.mockResolvedValue({ success: true, data: mockIncidents });
    getCameraFeeds.mockResolvedValue({ success: true, data: [] });
    acknowledgeIncident.mockResolvedValueOnce({ success: false, message: 'Failed to update' });

    const { getByPlaceholderText, getByText, findByText } = render(<AppNavigator />);

    // Login
    fireEvent.changeText(getByPlaceholderText('Email'), 'security@example.com');
    fireEvent.changeText(getByPlaceholderText('Password'), 'password123');
    fireEvent.press(getByText('Login'));
    await findByText('Recent Incidents');

    // Navigate to incident detail
    fireEvent.press(getByText('Incident ID: 3'));
    await findByText('Incident Details');

    // Attempt to acknowledge
    fireEvent.press(getByText('Acknowledge Incident'));

    await waitFor(() => {
      expect(acknowledgeIncident).toHaveBeenCalledWith(3);
      expect(require('react-native').Alert.alert).toHaveBeenCalledWith('Error', 'Failed to update');
    });

    // Status should remain pending
    expect(getByText('Status: pending')).toBeTruthy();
    expect(getByText('Acknowledge Incident')).toBeTruthy(); // Button should still be there
  });

  it('viewer user can login and view incidents but cannot acknowledge', async () => {
    loginUser.mockResolvedValueOnce({ success: true, data: { access_token: 'mock_token' } });
    const mockIncidents = [
      {
        id: 4,
        type: 'abuse',
        timestamp: new Date().toISOString(),
        location: 'School',
        description: 'Bullying incident',
        status: 'pending',
        evidence: [],
      },
    ];
    getIncidents.mockResolvedValue({ success: true, data: mockIncidents });
    getCameraFeeds.mockResolvedValue({ success: true, data: [] });

    const { getByPlaceholderText, getByText, findByText, queryByText } = render(<AppNavigator initialRouteName="ViewerLogin" />);

    // Login as Viewer
    fireEvent.changeText(getByPlaceholderText('Email'), 'viewer@example.com');
    fireEvent.changeText(getByPlaceholderText('Password'), 'viewerpass');
    fireEvent.press(getByText('Login'));
    await waitFor(() => {
      expect(loginUser).toHaveBeenCalledWith('viewer@example.com', 'viewerpass', 'viewer');
    });

    // Verify Viewer Dashboard
    await findByText('Recent Incidents');
    expect(getByText('Incident ID: 4')).toBeTruthy();

    // Navigate to Incident Detail
    fireEvent.press(getByText('Incident ID: 4'));
    await findByText('Incident Details');

    // Verify no Acknowledge button for Viewer
    expect(queryByText('Acknowledge Incident')).toBeNull();
    expect(getByText('Status: pending')).toBeTruthy();
  });

  it('displays camera feeds on dashboard', async () => {
    loginUser.mockResolvedValueOnce({ success: true, data: { access_token: 'mock_token' } });
    getIncidents.mockResolvedValue({ success: true, data: [] });
    const mockCameraFeeds = [
      { id: 101, name: 'Front Gate', streamUrl: 'http://mock.stream/frontgate.m3u8' },
      { id: 102, name: 'Backyard', streamUrl: 'http://mock.stream/backyard.mjpeg' },
    ];
    getCameraFeeds.mockResolvedValue({ success: true, data: mockCameraFeeds });

    const { getByPlaceholderText, getByText, findByText } = render(<AppNavigator />);

    // Login
    fireEvent.changeText(getByPlaceholderText('Email'), 'security@example.com');
    fireEvent.changeText(getByPlaceholderText('Password'), 'password123');
    fireEvent.press(getByText('Login'));
    await findByText('Live Camera Feeds');

    expect(getByText('Front Gate')).toBeTruthy();
    expect(getByText('Backyard')).toBeTruthy();
    // Further checks would involve snapshot testing of the Video/WebView components if they were more complex
  });
});
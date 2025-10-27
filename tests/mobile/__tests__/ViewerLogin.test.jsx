// tests/mobile/__tests__/ViewerLogin.test.jsx
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import ViewerLoginScreen from '../../../mobile/screens/ViewerLogin';
import { loginUser } from '../../../mobile/services/api';
import { TailwindProvider } from 'tailwind-rn';
import utilities from '../../../mobile/tailwind.json'; // Mock this if not generated

// Mock the API service
jest.mock('../../../mobile/services/api', () => ({
  loginUser: jest.fn(),
}));

// Mock navigation
const mockNavigate = jest.fn();
const mockReplace = jest.fn();
const mockNavigation = {
  navigate: mockNavigate,
  replace: mockReplace,
};

// Mock Alert
jest.spyOn(require('react-native').Alert, 'alert');

describe('ViewerLoginScreen', () => {
  beforeEach(() => {
    loginUser.mockClear();
    mockNavigate.mockClear();
    mockReplace.mockClear();
    require('react-native').Alert.alert.mockClear();
  });

  it('renders correctly with all elements', () => {
    const { getByPlaceholderText, getByText } = render(
      <TailwindProvider utilities={utilities}>
        <ViewerLoginScreen navigation={mockNavigation} />
      </TailwindProvider>
    );

    expect(getByText('Viewer Login')).toBeTruthy();
    expect(getByPlaceholderText('Email')).toBeTruthy();
    expect(getByPlaceholderText('Password')).toBeTruthy();
    expect(getByText('Login')).toBeTruthy();
    expect(getByText("Don't have an account? Register")).toBeTruthy();
  });

  it('handles successful login and navigates to ViewerDashboard', async () => {
    loginUser.mockResolvedValueOnce({ success: true, data: { access_token: 'mock_token' } });

    const { getByPlaceholderText, getByText } = render(
      <TailwindProvider utilities={utilities}>
        <ViewerLoginScreen navigation={mockNavigation} />
      </TailwindProvider>
    );

    fireEvent.changeText(getByPlaceholderText('Email'), 'viewer@example.com');
    fireEvent.changeText(getByPlaceholderText('Password'), 'password123');
    fireEvent.press(getByText('Login'));

    await waitFor(() => {
      expect(loginUser).toHaveBeenCalledWith('viewer@example.com', 'password123', 'viewer');
      expect(require('react-native').Alert.alert).toHaveBeenCalledWith('Success', 'Logged in as Viewer.');
      expect(mockReplace).toHaveBeenCalledWith('ViewerDashboard');
    });
  });

  it('handles failed login and shows an alert', async () => {
    loginUser.mockResolvedValueOnce({ success: false, message: 'Invalid viewer credentials' });

    const { getByPlaceholderText, getByText } = render(
      <TailwindProvider utilities={utilities}>
        <ViewerLoginScreen navigation={mockNavigation} />
      </TailwindProvider>
    );

    fireEvent.changeText(getByPlaceholderText('Email'), 'wrong@example.com');
    fireEvent.changeText(getByPlaceholderText('Password'), 'wrongpass');
    fireEvent.press(getByText('Login'));

    await waitFor(() => {
      expect(loginUser).toHaveBeenCalledWith('wrong@example.com', 'wrongpass', 'viewer');
      expect(require('react-native').Alert.alert).toHaveBeenCalledWith('Login Failed', 'Invalid viewer credentials');
      expect(mockReplace).not.toHaveBeenCalled();
    });
  });

  it('navigates to Registration screen when "Register" is pressed', () => {
    const { getByText } = render(
      <TailwindProvider utilities={utilities}>
        <ViewerLoginScreen navigation={mockNavigation} />
      </TailwindProvider>
    );

    fireEvent.press(getByText("Don't have an account? Register"));
    expect(mockNavigate).toHaveBeenCalledWith('Registration');
  });
});
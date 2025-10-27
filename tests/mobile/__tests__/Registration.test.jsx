// tests/mobile/__tests__/Registration.test.jsx
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import RegistrationScreen from '../../../mobile/screens/Registration';
import { registerUser } from '../../../mobile/services/api';
import { TailwindProvider } from 'tailwind-rn';
import utilities from '../../../mobile/tailwind.json'; // Mock this if not generated

// Mock the API service
jest.mock('../../../mobile/services/api', () => ({
  registerUser: jest.fn(),
}));

// Mock navigation
const mockNavigate = jest.fn();
const mockNavigation = {
  navigate: mockNavigate,
};

// Mock Alert
jest.spyOn(require('react-native').Alert, 'alert');

describe('RegistrationScreen', () => {
  beforeEach(() => {
    registerUser.mockClear();
    mockNavigate.mockClear();
    require('react-native').Alert.alert.mockClear();
  });

  it('renders correctly with default viewer role selected', () => {
    const { getByPlaceholderText, getByText } = render(
      <TailwindProvider utilities={utilities}>
        <RegistrationScreen navigation={mockNavigation} />
      </TailwindProvider>
    );

    expect(getByText('Register')).toBeTruthy();
    expect(getByPlaceholderText('Name')).toBeTruthy();
    expect(getByPlaceholderText('Email')).toBeTruthy();
    expect(getByPlaceholderText('Password')).toBeTruthy();
    expect(getByText('Select Role:')).toBeTruthy();
    expect(getByText('Viewer')).toHaveStyle({ backgroundColor: '#22c55e' }); // Check if default is selected (green-500)
    expect(getByText('Security')).toHaveStyle({ backgroundColor: '#ffffff' }); // Check if not selected (white)
  });

  it('allows selecting different roles', () => {
    const { getByText } = render(
      <TailwindProvider utilities={utilities}>
        <RegistrationScreen navigation={mockNavigation} />
      </TailwindProvider>
    );

    fireEvent.press(getByText('Security'));
    expect(getByText('Security')).toHaveStyle({ backgroundColor: '#3b82f6' }); // blue-500
    expect(getByText('Viewer')).toHaveStyle({ backgroundColor: '#ffffff' });

    fireEvent.press(getByText('Admin'));
    expect(getByText('Admin')).toHaveStyle({ backgroundColor: '#ef4444' }); // red-500
    expect(getByText('Security')).toHaveStyle({ backgroundColor: '#ffffff' });
  });

  it('handles successful registration for Security role and navigates', async () => {
    registerUser.mockResolvedValueOnce({ success: true });

    const { getByPlaceholderText, getByText } = render(
      <TailwindProvider utilities={utilities}>
        <RegistrationScreen navigation={mockNavigation} />
      </TailwindProvider>
    );

    fireEvent.changeText(getByPlaceholderText('Name'), 'New Security');
    fireEvent.changeText(getByPlaceholderText('Email'), 'new_security@example.com');
    fireEvent.changeText(getByPlaceholderText('Password'), 'newpassword');
    fireEvent.press(getByText('Security')); // Select Security role
    fireEvent.press(getByText('Register'));

    await waitFor(() => {
      expect(registerUser).toHaveBeenCalledWith('New Security', 'new_security@example.com', 'newpassword', 'security');
      expect(require('react-native').Alert.alert).toHaveBeenCalledWith('Success', 'Registration successful! Please log in.');
      expect(mockNavigate).toHaveBeenCalledWith('SecurityLogin');
    });
  });

  it('handles successful registration for Viewer role and navigates', async () => {
    registerUser.mockResolvedValueOnce({ success: true });

    const { getByPlaceholderText, getByText } = render(
      <TailwindProvider utilities={utilities}>
        <RegistrationScreen navigation={mockNavigation} />
      </TailwindProvider>
    );

    fireEvent.changeText(getByPlaceholderText('Name'), 'New Viewer');
    fireEvent.changeText(getByPlaceholderText('Email'), 'new_viewer@example.com');
    fireEvent.changeText(getByPlaceholderText('Password'), 'newpassword');
    // Viewer is default, no need to press
    fireEvent.press(getByText('Register'));

    await waitFor(() => {
      expect(registerUser).toHaveBeenCalledWith('New Viewer', 'new_viewer@example.com', 'newpassword', 'viewer');
      expect(require('react-native').Alert.alert).toHaveBeenCalledWith('Success', 'Registration successful! Please log in.');
      expect(mockNavigate).toHaveBeenCalledWith('ViewerLogin');
    });
  });

  it('handles successful registration for Admin role and navigates', async () => {
    registerUser.mockResolvedValueOnce({ success: true });

    const { getByPlaceholderText, getByText } = render(
      <TailwindProvider utilities={utilities}>
        <RegistrationScreen navigation={mockNavigation} />
      </TailwindProvider>
    );

    fireEvent.changeText(getByPlaceholderText('Name'), 'New Admin');
    fireEvent.changeText(getByPlaceholderText('Email'), 'new_admin@example.com');
    fireEvent.changeText(getByPlaceholderText('Password'), 'newpassword');
    fireEvent.press(getByText('Admin')); // Select Admin role
    fireEvent.press(getByText('Register'));

    await waitFor(() => {
      expect(registerUser).toHaveBeenCalledWith('New Admin', 'new_admin@example.com', 'newpassword', 'admin');
      expect(require('react-native').Alert.alert).toHaveBeenCalledWith('Success', 'Registration successful! Please log in.');
      expect(mockNavigate).toHaveBeenCalledWith('AdminLogin');
    });
  });

  it('handles failed registration and shows an alert', async () => {
    registerUser.mockResolvedValueOnce({ success: false, message: 'Email already in use' });

    const { getByPlaceholderText, getByText } = render(
      <TailwindProvider utilities={utilities}>
        <RegistrationScreen navigation={mockNavigation} />
      </TailwindProvider>
    );

    fireEvent.changeText(getByPlaceholderText('Name'), 'Fail User');
    fireEvent.changeText(getByPlaceholderText('Email'), 'fail@example.com');
    fireEvent.changeText(getByPlaceholderText('Password'), 'failpass');
    fireEvent.press(getByText('Register'));

    await waitFor(() => {
      expect(registerUser).toHaveBeenCalledWith('Fail User', 'fail@example.com', 'failpass', 'viewer'); // Default role
      expect(require('react-native').Alert.alert).toHaveBeenCalledWith('Registration Failed', 'Email already in use');
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  it('shows alert if fields are empty', async () => {
    const { getByText } = render(
      <TailwindProvider utilities={utilities}>
        <RegistrationScreen navigation={mockNavigation} />
      </TailwindProvider>
    );

    fireEvent.press(getByText('Register'));

    await waitFor(() => {
      expect(require('react-native').Alert.alert).toHaveBeenCalledWith('Error', 'Please fill in all fields.');
      expect(registerUser).not.toHaveBeenCalled();
    });
  });

  it('navigates to login screens from bottom links', () => {
    const { getByText } = render(
      <TailwindProvider utilities={utilities}>
        <RegistrationScreen navigation={mockNavigation} />
      </TailwindProvider>
    );

    fireEvent.press(getByText('Login as Security'));
    expect(mockNavigate).toHaveBeenCalledWith('SecurityLogin');
    mockNavigate.mockClear();

    fireEvent.press(getByText('Login as Viewer'));
    expect(mockNavigate).toHaveBeenCalledWith('ViewerLogin');
    mockNavigate.mockClear();

    fireEvent.press(getByText('Login as Admin'));
    expect(mockNavigate).toHaveBeenCalledWith('AdminLogin');
  });
});
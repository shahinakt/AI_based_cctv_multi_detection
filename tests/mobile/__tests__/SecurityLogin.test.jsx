// tests/mobile/__tests__/SecurityLogin.test.jsx
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import SecurityLoginScreen from '../../../mobile/screens/SecurityLogin';
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

describe('SecurityLoginScreen', () => {
  beforeEach(() => {
    // Reset mocks before each test
    loginUser.mockClear();
    mockNavigate.mockClear();
    mockReplace.mockClear();
    require('react-native').Alert.alert.mockClear();
  });

  it('renders correctly with all elements', () => {
    const { getByPlaceholderText, getByText } = render(
      <TailwindProvider utilities={utilities}>
        <SecurityLoginScreen navigation={mockNavigation} />
      </TailwindProvider>
    );

    expect(getByText('Security Login')).toBeTruthy();
    expect(getByPlaceholderText('Email')).toBeTruthy();
    expect(getByPlaceholderText('Password')).toBeTruthy();
    expect(getByText('Login')).toBeTruthy();
    expect(getByText("Don't have an account? Register")).toBeTruthy();
  });

  it('updates email and password input fields', () => {
    const { getByPlaceholderText } = render(
      <TailwindProvider utilities={utilities}>
        <SecurityLoginScreen navigation={mockNavigation} />
      </TailwindProvider>
    );

    const emailInput = getByPlaceholderText('Email');
    const passwordInput = getByPlaceholderText('Password');

    fireEvent.changeText(emailInput, 'test@example.com');
    fireEvent.changeText(passwordInput, 'securepass');

    expect(emailInput.props.value).toBe('test@example.com');
    expect(passwordInput.props.value).toBe('securepass');
  });

  it('handles successful login and navigates to SecurityDashboard', async () => {
    loginUser.mockResolvedValueOnce({ success: true, data: { access_token: 'mock_token' } });

    const { getByPlaceholderText, getByText } = render(
      <TailwindProvider utilities={utilities}>
        <SecurityLoginScreen navigation={mockNavigation} />
      </TailwindProvider>
    );

    fireEvent.changeText(getByPlaceholderText('Email'), 'security@example.com');
    fireEvent.changeText(getByPlaceholderText('Password'), 'password123');
    fireEvent.press(getByText('Login'));

    await waitFor(() => {
      expect(loginUser).toHaveBeenCalledWith('security@example.com', 'password123', 'security');
      expect(require('react-native').Alert.alert).toHaveBeenCalledWith('Success', 'Logged in as Security.');
      expect(mockReplace).toHaveBeenCalledWith('SecurityDashboard');
    });
  });

  it('handles failed login and shows an alert with specific message', async () => {
    loginUser.mockResolvedValueOnce({ success: false, message: 'Invalid credentials provided' });

    const { getByPlaceholderText, getByText } = render(
      <TailwindProvider utilities={utilities}>
        <SecurityLoginScreen navigation={mockNavigation} />
      </TailwindProvider>
    );

    fireEvent.changeText(getByPlaceholderText('Email'), 'wrong@example.com');
    fireEvent.changeText(getByPlaceholderText('Password'), 'wrongpass');
    fireEvent.press(getByText('Login'));

    await waitFor(() => {
      expect(loginUser).toHaveBeenCalledWith('wrong@example.com', 'wrongpass', 'security');
      expect(require('react-native').Alert.alert).toHaveBeenCalledWith('Login Failed', 'Invalid credentials provided');
      expect(mockReplace).not.toHaveBeenCalled();
    });
  });

  it('handles network error during login', async () => {
    loginUser.mockRejectedValueOnce(new Error('Network Error'));

    const { getByPlaceholderText, getByText } = render(
      <TailwindProvider utilities={utilities}>
        <SecurityLoginScreen navigation={mockNavigation} />
      </TailwindProvider>
    );

    fireEvent.changeText(getByPlaceholderText('Email'), 'network@example.com');
    fireEvent.changeText(getByPlaceholderText('Password'), 'password');
    fireEvent.press(getByText('Login'));

    await waitFor(() => {
      expect(loginUser).toHaveBeenCalledWith('network@example.com', 'password', 'security');
      expect(require('react-native').Alert.alert).toHaveBeenCalledWith('Error', 'An error occurred during login.');
      expect(mockReplace).not.toHaveBeenCalled();
    });
  });

  it('navigates to Registration screen when "Register" link is pressed', () => {
    const { getByText } = render(
      <TailwindProvider utilities={utilities}>
        <SecurityLoginScreen navigation={mockNavigation} />
      </TailwindProvider>
    );

    fireEvent.press(getByText("Don't have an account? Register"));
    expect(mockNavigate).toHaveBeenCalledWith('Registration');
  });
});
// tests/frontend/__tests__/Login.test.jsx
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import Login from '../../../frontend/src/components/Login'; // Assuming this path
import { loginUser } from '../../../frontend/src/services/api'; // Assuming this path

// Mock the API service
jest.mock('../../../frontend/src/services/api', () => ({
  loginUser: jest.fn(),
}));

// Mock react-router-dom's useNavigate hook
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'), // Use actual for other exports
  useNavigate: () => mockNavigate,
}));

describe('Login Component (Frontend)', () => {
  beforeEach(() => {
    loginUser.mockClear();
    mockNavigate.mockClear();
  });

  it('renders login form correctly with all elements', () => {
    render(<Login />);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /login/i })).toBeInTheDocument();
    expect(screen.getByText(/don't have an account\? register/i)).toBeInTheDocument();
  });

  it('updates email and password input fields', () => {
    render(<Login />);
    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/password/i);

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'securepass' } });

    expect(emailInput.value).toBe('test@example.com');
    expect(passwordInput.value).toBe('securepass');
  });

  it('handles successful login and redirects to dashboard', async () => {
    loginUser.mockResolvedValueOnce({ success: true, token: 'mock_jwt' });
    render(<Login />);

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /login/i }));

    await waitFor(() => {
      expect(loginUser).toHaveBeenCalledWith('test@example.com', 'password123');
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard'); // Assuming dashboard route
    });
  });

  it('displays error message on failed login', async () => {
    loginUser.mockResolvedValueOnce({ success: false, message: 'Invalid credentials' });
    render(<Login />);

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'wrong@example.com' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'wrongpass' } });
    fireEvent.click(screen.getByRole('button', { name: /login/i }));

    await waitFor(() => {
      expect(screen.getByText(/invalid credentials/i)).toBeInTheDocument();
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  it('handles network error during login', async () => {
    loginUser.mockRejectedValueOnce(new Error('Network Error'));
    render(<Login />);

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'network@example.com' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'password' } });
    fireEvent.click(screen.getByRole('button', { name: /login/i }));

    await waitFor(() => {
      expect(screen.getByText(/an error occurred during login/i)).toBeInTheDocument(); // Assuming generic error message
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  it('navigates to registration page when link is clicked', () => {
    render(<Login />);
    fireEvent.click(screen.getByText(/don't have an account\? register/i));
    expect(mockNavigate).toHaveBeenCalledWith('/register'); // Assuming registration route
  });
});
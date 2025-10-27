// tests/frontend/__tests__/ApiService.test.js
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import AsyncStorage from '@react-native-async-storage/async-storage'; // Mock for web if needed, or use local storage mock
import { loginUser, getIncidents, acknowledgeIncident, registerUser } from '../../../frontend/src/services/api'; // Assuming this path

// Mock axios
const mock = new MockAdapter(axios);

// Mock AsyncStorage for web environment (if not using actual localStorage)
// For web, you'd typically use localStorage directly or a mock for it.
// For consistency with mobile, we'll mock AsyncStorage here.
jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(() => Promise.resolve()),
  getItem: jest.fn(() => Promise.resolve(null)),
  removeItem: jest.fn(() => Promise.resolve()),
}));

const API_BASE_URL = 'http://localhost:8000'; // Must match the base URL in api.js

describe('API Service', () => {
  beforeEach(() => {
    mock.reset(); // Reset mock adapter before each test
    AsyncStorage.setItem.mockClear();
    AsyncStorage.getItem.mockClear();
    AsyncStorage.removeItem.mockClear();
  });

  // --- Test Authentication Endpoints ---
  it('loginUser sends correct request and stores token', async () => {
    const mockToken = 'mock_jwt_token';
    mock.onPost(`${API_BASE_URL}/login`).reply(200, { access_token: mockToken, token_type: 'bearer' });

    const response = await loginUser('test@example.com', 'password123', 'security');

    expect(response.success).toBe(true);
    expect(response.data.access_token).toBe(mockToken);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('userToken', mockToken);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('userRole', 'security');
  });

  it('loginUser handles API error', async () => {
    mock.onPost(`${API_BASE_URL}/login`).reply(401, { detail: 'Invalid credentials' });

    const response = await loginUser('wrong@example.com', 'wrongpass', 'viewer');

    expect(response.success).toBe(false);
    expect(response.message).toBe('Invalid credentials');
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it('registerUser sends correct request', async () => {
    mock.onPost(`${API_BASE_URL}/register`).reply(200, { message: 'User registered successfully', id: 1, email: 'new@example.com' });

    const response = await registerUser('New User', 'new@example.com', 'password123', 'admin');

    expect(response.success).toBe(true);
    expect(response.data.message).toBe('User registered successfully');
  });

  it('registerUser handles API error', async () => {
    mock.onPost(`${API_BASE_URL}/register`).reply(400, { detail: 'Email already exists' });

    const response = await registerUser('Duplicate User', 'duplicate@example.com', 'password123', 'viewer');

    expect(response.success).toBe(false);
    expect(response.message).toBe('Email already exists');
  });

  // --- Test Authenticated Endpoints ---
  it('getIncidents sends authenticated request and returns data', async () => {
    const mockToken = 'auth_token_123';
    AsyncStorage.getItem.mockResolvedValueOnce(mockToken); // Mock token retrieval
    const mockIncidents = [{ id: 1, type: 'theft' }];
    mock.onGet(`${API_BASE_URL}/incidents`).reply(200, mockIncidents);

    const response = await getIncidents();

    expect(response.success).toBe(true);
    expect(response.data).toEqual(mockIncidents);
    expect(mock.history.get[0].headers.Authorization).toBe(`Bearer ${mockToken}`);
  });

  it('getIncidents handles API error', async () => {
    const mockToken = 'auth_token_123';
    AsyncStorage.getItem.mockResolvedValueOnce(mockToken);
    mock.onGet(`${API_BASE_URL}/incidents`).reply(500, { detail: 'Server error' });

    const response = await getIncidents();

    expect(response.success).toBe(false);
    expect(response.message).toBe('Server error');
  });

  it('acknowledgeIncident sends authenticated request', async () => {
    const mockToken = 'auth_token_456';
    AsyncStorage.getItem.mockResolvedValueOnce(mockToken);
    mock.onPost(`${API_BASE_URL}/incidents/1/acknowledge`).reply(200, { message: 'Acknowledged' });

    const response = await acknowledgeIncident(1);

    expect(response.success).toBe(true);
    expect(response.data.message).toBe('Acknowledged');
    expect(mock.history.post[0].headers.Authorization).toBe(`Bearer ${mockToken}`);
  });

  it('acknowledgeIncident handles API error', async () => {
    const mockToken = 'auth_token_456';
    AsyncStorage.getItem.mockResolvedValueOnce(mockToken);
    mock.onPost(`${API_BASE_URL}/incidents/1/acknowledge`).reply(403, { detail: 'Forbidden' });

    const response = await acknowledgeIncident(1);

    expect(response.success).toBe(false);
    expect(response.message).toBe('Forbidden');
  });

  it('getIncidents handles unauthenticated request (no token)', async () => {
    AsyncStorage.getItem.mockResolvedValueOnce(null); // No token
    mock.onGet(`${API_BASE_URL}/incidents`).reply(401, { detail: 'Not authenticated' });

    const response = await getIncidents();

    expect(response.success).toBe(false);
    expect(response.message).toBe('Not authenticated');
  });
});

import axios from 'axios';


const Storage = {
  getItem: (k) => Promise.resolve(localStorage.getItem(k)),
  setItem: (k, v) => Promise.resolve(localStorage.setItem(k, v)),
  removeItem: (k) => Promise.resolve(localStorage.removeItem(k)),
};


const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});


api.interceptors.request.use(
  async (config) => {
    const token = await Storage.getItem('userToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

export const registerUser = async (name, email, password, role) => {
  try {
    const response = await api.post('/register', { name, email, password, role });
    return { success: true, data: response.data };
  } catch (error) {
    console.error('Registration API error:', error.response?.data || error.message);
    return { success: false, message: error.response?.data?.detail || 'Registration failed.' };
  }
};

export const loginUser = async (email, password, role) => {
  try {
    const response = await api.post('/login', { email, password, role });
    if (response.data && response.data.access_token) {
      await Storage.setItem('userToken', response.data.access_token);
      await Storage.setItem('userRole', role); // Store role for routing
      return { success: true, data: response.data };
    }
    return { success: false, message: 'No token received.' };
  } catch (error) {
    console.error('Login API error:', error.response?.data || error.message);
    return { success: false, message: error.response?.data?.detail || 'Login failed.' };
  }
};

export const getIncidents = async () => {
  try {
    const response = await api.get('/incidents');
    return { success: true, data: response.data };
  } catch (error) {
    console.error('Get incidents API error:', error.response?.data || error.message);
    return { success: false, message: error.response?.data?.detail || 'Failed to fetch incidents.' };
  }
};

export const getIncidentDetails = async (incidentId) => {
  try {
    const response = await api.get(`/incidents/${incidentId}`);
    return { success: true, data: response.data };
  } catch (error) {
    console.error(`Get incident ${incidentId} details API error:`, error.response?.data || error.message);
    return { success: false, message: error.response?.data?.detail || 'Failed to fetch incident details.' };
  }
};

export const acknowledgeIncident = async (incidentId) => {
  try {
    const response = await api.post(`/incidents/${incidentId}/acknowledge`);
    return { success: true, data: response.data };
  } catch (error) {
    console.error(`Acknowledge incident ${incidentId} API error:`, error.response?.data || error.message);
    return { success: false, message: error.response?.data?.detail || 'Failed to acknowledge incident.' };
  }
};

export const getCameraFeeds = async () => {
  try {
    const response = await api.get('/camera-feeds');
    return { success: true, data: response.data };
  } catch (error) {
    console.error('Get camera feeds API error:', error.response?.data || error.message);
    return { success: false, message: error.response?.data?.detail || 'Failed to fetch camera feeds.' };
  }
};

export default api;
export { api };
// services/api.js
// Minimal API helper for mobile app. Adjust BASE_URL if your backend runs elsewhere.
const BASE_URL = "http://localhost:8000";

export async function registerUser(name, email, password, role = 'viewer') {
  try {
    const payload = {
      username: name,
      email,
      password,
      role,
    };

    const res = await fetch(`${BASE_URL}/api/v1/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) {
      return { success: false, message: data.detail || data.msg || 'Registration failed' };
    }
    return { success: true, data };
  } catch (error) {
    console.error('registerUser error:', error);
    return { success: false, message: error.message || 'Network error' };
  }
}

// Add other API helpers here as needed (login, fetch incidents, etc.)

export async function loginUser(usernameOrEmail, password, role = 'viewer') {
  try {
    const formBody = new URLSearchParams();
    formBody.append('username', usernameOrEmail);
    formBody.append('password', password);

    const res = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formBody.toString(),
    });

    const data = await res.json();
    if (!res.ok) {
      return { success: false, message: data.detail || data.msg || 'Login failed' };
    }

    // store token in localStorage if available (web) or AsyncStorage in RN if needed
    try {
      if (typeof localStorage !== 'undefined' && data.access_token) {
        localStorage.setItem('userToken', data.access_token);
      }
    } catch (err) {
      // ignore storage errors in environments without localStorage
    }

    return { success: true, data };
  } catch (error) {
    console.error('loginUser error:', error);
    return { success: false, message: error.message || 'Network error' };
  }
}

export async function getIncidents() {
  try {
    const res = await fetch(`${BASE_URL}/api/v1/incidents`, { method: 'GET' });
    const data = await res.json();
    if (!res.ok) return { success: false, message: data.detail || 'Failed to load incidents' };
    return { success: true, data };
  } catch (error) {
    console.error('getIncidents error:', error);
    return { success: false, message: error.message || 'Network error' };
  }
}

export async function acknowledgeIncident(id) {
  return acknowledgeIncidentWithStatus(id, true);
}

export async function acknowledgeIncidentWithStatus(id, acknowledged = true) {
  try {
    const url = `${BASE_URL}/api/v1/incidents/${id}/acknowledge?acknowledged=${acknowledged}`;
    const res = await fetch(url, { method: 'PUT' });
    const data = await res.json();
    if (!res.ok) return { success: false, message: data.detail || 'Failed to acknowledge' };
    return { success: true, data };
  } catch (error) {
    console.error('acknowledgeIncident error:', error);
    return { success: false, message: error.message || 'Network error' };
  }
}

export async function getCameraFeeds() {
  try {
    const res = await fetch(`${BASE_URL}/api/v1/cameras/`, { method: 'GET' });
    const data = await res.json();
    if (!res.ok) return { success: false, message: data.detail || 'Failed to fetch cameras' };
    return { success: true, data };
  } catch (error) {
    console.error('getCameraFeeds error:', error);
    return { success: false, message: error.message || 'Network error' };
  }
}

export async function createIncident(payload) {
  try {
    const res = await fetch(`${BASE_URL}/api/v1/incidents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) return { success: false, message: data.detail || 'Failed to create incident' };
    return { success: true, data };
  } catch (error) {
    console.error('createIncident error:', error);
    return { success: false, message: error.message || 'Network error' };
  }
}

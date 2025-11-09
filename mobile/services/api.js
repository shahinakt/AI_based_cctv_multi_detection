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

// services/api.js
// Minimal API helper for mobile app.
// Compute a BASE_URL that works for emulators and physical devices when possible.
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Compute a robust BASE_URL for emulators/devices. Preference order:
// 1) expo config extra.EXPO_BASE_URL
// 2) manifest / manifest2 debuggerHost (derive IP)
// 3) process.env.EXPO_BASE_URL
// 4) sensible platform fallback (10.0.2.2 for Android emulator, localhost for iOS/sim/web)
let BASE_URL = '';
try {
  const expoConfig = Constants.expoConfig || Constants.manifest || null;
  const extra = expoConfig && expoConfig.extra ? expoConfig.extra : (Constants.manifest && Constants.manifest.extra) || null;
  if (extra && extra.EXPO_BASE_URL) {
    BASE_URL = extra.EXPO_BASE_URL;
  }

  // Try manifest debugger host (Expo Go / dev client)
  if (!BASE_URL) {
    const manifest = Constants.manifest || (Constants.expoConfig && Constants.expoConfig.extra) || null;
    const debuggerHost = (manifest && (manifest.debuggerHost || manifest.hostUri)) || null;
    if (debuggerHost) {
      const ip = debuggerHost.split(':')[0];
      BASE_URL = `http://${ip}:8000`;
    } else if (Constants.manifest2 && Constants.manifest2.debuggerHost) {
      const ip = Constants.manifest2.debuggerHost.split(':')[0];
      BASE_URL = `http://${ip}:8000`;
    }
  }
} catch (err) {
  // ignore and fall back to defaults
}

if (!BASE_URL) {
  // env override
  BASE_URL = typeof process !== 'undefined' && process.env && process.env.EXPO_BASE_URL
    ? process.env.EXPO_BASE_URL
    : (Platform.OS === 'android' ? 'http://10.0.2.2:8000' : 'http://localhost:8000');
}

// Additional heuristic: try to extract an IP from any manifest fields if present.
function findIpInConstants() {
  try {
    const dump = JSON.stringify(Constants);
    const m = dump.match(/(\d{1,3}(?:\.\d{1,3}){3})(:\d{2,5})?/);
    if (m && m[1]) return m[1];
  } catch (e) {
    // ignore
  }
  return null;
}

if (BASE_URL && BASE_URL.indexOf('localhost') !== -1 && Platform.OS === 'android') {
  // On Android emulators 'localhost' is not reachable from the device.
  // Prefer 10.0.2.2 by default, but if manifest contains an IP, prefer that.
  const manifestIp = findIpInConstants();
  if (manifestIp) {
    BASE_URL = `http://${manifestIp}:8000`;
  }
}

console.log('[mobile/services/api] Using BASE_URL =', BASE_URL);

function niceMessageFromResponse(data) {
  if (!data) return 'Request failed';
  if (typeof data === 'string') return data;
  if (data.detail) {
    if (Array.isArray(data.detail)) {
      try {
        return data.detail.map(d => (d.msg ? `${d.loc?.join?.('.') || ''}: ${d.msg}` : JSON.stringify(d))).join('; ');
      } catch (e) {
        return JSON.stringify(data.detail);
      }
    }
    return data.detail;
  }
  if (data.msg) return data.msg;
  if (data.message) return data.message;
  return JSON.stringify(data);
}

export function getDebugInfo() {
  return {
    BASE_URL,
    manifest: {
      appOwnership: Constants.appOwnership,
      manifest: !!Constants.manifest,
      manifest2: !!Constants.manifest2,
      expoConfig: !!Constants.expoConfig,
    },
  };
}

// Allow runtime override (useful when testing on a physical device).
const OVERRIDE_KEY = 'OVERRIDE_BASE_URL';

export async function setOverrideBaseUrl(url) {
  if (!url) {
    await AsyncStorage.removeItem(OVERRIDE_KEY);
    return null;
  }
  await AsyncStorage.setItem(OVERRIDE_KEY, url);
  return url;
}

async function getBaseUrl() {
  try {
    const override = await AsyncStorage.getItem(OVERRIDE_KEY);
    if (override) return override;
  } catch (e) {
    // ignore
  }
  return BASE_URL;
}

async function authHeaders() {
  try {
    const token = await AsyncStorage.getItem('userToken');
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch (e) {
    return {};
  }
}

export async function resolveBaseUrl() {
  return await getBaseUrl();
}

export async function registerUser(name, email, password, role = 'viewer') {
  try {
    const payload = {
      username: name,
      email,
      password,
      role,
    };

    console.debug('[mobile/services/api] registerUser payload:', payload);

    const base = await getBaseUrl();
    const res = await fetch(`${base}/api/v1/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    let data;
    try {
      data = await res.json();
    } catch (e) {
      data = null;
    }
    console.debug('[mobile/services/api] registerUser response:', res.status, data);
    if (!res.ok) {
      return { success: false, message: niceMessageFromResponse(data), data };
    }
    return { success: true, data, message: niceMessageFromResponse(data) };
  } catch (error) {
    console.error('registerUser error; BASE_URL=', BASE_URL, error);
    const suggestion = Platform.OS === 'android'
      ? 'If running on a physical device or Expo Go, set EXPO_BASE_URL to http://<YOUR_PC_IP>:8000'
      : 'Ensure backend is running and accessible (http://localhost:8000)';
    const msg = `${error.message || 'Network error'} (base: ${BASE_URL}). ${suggestion}`;
    return { success: false, message: msg };
  }
}

// Register a device push token for the authenticated user
export async function registerPushToken(expoPushToken, authToken) {
  try {
    if (!expoPushToken) return { success: false, message: 'No push token provided' };

    // NOTE: backend users endpoints are namespaced under /api/v1
    const base = await getBaseUrl();
    const res = await fetch(`${base}/api/v1/users/register-push-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: JSON.stringify({ expo_push_token: expoPushToken }),
    });

    const data = await res.json();
    if (!res.ok) return { success: false, message: niceMessageFromResponse(data) };
    return { success: true, data };
  } catch (error) {
    console.error('registerPushToken error; BASE_URL=', BASE_URL, error);
    return { success: false, message: `${error.message || 'Network error'} (base: ${BASE_URL})` };
  }
}

// Add other API helpers here as needed (login, fetch incidents, etc.)

export async function loginUser(usernameOrEmail, password, role = 'viewer') {
  try {
    // Build application/x-www-form-urlencoded body in a way that works
    // across React Native environments (URLSearchParams may not be available).
    const encode = (s) => encodeURIComponent(s);
    const formBodyString = `username=${encode(usernameOrEmail)}&password=${encode(password)}`;

    console.debug('[mobile/services/api] loginUser form:', { username: usernameOrEmail });

    const base = await getBaseUrl();
    const res = await fetch(`${base}/api/v1/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: formBodyString,
    });

    let data;
    try {
      data = await res.json();
    } catch (e) {
      data = null;
    }
    console.debug('[mobile/services/api] loginUser response:', res.status, data);
    if (!res.ok) {
      return { success: false, message: niceMessageFromResponse(data), data };
    }

    // Persist token for React Native flows
    try {
      if (data && data.access_token) {
        await AsyncStorage.setItem('userToken', data.access_token);
      }
    } catch (err) {
      console.warn('Failed to persist user token to AsyncStorage', err);
    }

    return { success: true, data, message: niceMessageFromResponse(data) };
  } catch (error) {
    console.error('loginUser error; BASE_URL=', BASE_URL, error);
    return { success: false, message: `${error.message || 'Network error'} (base: ${BASE_URL})` };
  }
}

export async function getIncidents() {
  try {
    const base = await getBaseUrl();
    const headers = await authHeaders();
    const res = await fetch(`${base}/api/v1/incidents`, { method: 'GET', headers: { ...(headers || {}) } });
    const data = await res.json();
    if (!res.ok) return { success: false, message: data.detail || 'Failed to load incidents' };
    return { success: true, data };
  } catch (error) {
    console.error('getIncidents error; BASE_URL=', BASE_URL, error);
    return { success: false, message: `${error.message || 'Network error'} (base: ${BASE_URL})` };
  }
}

export async function acknowledgeIncident(id) {
  return acknowledgeIncidentWithStatus(id, true);
}

export async function acknowledgeIncidentWithStatus(id, acknowledged = true) {
  try {
    const base = await getBaseUrl();
    const url = `${base}/api/v1/incidents/${id}/acknowledge?acknowledged=${acknowledged}`;
    const res = await fetch(url, { method: 'PUT' });
    const data = await res.json();
    if (!res.ok) return { success: false, message: data.detail || 'Failed to acknowledge' };
    return { success: true, data };
  } catch (error) {
    console.error('acknowledgeIncident error; BASE_URL=', BASE_URL, error);
    return { success: false, message: `${error.message || 'Network error'} (base: ${BASE_URL})` };
  }
}

export async function grantAccessToIncident(id, role = 'security') {
  try {
    const base = await getBaseUrl();
    const url = `${base}/api/v1/incidents/${id}/grant-access`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    });
    let data;
    try {
      data = await res.json();
    } catch (e) {
      data = null;
    }
    if (!res.ok) return { success: false, message: niceMessageFromResponse(data), data };
    return { success: true, data };
  } catch (error) {
    console.error('grantAccessToIncident error; BASE_URL=', BASE_URL, error);
    return { success: false, message: `${error.message || 'Network error'} (base: ${BASE_URL})` };
  }
}

export async function getCameraFeeds() {
  try {
    const base = await getBaseUrl();
    const headers = await authHeaders();
    const res = await fetch(`${base}/api/v1/cameras/`, { method: 'GET', headers: { ...(headers || {}) } });
    const data = await res.json();
    if (!res.ok) return { success: false, message: data.detail || 'Failed to fetch cameras' };
    return { success: true, data };
  } catch (error) {
    console.error('getCameraFeeds error; BASE_URL=', BASE_URL, error);
    return { success: false, message: `${error.message || 'Network error'} (base: ${BASE_URL})` };
  }
}

export async function createIncident(payload) {
  try {
    const base = await getBaseUrl();
    const res = await fetch(`${base}/api/v1/incidents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) return { success: false, message: data.detail || 'Failed to create incident' };
    return { success: true, data };
  } catch (error) {
    console.error('createIncident error; BASE_URL=', BASE_URL, error);
    return { success: false, message: `${error.message || 'Network error'} (base: ${BASE_URL})` };
  }
}

export async function getUsers() {
  try {
    const base = await getBaseUrl();
    const headers = await authHeaders();
    const res = await fetch(`${base}/api/v1/users`, { method: 'GET', headers: { ...(headers || {}) } });
    const data = await res.json();
    if (!res.ok) return { success: false, message: data.detail || 'Failed to fetch users' };
    return { success: true, data };
  } catch (error) {
    console.error('getUsers error; BASE_URL=', BASE_URL, error);
    return { success: false, message: `${error.message || 'Network error'} (base: ${BASE_URL})` };
  }
}

export async function getMe() {
  try {
    const base = await getBaseUrl();
    const headers = await authHeaders();
    const res = await fetch(`${base}/api/v1/users/me`, { method: 'GET', headers: { ...(headers || {}) } });
    const data = await res.json();
    if (!res.ok) return { success: false, message: data.detail || 'Failed to fetch user' };
    return { success: true, data };
  } catch (error) {
    console.error('getMe error; BASE_URL=', BASE_URL, error);
    return { success: false, message: `${error.message || 'Network error'} (base: ${BASE_URL})` };
  }
}

export async function updateUser(userId, payload) {
  try {
    const base = await getBaseUrl();
    const headers = await authHeaders();
    const res = await fetch(`${base}/api/v1/users/${userId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...(headers || {}) },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) return { success: false, message: data.detail || 'Failed to update user' };
    return { success: true, data };
  } catch (error) {
    console.error('updateUser error; BASE_URL=', BASE_URL, error);
    return { success: false, message: `${error.message || 'Network error'} (base: ${BASE_URL})` };
  }
}

export async function notifyIncident(incidentId, userIds) {
  try {
    const base = await getBaseUrl();
    const headers = await authHeaders();
    const res = await fetch(`${base}/api/v1/incidents/${incidentId}/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(headers || {}) },
      body: JSON.stringify({ user_ids: userIds }),
    });
    const data = await res.json();
    if (!res.ok) return { success: false, message: data.detail || 'Failed to notify users' };
    return { success: true, data };
  } catch (error) {
    console.error('notifyIncident error; BASE_URL=', BASE_URL, error);
    return { success: false, message: `${error.message || 'Network error'} (base: ${BASE_URL})` };
  }
}

// services/api.js
// Comprehensive API helper for mobile app with multi-platform support.
// Automatically detects platform and configures correct backend URLs.
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ==========================================
// BASE_URL Configuration Strategy
// ==========================================
// Priority order for determining backend URL:
// 1. EXPO_PUBLIC_API_URL from .env file (highest priority)
// 2. EXPO_BASE_URL from app.json extra config
// 3. Debugger host from Expo manifest (dev mode)
// 4. Platform-specific defaults:
//    - Web:             http://localhost:8000
//    - iOS Simulator:   http://localhost:8000
//    - Android Emulator: http://10.0.2.2:8000
//    - Physical Devices: Requires manual IP configuration
// ==========================================

let BASE_URL = '';

// Priority 1: Environment variable from .env file (EXPO_PUBLIC_API_URL)
if (typeof process !== 'undefined' && process.env && process.env.EXPO_PUBLIC_API_URL) {
  BASE_URL = process.env.EXPO_PUBLIC_API_URL;
}

// Priority 2: Expo config
if (!BASE_URL) {
  try {
    const expoConfig = Constants.expoConfig || Constants.manifest || null;
    const extra = expoConfig && expoConfig.extra ? expoConfig.extra : (Constants.manifest && Constants.manifest.extra) || null;
    if (extra && extra.EXPO_BASE_URL) {
      BASE_URL = extra.EXPO_BASE_URL;
    }

    // Priority 3: Try manifest debugger host (Expo Go / dev client)
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
}

// Priority 4: Platform-specific defaults
if (!BASE_URL) {
  if (Platform.OS === 'web') {
    BASE_URL = 'http://localhost:8000';
  } else if (Platform.OS === 'android') {
    BASE_URL = 'http://10.0.2.2:8000';
  } else if (Platform.OS === 'ios') {
    BASE_URL = 'http://localhost:8000';
  } else {
    BASE_URL = 'http://localhost:8000';
  }
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

// Auto-fix for Android: localhost doesn't work on Android devices/emulators
if (BASE_URL && BASE_URL.indexOf('localhost') !== -1 && Platform.OS === 'android') {
  console.warn('[mobile/services/api] Android detected with localhost - this will not work!');
  // On Android emulators, localhost refers to the emulator itself, not the host machine
  // Use 10.0.2.2 for Android emulator to reach the host machine
  const manifestIp = findIpInConstants();
  if (manifestIp && !manifestIp.startsWith('127.')) {
    // Found a real IP in manifest, use it (better for physical devices)
    console.log('[mobile/services/api] Using manifest IP for Android:', manifestIp);
    BASE_URL = `http://${manifestIp}:8000`;
  } else {
    // No manifest IP, assume emulator
    console.log('[mobile/services/api] Using Android emulator IP: 10.0.2.2');
    BASE_URL = 'http://10.0.2.2:8000';
  }
}

console.log('[mobile/services/api] ==========================================');
console.log('[mobile/services/api] Platform Detection');
console.log('[mobile/services/api] Platform.OS =', Platform.OS);
console.log('[mobile/services/api] Initial BASE_URL =', BASE_URL);

// Auto-fix: Web platform can ONLY use localhost or 127.0.0.1
if (Platform.OS === 'web' && BASE_URL) {
  // Check for invalid IPs that don't work in web browsers
  const hasInvalidIP = BASE_URL.includes('10.0.2.2') || 
                       BASE_URL.match(/192\.168\.\d+\.\d+/) ||
                       BASE_URL.match(/10\.0\.\d+\.\d+/) ||
                       BASE_URL.match(/172\.16\.\d+\.\d+/);
  
  if (hasInvalidIP) {
    console.warn('[mobile/services/api] ⚠️  WEB PLATFORM DETECTED WITH INVALID URL!');
    console.warn('[mobile/services/api] Current URL:', BASE_URL);
    console.warn('[mobile/services/api] Web browsers can only access localhost');
    console.warn('[mobile/services/api] Auto-fixing to: http://localhost:8000');
    BASE_URL = 'http://localhost:8000';
    
    // Clear any stored overrides that might be invalid
    try {
      AsyncStorage.removeItem('OVERRIDE_BASE_URL').catch(() => {});
    } catch (e) {}
  }
}

console.log('[mobile/services/api] ✅ Final BASE_URL =', BASE_URL);
console.log('[mobile/services/api] ==========================================');

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
    if (override) {
      console.log('[mobile/services/api] Found override URL:', override);
      
      // Validate override for current platform
      if (Platform.OS === 'web') {
        // Web can only use localhost or 127.0.0.1
        const isValidForWeb = override.includes('localhost') || override.includes('127.0.0.1');
        if (!isValidForWeb) {
          console.warn('[mobile/services/api] ⚠️  Override URL invalid for web platform:', override);
          console.warn('[mobile/services/api] Web requires localhost. Clearing override.');
          await AsyncStorage.removeItem(OVERRIDE_KEY);
          return BASE_URL;
        }
      } else if (Platform.OS === 'android') {
        // Android cannot use localhost (unless physical device with proxy)
        if (override.includes('localhost') && !override.includes('127.0.0.1')) {
          console.warn('[mobile/services/api] ⚠️  Override URL contains localhost for Android');
          console.warn('[mobile/services/api] Android should use 10.0.2.2 or actual IP');
          // Don't auto-clear in case user knows what they're doing
        }
      }
      
      console.log('[mobile/services/api] ✅ Using override URL:', override);
      return override;
    }
  } catch (e) {
    console.warn('[mobile/services/api] Error reading override:', e);
  }
  return BASE_URL;
}

async function authHeaders(role = null) {
  try {
    let token = null;
    
    // If role is specified, try role-specific token key first
    if (role) {
      const tokenKey = role === 'security' ? 'securityToken' : 
                      role === 'viewer' ? 'viewerToken' : 
                      role === 'admin' ? 'adminToken' : 'userToken';
      token = await AsyncStorage.getItem(tokenKey);
      console.log(`[authHeaders] Trying ${tokenKey}:`, token ? 'Found' : 'Not found');
    }
    
    // If no token found with role-specific key, try all possible keys in order
    if (!token) {
      console.log('[authHeaders] No role-specific token, trying fallbacks...');
      token = await AsyncStorage.getItem('viewerToken');
      if (token) console.log('[authHeaders] Found viewerToken');
      
      if (!token) {
        token = await AsyncStorage.getItem('securityToken');
        if (token) console.log('[authHeaders] Found securityToken');
      }
      
      if (!token) {
        token = await AsyncStorage.getItem('adminToken');
        if (token) console.log('[authHeaders] Found adminToken');
      }
      
      if (!token) {
        token = await AsyncStorage.getItem('userToken');
        if (token) console.log('[authHeaders] Found userToken');
      }
    }
    
    if (!token) {
      console.warn('[authHeaders] No token found in any storage key!');
      return {};
    }
    
    console.log('[authHeaders] ✅ Token found, length:', token.length);
    console.log('[authHeaders] Token preview:', token.substring(0, 50) + '...');
    const headers = { Authorization: `Bearer ${token}` };
    console.log('[authHeaders] Authorization header:', headers.Authorization.substring(0, 60) + '...');
    return headers;
  } catch (e) {
    console.error('[authHeaders] Error:', e);
    return {};
  }
}

export async function resolveBaseUrl() {
  return await getBaseUrl();
}

export async function registerUser(name, email, password, role = 'viewer') {
  try {
    const base = await getBaseUrl();
    const payload = {
      username: name,
      email,
      password,
      role,
    };

    console.log('=== REGISTER DEBUG ===');
    console.log('BASE_URL:', base);
    console.log('Payload:', JSON.stringify(payload, null, 2));
    console.log('Attempting registration to:', `${base}/api/v1/auth/register`);

    const res = await fetch(`${base}/api/v1/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });

    console.log('Response status:', res.status);
    console.log('Response ok:', res.ok);

    let data;
    try {
      data = await res.json();
    } catch (e) {
      console.error('Failed to parse response as JSON:', e);
      data = null;
    }
    
    console.log('Response data:', JSON.stringify(data, null, 2));
    
    if (!res.ok) {
      console.log('Registration FAILED - response not ok');
      return { success: false, message: niceMessageFromResponse(data), data };
    }
    
    console.log('Registration SUCCESS - returning success=true');
    return { success: true, data, message: niceMessageFromResponse(data) };
  } catch (error) {
    console.error('=== REGISTER ERROR ===');
    console.error('Error type:', error.name);
    console.error('Error message:', error.message);
    console.error('BASE_URL:', BASE_URL);
    console.error('Full error:', error);
    return { success: false, message: `${error.message || 'Network error'} (base: ${BASE_URL})` };
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
    const base = await getBaseUrl();
    console.log('=== LOGIN DEBUG ===');
    console.log('BASE_URL:', base);
    console.log('Username/Email:', usernameOrEmail);
    console.log('Role:', role);
    
    // Build application/x-www-form-urlencoded body
    const encode = (s) => encodeURIComponent(s);
    const formBodyString = `username=${encode(usernameOrEmail)}&password=${encode(password)}`;

    console.log('Attempting login to:', `${base}/api/v1/auth/login`);

    const res = await fetch(`${base}/api/v1/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: formBodyString,
    });

    console.log('Response status:', res.status);
    console.log('Response ok:', res.ok);

    let data;
    try {
      data = await res.json();
    } catch (e) {
      console.error('Failed to parse response as JSON:', e);
      data = null;
    }
    
    console.log('Response data:', JSON.stringify(data, null, 2));
    
    if (!res.ok) {
      console.log('Login FAILED - response not ok');
      return { success: false, message: niceMessageFromResponse(data), data };
    }

    // Persist token and user data with role-specific keys
    try {
      if (data && data.access_token) {
        // IMPORTANT: Clear all old tokens first to prevent conflicts between roles
        await AsyncStorage.multiRemove(['viewerToken', 'securityToken', 'adminToken', 'viewerUser', 'securityUser']);
        console.log('[loginUser] Cleared all old role-specific tokens');
        
        // Save token with role-specific key
        const tokenKey = role === 'security' ? 'securityToken' : 
                        role === 'viewer' ? 'viewerToken' : 
                        role === 'admin' ? 'adminToken' : 'userToken';
        await AsyncStorage.setItem(tokenKey, data.access_token);
        console.log(`Token saved to AsyncStorage with key: ${tokenKey}`);
        
        // Also save to userToken for backward compatibility
        await AsyncStorage.setItem('userToken', data.access_token);
        console.log('Token also saved to userToken for compatibility');
        
        // Also save user profile data if available
        if (data.user) {
          await AsyncStorage.setItem('user', JSON.stringify(data.user));
          console.log('User data saved to AsyncStorage:', data.user);
        } else if (data.username || data.email) {
          // Construct user object from available data
          const userData = {
            username: data.username,
            email: data.email,
            role: data.role || role,
            id: data.id || data.user_id
          };
          await AsyncStorage.setItem('user', JSON.stringify(userData));
          console.log('User data constructed and saved:', userData);
        }
      } else {
        console.warn('No access_token in response!');
      }
    } catch (err) {
      console.warn('Failed to persist user data to AsyncStorage', err);
    }

    console.log('Login SUCCESS - returning success=true');
    return { success: true, data, message: niceMessageFromResponse(data) };
  } catch (error) {
    console.error('=== LOGIN ERROR ===');
    console.error('Error type:', error.name);
    console.error('Error message:', error.message);
    console.error('BASE_URL:', BASE_URL);
    console.error('Full error:', error);
    return { success: false, message: `${error.message || 'Network error'} (base: ${BASE_URL})` };
  }
}

export async function getIncidents() {
  try {
    const base = await getBaseUrl();
    const headers = await authHeaders();
    
    console.log('[getIncidents] BASE_URL:', base);
    console.log('[getIncidents] Auth headers:', headers);
    console.log('[getIncidents] Fetching:', `${base}/api/v1/incidents/`);
    
    // Check if we have authorization header
    if (!headers || !headers.Authorization) {
      console.error('[getIncidents] ❌ NO AUTHORIZATION HEADER! User may not be logged in.');
      return { 
        success: false, 
        status: 401, 
        message: 'Not authenticated. Please login first.' 
      };
    }
    
    const res = await fetch(`${base}/api/v1/incidents/`, { 
      method: 'GET', 
      headers: { 
        ...headers,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      } 
    });
    
    console.log('[getIncidents] Response status:', res.status);
    console.log('[getIncidents] Response ok:', res.ok);
    
    // Handle 401 Unauthorized
    if (res.status === 401) {
      console.error('[getIncidents] ❌ 401 Unauthorized - token expired or invalid');
      // Clear invalid token
      await AsyncStorage.multiRemove(['userToken', 'viewerToken', 'securityToken', 'adminToken']);
      return { success: false, status: 401, message: 'Unauthorized. Please login again.' };
    }
    
    const data = await res.json();
    if (!res.ok) {
      console.error('[getIncidents] Request failed:', data);
      return { success: false, message: data.detail || 'Failed to load incidents' };
    }
    
    // Debug: Log first incident structure
    if (data && data.length > 0) {
      console.log('[getIncidents] ✅ Success! Received', data.length, 'incidents');
      console.log('[getIncidents] First incident:', JSON.stringify(data[0], null, 2));
    } else {
      console.log('[getIncidents] ✅ Success! No incidents found.');
    }
    return { success: true, data };
  } catch (error) {
    console.error('[getIncidents] ❌ Error:', error.message);
    console.error('[getIncidents] BASE_URL=', BASE_URL, error);
    return { success: false, message: `${error.message || 'Network error'} (base: ${BASE_URL})` };
  }
}

export async function getIncident(incidentId) {
  try {
    const base = await getBaseUrl();
    const headers = await authHeaders();
    
    console.log('[getIncident] Fetching incident ID:', incidentId);
    console.log('[getIncident] URL:', `${base}/api/v1/incidents/${incidentId}`);
    
    if (!headers || !headers.Authorization) {
      console.error('[getIncident] ❌ NO AUTHORIZATION HEADER!');
      return { 
        success: false, 
        status: 401, 
        message: 'Not authenticated. Please login first.' 
      };
    }
    
    const res = await fetch(`${base}/api/v1/incidents/${incidentId}`, { 
      method: 'GET', 
      headers: { 
        ...headers,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      } 
    });
    
    console.log('[getIncident] Response status:', res.status);
    
    if (res.status === 401) {
      console.error('[getIncident] ❌ 401 Unauthorized');
      await AsyncStorage.multiRemove(['userToken', 'viewerToken', 'securityToken', 'adminToken']);
      return { success: false, status: 401, message: 'Unauthorized. Please login again.' };
    }
    
    if (res.status === 404) {
      console.error('[getIncident] ❌ 404 Not Found');
      return { success: false, status: 404, message: 'Incident not found' };
    }
    
    const data = await res.json();
    if (!res.ok) {
      console.error('[getIncident] Request failed:', data);
      return { success: false, message: data.detail || 'Failed to load incident' };
    }
    
    console.log('[getIncident] ✅ Success! Incident:', data.id);
    console.log('[getIncident] Evidence items:', data.evidence_items?.length || 0);
    if (data.evidence_items && data.evidence_items.length > 0) {
      console.log('[getIncident] First evidence:', JSON.stringify(data.evidence_items[0], null, 2));
    }
    
    return { success: true, data };
  } catch (error) {
    console.error('[getIncident] ❌ Error:', error.message);
    return { success: false, message: `${error.message || 'Network error'} (base: ${BASE_URL})` };
  }
}

export async function getMyEvidence() {
  try {
    const base = await getBaseUrl();
    const headers = await authHeaders();
    
    console.log('[getMyEvidence] BASE_URL:', base);
    console.log('[getMyEvidence] Fetching:', `${base}/api/v1/evidence/my/all`);
    
    // Check if we have authorization header
    if (!headers || !headers.Authorization) {
      console.error('[getMyEvidence] ❌ NO AUTHORIZATION HEADER! User may not be logged in.');
      return { 
        success: false, 
        status: 401, 
        message: 'Not authenticated. Please login first.' 
      };
    }
    
    const res = await fetch(`${base}/api/v1/evidence/my/all`, { 
      method: 'GET', 
      headers: { 
        ...headers,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      } 
    });
    
    console.log('[getMyEvidence] Response status:', res.status);
    
    // Handle 401 Unauthorized
    if (res.status === 401) {
      console.error('[getMyEvidence] ❌ 401 Unauthorized - token expired or invalid');
      await AsyncStorage.multiRemove(['userToken', 'viewerToken', 'securityToken', 'adminToken']);
      return { success: false, status: 401, message: 'Unauthorized. Please login again.' };
    }
    
    const data = await res.json();
    if (!res.ok) {
      console.error('[getMyEvidence] Request failed:', data);
      return { success: false, message: data.detail || 'Failed to load evidence' };
    }
    
    console.log('[getMyEvidence] ✅ Success! Received', data.length, 'evidence items');
    if (data.length > 0) {
      console.log('[getMyEvidence] Sample evidence:', JSON.stringify(data[0], null, 2));
    }
    return { success: true, data };
  } catch (error) {
    console.error('[getMyEvidence] ❌ Error:', error.message);
    return { success: false, message: `${error.message || 'Network error'} (base: ${BASE_URL})` };
  }
}

export async function getEvidenceStats() {
  try {
    const base = await getBaseUrl();
    const headers = await authHeaders();
    
    console.log('[getEvidenceStats] Fetching stats...');
    
    if (!headers || !headers.Authorization) {
      return { success: false, status: 401, message: 'Not authenticated' };
    }
    
    const res = await fetch(`${base}/api/v1/evidence/debug/stats`, { 
      method: 'GET', 
      headers: { 
        ...headers,
        'Accept': 'application/json'
      } 
    });
    
    if (res.status === 401) {
      return { success: false, status: 401, message: 'Unauthorized' };
    }
    
    const data = await res.json();
    if (!res.ok) {
      return { success: false, message: data.detail || 'Failed to get stats' };
    }
    
    console.log('[getEvidenceStats] ✅ Stats:', JSON.stringify(data, null, 2));
    return { success: true, data };
  } catch (error) {
    console.error('[getEvidenceStats] ❌ Error:', error.message);
    return { success: false, message: error.message };
  }
}

export async function acknowledgeIncident(id) {
  return acknowledgeIncidentWithStatus(id, true);
}

export async function acknowledgeIncidentWithStatus(id, acknowledged = true) {
  try {
    const base = await getBaseUrl();
    const headers = await authHeaders();
    const url = `${base}/api/v1/incidents/${id}/acknowledge?acknowledged=${acknowledged}`;
    const res = await fetch(url, { 
      method: 'PUT',
      headers: { ...(headers || {}) }
    });
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
    const res = await fetch(`${base}/api/v1/incidents/`, {
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
    console.log('[getUsers] BASE_URL:', base);
    console.log('[getUsers] Auth headers:', headers ? 'Present' : 'Missing');
    
    const res = await fetch(`${base}/api/v1/users/`, { method: 'GET', headers: { ...(headers || {}) } });
    console.log('[getUsers] Response status:', res.status);
    
    const data = await res.json();
    
    if (!res.ok) {
      console.error('[getUsers] Failed:', data);
      return { success: false, message: data.detail || 'Failed to fetch users. Please login again.' };
    }
    
    console.log('[getUsers] Success - fetched', data?.length || 0, 'users');
    return { success: true, data };
  } catch (error) {
    console.error('getUsers error; BASE_URL=', BASE_URL, error);
    return { success: false, message: `${error.message || 'Network error'} (base: ${BASE_URL})` };
  }
}

export async function getMe(role = null) {
  try {
    const base = await getBaseUrl();
    const headers = await authHeaders(role);
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
    console.log('[API] notifyIncident called:', { base, incidentId, userIds });
    
    const res = await fetch(`${base}/api/v1/incidents/${incidentId}/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(headers || {}) },
      body: JSON.stringify({ user_ids: userIds }),
    });
    
    console.log('[API] notifyIncident response status:', res.status, res.ok);
    
    let data;
    try {
      data = await res.json();
      console.log('[API] notifyIncident response data:', data);
    } catch (e) {
      console.error('[API] Failed to parse response JSON:', e);
      return { success: false, message: `Server returned invalid JSON (status ${res.status})` };
    }
    
    if (!res.ok) {
      console.error('[API] notifyIncident failed:', data);
      return { success: false, message: data.detail || `Server error (status ${res.status})` };
    }
    
    return { success: true, data };
  } catch (error) {
    console.error('[API] notifyIncident error:', error);
    return { success: false, message: `${error.message || 'Network error'}` };
  }
}

export async function getAllEvidence() {
  try {
    const base = await getBaseUrl();
    const headers = await authHeaders();
    const res = await fetch(`${base}/api/v1/incidents/`, { method: 'GET', headers: { ...(headers || {}) } });
    const data = await res.json();
    if (!res.ok) return { success: false, message: data.detail || 'Failed to fetch evidence' };
    
    // Extract all evidence from incidents
    const allEvidence = [];
    if (data && Array.isArray(data)) {
      data.forEach(incident => {
        if (incident.evidence_items && Array.isArray(incident.evidence_items)) {
          incident.evidence_items.forEach(evidence => {
            allEvidence.push({
              ...evidence,
              incident_id: incident.id,
              incident_type: incident.type,
              incident_severity: incident.severity,
              incident_timestamp: incident.timestamp,
              blockchain_tx: incident.blockchain_tx
            });
          });
        }
      });
    }
    
    return { success: true, data: allEvidence };
  } catch (error) {
    console.error('getAllEvidence error; BASE_URL=', BASE_URL, error);
    return { success: false, message: `${error.message || 'Network error'} (base: ${BASE_URL})` };
  }
}

// Send SOS/Emergency Alert
export async function sendSOSAlert(message, location, userInfo = null) {
  try {
    const base = await getBaseUrl();
    const headers = await authHeaders();
    
    // Build description with user information
    let description = `[SOS ALERT] ${message || 'Emergency SOS Alert triggered by user'}`;
    
    if (userInfo) {
      if (userInfo.username) {
        description += `\n\nUser: ${userInfo.username}`;
      }
      if (userInfo.phone) {
        description += `\n\nPhone: ${userInfo.phone}`;
      }
      if (userInfo.email) {
        description += `\n\nEmail: ${userInfo.email}`;
      }
    }
    
    const res = await fetch(`${base}/api/v1/incidents/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(headers || {}) },
      body: JSON.stringify({
        camera_id: 1,
        type: 'fall_health', // Use valid incident type
        severity: 'critical',
        severity_score: 100,
        description: description
      }),
    });
    
    console.log('[sendSOSAlert] Response status:', res.status);
    const data = await res.json();
    console.log('[sendSOSAlert] Response data:', JSON.stringify(data, null, 2));
    
    if (!res.ok) return { success: false, message: data.detail || 'Failed to send SOS alert' };
    return { success: true, data };
  } catch (error) {
    console.error('sendSOSAlert error; BASE_URL=', BASE_URL, error);
    return { success: false, message: `${error.message || 'Network error'} (base: ${BASE_URL})` };
  }
}

// Get SOS/Emergency Alerts (for security personnel)
export async function getSOSAlerts() {
  try {
    const base = await getBaseUrl();
    const headers = await authHeaders();
    // Fetch all incidents and filter client-side for reliability
    const res = await fetch(`${base}/api/v1/incidents/`, { 
      method: 'GET', 
      headers: { ...(headers || {}) } 
    });
    const data = await res.json();
    if (!res.ok) return { success: false, message: data.detail || 'Failed to fetch SOS alerts' };
    
    // Filter for SOS alerts - check for [SOS ALERT] prefix in description
    const sosAlerts = Array.isArray(data) ? data.filter(inc => {
      return inc.description?.startsWith('[SOS ALERT]');
    }) : [];
    
    console.log('[getSOSAlerts] Total incidents:', data?.length, 'SOS alerts:', sosAlerts.length);
    console.log('[getSOSAlerts] SOS alerts:', JSON.stringify(sosAlerts, null, 2));
    
    return { success: true, data: sosAlerts };
  } catch (error) {
    console.error('getSOSAlerts error; BASE_URL=', BASE_URL, error);
    return { success: false, message: `${error.message || 'Network error'} (base: ${BASE_URL})` };
  }
}

// Report incident by viewer to security officials
export async function reportIncident(reportData, attachmentFile = null) {
  try {
    const base = await getBaseUrl();
    const headers = await authHeaders();
    
    // Get first available camera ID
    let cameraId = 1;
    try {
      const camerasRes = await fetch(`${base}/api/v1/cameras/`, {
        method: 'GET',
        headers: { ...headers }
      });
      if (camerasRes.ok) {
        const cameras = await camerasRes.json();
        if (cameras && cameras.length > 0) {
          cameraId = cameras[0].id;
          console.log('[reportIncident] Using camera ID:', cameraId);
        } else {
          console.warn('[reportIncident] No cameras found, using default ID 1');
        }
      }
    } catch (e) {
      console.warn('[reportIncident] Could not fetch cameras, using default ID 1:', e.message);
    }
    
    // Build description with viewer info since metadata field doesn't exist
    let fullDescription = `[VIEWER REPORT]\n${reportData.description}`;
    if (reportData.notes) {
      fullDescription += `\n\nAdditional Notes: ${reportData.notes}`;
    }
    if (reportData.phone) {
      fullDescription += `\n\nContact: ${reportData.phone}`;
    }
    if (reportData.location && reportData.location !== 'Not specified') {
      fullDescription += `\n\nLocation: ${reportData.location}`;
    }
    
    // Map severity to score
    const severityScoreMap = {
      high: 90,
      medium: 50,
      low: 30
    };
    const severity = reportData.severity || 'medium';
    const severityScore = severityScoreMap[severity] || 50;
    
    const payload = {
      camera_id: cameraId,
      type: reportData.type || 'theft',
      severity: severity,
      severity_score: severityScore,
      description: fullDescription
    };
    
    console.log('[reportIncident] Submitting report:', JSON.stringify(payload, null, 2));
    console.log('[reportIncident] URL:', `${base}/api/v1/incidents/`);
    
    const res = await fetch(`${base}/api/v1/incidents/`, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    
    console.log('[reportIncident] Response status:', res.status);
    
    let data;
    try {
      data = await res.json();
      console.log('[reportIncident] Response data:', JSON.stringify(data, null, 2));
    } catch (parseError) {
      console.error('[reportIncident] Failed to parse response:', parseError);
      const text = await res.text();
      console.error('[reportIncident] Response text:', text);
      return { 
        success: false, 
        message: `Server error (status ${res.status}). Please check if the backend is running.` 
      };
    }
    
    if (!res.ok) {
      console.error('[reportIncident] Failed:', JSON.stringify(data, null, 2));
      // Extract error message from detail array if present
      let errorMsg;
      if (Array.isArray(data.detail)) {
        errorMsg = data.detail.map(e => `${e.loc?.join('.') || 'field'}: ${e.msg || e}`).join('; ');
      } else if (typeof data.detail === 'string') {
        errorMsg = data.detail;
      } else {
        errorMsg = data.message || 'Failed to submit report';
      }
      return { success: false, message: errorMsg };
    }
    
    // If there's an attachment, upload it as evidence
    if (attachmentFile && data.id) {
      try {
        const formData = new FormData();
        formData.append('file', attachmentFile);
        formData.append('incident_id', data.id);
        
        const evidenceRes = await fetch(`${base}/api/v1/evidence/`, {
          method: 'POST',
          headers: headers, // Don't set Content-Type for FormData
          body: formData
        });
        
        if (evidenceRes.ok) {
          console.log('[reportIncident] Attachment uploaded successfully');
        } else {
          console.warn('[reportIncident] Failed to upload attachment');
        }
      } catch (uploadError) {
        console.error('[reportIncident] Attachment upload error:', uploadError);
        // Don't fail the whole report if attachment fails
      }
    }
    
    console.log('[reportIncident] Report submitted successfully:', data);
    return { success: true, data, message: 'Report submitted to security' };
  } catch (error) {
    console.error('[reportIncident] Exception:', error);
    console.error('[reportIncident] Error name:', error.name);
    console.error('[reportIncident] Error message:', error.message);
    console.error('[reportIncident] BASE_URL:', BASE_URL);
    
    let errorMessage;
    if (error.message === 'Failed to fetch' || error.name === 'TypeError') {
      errorMessage = 'Cannot connect to backend server. Please ensure the backend is running on http://localhost:8000';
    } else {
      errorMessage = error.message || 'Network error';
    }
    
    return { success: false, message: errorMessage };
  }
}

// Mark incident as handled by security official
export async function markIncidentAsHandled(incidentId, handledNotes = '') {
  try {
    const base = await getBaseUrl();
    const headers = await authHeaders();
    const res = await fetch(`${base}/api/v1/incidents/${incidentId}/acknowledge?acknowledged=true`, {
      method: 'PUT',
      headers: {
        ...headers,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        handled_notes: handledNotes,
        handled_at: new Date().toISOString()
      })
    });
    const data = await res.json();
    if (!res.ok) return { success: false, message: data.detail || 'Failed to mark as handled' };
    console.log('[markIncidentAsHandled] Incident marked as handled:', data);
    return { success: true, data, message: 'Incident marked as handled' };
  } catch (error) {
    console.error('markIncidentAsHandled error; BASE_URL=', BASE_URL, error);
    return { success: false, message: `${error.message || 'Network error'} (base: ${BASE_URL})` };
  }
}

// Verify evidence integrity against blockchain
export async function verifyEvidence(evidenceId) {
  try {
    const base = await getBaseUrl();
    const headers = await authHeaders();
    
    console.log('[verifyEvidence] Verifying evidence ID:', evidenceId);
    console.log('[verifyEvidence] BASE_URL:', base);
    
    // Check authentication
    if (!headers || !headers.Authorization) {
      console.error('[verifyEvidence] ❌ NO AUTHORIZATION HEADER!');
      return { 
        success: false, 
        status: 401, 
        message: 'Not authenticated. Please login first.' 
      };
    }
    
    const res = await fetch(`${base}/api/v1/evidence/${evidenceId}/verify`, {
      method: 'POST',
      headers: {
        ...headers,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });
    
    console.log('[verifyEvidence] Response status:', res.status);
    
    // Handle 401 Unauthorized
    if (res.status === 401) {
      console.error('[verifyEvidence] ❌ 401 Unauthorized');
      await AsyncStorage.multiRemove(['userToken', 'viewerToken', 'securityToken', 'adminToken']);
      return { success: false, status: 401, message: 'Unauthorized. Please login again.' };
    }
    
    const data = await res.json();
    console.log('[verifyEvidence] Response data:', data);
    
    if (!res.ok) {
      const errorMsg = data.detail || 'Verification failed';
      console.error('[verifyEvidence] Error:', errorMsg);
      return { success: false, message: errorMsg };
    }
    
    console.log('[verifyEvidence] ✅ Success! Status:', data.status);
    return { 
      success: true, 
      data: data,
      message: data.message || 'Verification complete'
    };
    
  } catch (error) {
    console.error('[verifyEvidence] ❌ Error:', error.message);
    console.error('[verifyEvidence] BASE_URL=', BASE_URL, error);
    
    let errorMessage = 'Network error';
    if (error.message === 'Failed to fetch' || error.name === 'TypeError') {
      errorMessage = 'Cannot connect to backend server';
    } else {
      errorMessage = error.message || 'Network error';
    }
    
    return { success: false, message: errorMessage };
  }
}


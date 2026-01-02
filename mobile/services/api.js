// services/api.js
// Minimal API helper for mobile app.
// Compute a BASE_URL that works for emulators and physical devices when possible.
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Compute a robust BASE_URL for emulators/devices. Preference order:
// 1) process.env.EXPO_PUBLIC_API_URL (from .env file)
// 2) expo config extra.EXPO_BASE_URL (from app.json)
// 3) manifest / manifest2 debuggerHost (derive IP from Expo dev server)
// 4) sensible platform fallback (10.0.2.2 for Android emulator, localhost for iOS/sim/web)
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

if (BASE_URL && BASE_URL.indexOf('localhost') !== -1 && Platform.OS === 'android') {
  // On Android emulators 'localhost' is not reachable from the device.
  // Prefer 10.0.2.2 by default, but if manifest contains an IP, prefer that.
  const manifestIp = findIpInConstants();
  if (manifestIp) {
    BASE_URL = `http://${manifestIp}:8000`;
  }
}

console.log('[mobile/services/api] Platform.OS =', Platform.OS);

// Auto-fix: Clear invalid cached URL for web platform
if (Platform.OS === 'web' && BASE_URL && BASE_URL.includes('10.0.2.2')) {
  console.warn('[mobile/services/api] WARNING: BASE_URL contains 10.0.2.2 which does not work on web!');
  console.warn('[mobile/services/api] Forcing BASE_URL to localhost:8000');
  BASE_URL = 'http://localhost:8000';
  // Also clear any stored override
  try {
    AsyncStorage.removeItem('OVERRIDE_BASE_URL').catch(() => {});
  } catch (e) {}
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
    if (override) {
      // Ignore invalid overrides for web platform (10.0.2.2 doesn't work on web)
      if (Platform.OS === 'web' && override.includes('10.0.2.2')) {
        console.warn('[mobile/services/api] Ignoring invalid override for web:', override);
        await AsyncStorage.removeItem(OVERRIDE_KEY);
        console.log('[mobile/services/api] Cleared invalid override, using:', BASE_URL);
        return BASE_URL;
      }
      console.log('[mobile/services/api] Using OVERRIDE_BASE_URL from storage:', override);
      return override;
    }
  } catch (e) {
    // ignore
  }
  console.log('[mobile/services/api] getBaseUrl returning:', BASE_URL);
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
    }
    
    return token ? { Authorization: `Bearer ${token}` } : {};
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
    const res = await fetch(`${base}/api/v1/incidents/`, { method: 'GET', headers: { ...(headers || {}) } });
    
    // Handle 401 Unauthorized
    if (res.status === 401) {
      console.error('[API] 401 Unauthorized - token expired or invalid');
      return { success: false, status: 401, message: 'Unauthorized. Please login again.' };
    }
    
    const data = await res.json();
    if (!res.ok) return { success: false, message: data.detail || 'Failed to load incidents' };
    
    // Debug: Log first incident structure
    if (data && data.length > 0) {
      console.log('[API] First incident:', JSON.stringify(data[0], null, 2));
    }
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

export async function getAllEvidence() {
  try {
    const base = await getBaseUrl();
    const headers = await authHeaders();
    const res = await fetch(`${base}/api/v1/incidents`, { method: 'GET', headers: { ...(headers || {}) } });
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


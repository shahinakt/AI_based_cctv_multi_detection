import axios from "axios";

// Use direct localStorage access for tokens to keep interceptor simple and
// predictable. Some parts of the app use `accessToken` and others `userToken`.
// Accept either so requests attach the active token consistently.
const Storage = {
  getItem: (k) => localStorage.getItem(k),
  setItem: (k, v) => localStorage.setItem(k, v),
  removeItem: (k) => localStorage.removeItem(k),
};

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Attach token
api.interceptors.request.use((config) => {
  // Prefer `accessToken` but fall back to `userToken` for backwards compatibility
  const token = Storage.getItem("accessToken") || Storage.getItem("userToken");
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ==============================
// AUTH
// ==============================
export const registerUser = async (username, email, password, role) => {
  try {
    const res = await api.post("/api/v1/auth/register", {
      username,
      email,
      password,
      role,
    });
    return { success: true, data: res.data };
  } catch (e) {
    return {
      success: false,
      message: e.response?.data?.detail || "Registration failed.",
    };
  }
};

export const loginUser = async (usernameOrEmail, password) => {
  try {
    const formData = new URLSearchParams();
    formData.append("username", usernameOrEmail);
    formData.append("password", password);

    const res = await api.post("/api/v1/auth/login", formData, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });

    if (res.data.access_token) {
      await Storage.setItem("userToken", res.data.access_token);
    }

    return { success: true, data: res.data };
  } catch (e) {
    return {
      success: false,
      message: e.response?.data?.detail || "Login failed.",
    };
  }
};

// ==============================
// INCIDENTS
// ==============================
export const getIncidents = async () => {
  try {
    const res = await api.get("/api/v1/incidents/");
    console.log('[api.jsx] getIncidents raw response:', res);
    
    // Ensure we always return an array
    const data = Array.isArray(res.data) ? res.data : [];
    
    if (!Array.isArray(res.data)) {
      console.error('[api.jsx] getIncidents received non-array data:', typeof res.data, res.data);
    }
    
    return { success: true, data };
  } catch (e) {
    console.error('[api.jsx] getIncidents error:', e);
    return {
      success: false,
      message: e.response?.data?.detail || "Failed to load incidents",
      data: []  // Always include empty array on error
    };
  }
};

export const getIncidentDetails = async (id) => {
  try {
    const res = await api.get(`/api/v1/incidents/${id}/`);
    return { success: true, data: res.data };
  } catch (e) {
    return {
      success: false,
      message: e.response?.data?.detail || "Failed to load details",
    };
  }
};

export const acknowledgeIncident = async (id) => {
  try {
    // POST /api/v1/incidents/acknowledge/{id}  – SOS-aware endpoint
    // Cancels the pending 60-second SOS timer and marks the incident acknowledged.
    const res = await api.post(`/api/v1/incidents/acknowledge/${id}`);
    return { success: true, data: res.data };
  } catch (e) {
    return {
      success: false,
      message: e.response?.data?.detail || "Failed to acknowledge",
    };
  }
};

// ==============================
// SOS ALERTS
// ==============================
export const getActiveSosAlerts = async () => {
  try {
    const res = await api.get("/api/v1/sos/active");
    return { success: true, data: Array.isArray(res.data) ? res.data : [] };
  } catch (e) {
    return { success: false, data: [], message: e.response?.data?.detail || "Failed to load SOS alerts" };
  }
};

export const handleSosAlert = async (sosId, resolutionNote = "") => {
  try {
    const res = await api.patch(`/api/v1/sos/${sosId}/handle`, { resolution_note: resolutionNote });
    return { success: true, data: res.data };
  } catch (e) {
    return { success: false, message: e.response?.data?.detail || "Failed to handle SOS alert" };
  }
};

// ==============================
// CAMERAS (Your backend uses: /api/v1/cameras/ )
// ==============================
export const getCameraFeeds = async () => {
  try {
    const res = await api.get("/api/v1/cameras/");
    return { success: true, data: res.data };
  } catch (e) {
    return {
      success: false,
      message: e.response?.data?.detail || "Failed to fetch cameras",
    };
  }
};

// ==============================
// BLOCKCHAIN VERIFICATION
// ==============================

export const getBlockchainStatus = async (incidentId) => {
  try {
    const res = await api.get(`/api/v1/admin/blockchain-status/${incidentId}`);
    return { success: true, data: res.data };
  } catch (e) {
    const status = e.response?.status;
    if (status === 404) return { success: false, data: null, notFound: true, message: "No blockchain record yet." };
    return { success: false, data: null, message: e.response?.data?.detail || "Failed to fetch blockchain status" };
  }
};

export const verifyBlockchain = async (incidentId) => {
  try {
    const res = await api.post(`/api/v1/admin/verify-blockchain/${incidentId}`);
    return { success: true, data: res.data };
  } catch (e) {
    return { success: false, message: e.response?.data?.detail || "Blockchain verification failed" };
  }
};

export const getBlockchainRecords = async (skip = 0, limit = 50) => {
  try {
    const res = await api.get("/api/v1/admin/blockchain-records", { params: { skip, limit } });
    return { success: true, data: Array.isArray(res.data) ? res.data : [] };
  } catch (e) {
    return { success: false, data: [], message: e.response?.data?.detail || "Failed to fetch blockchain records" };
  }
};

export default api;
export { api };

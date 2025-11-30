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
    const res = await api.get("/api/v1/incidents");
    return { success: true, data: res.data };
  } catch (e) {
    return {
      success: false,
      message: e.response?.data?.detail || "Failed to load incidents",
    };
  }
};

export const getIncidentDetails = async (id) => {
  try {
    const res = await api.get(`/api/v1/incidents/${id}`);
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
    const res = await api.post(`/api/v1/incidents/${id}/acknowledge`);
    return { success: true, data: res.data };
  } catch (e) {
    return {
      success: false,
      message: e.response?.data?.detail || "Failed to acknowledge",
    };
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

export default api;
export { api };

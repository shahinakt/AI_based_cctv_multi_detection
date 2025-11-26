import axios from "axios";

const Storage = {
  getItem: (k) => Promise.resolve(localStorage.getItem(k)),
  setItem: (k, v) => Promise.resolve(localStorage.setItem(k, v)),
  removeItem: (k) => Promise.resolve(localStorage.removeItem(k)),
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
api.interceptors.request.use(async (config) => {
  const token = await Storage.getItem("userToken");
  if (token) config.headers.Authorization = `Bearer ${token}`;
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
// CAMERAS (Your backend uses: /api/v1/cameras )
// ==============================
export const getCameraFeeds = async () => {
  try {
    const res = await api.get("/api/v1/cameras");
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

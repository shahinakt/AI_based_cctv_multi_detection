import React, { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import { toast } from 'react-toastify';
import { AuthContext } from './authContext';
import { decodeJwt } from '../utils/jwt';

export function AuthProvider({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const checkAuthStatus = useCallback(async () => {
    const accessToken = localStorage.getItem('accessToken');
    if (accessToken) {
      try {
        const decodedToken = decodeJwt(accessToken);
        const currentTime = Date.now() / 1000;
        if (decodedToken.exp > currentTime) {
          setIsAuthenticated(true);
          // Try to fetch the canonical user object from backend (gives numeric id)
          try {
            const res = await api.get('/api/v1/users/me');
            const me = res.data;
            setUser({ id: me.id, username: me.username, role: me.role });
          } catch (e) {
            // Fallback to token data if backend /me is unavailable
            setUser({ id: decodedToken.sub, username: decodedToken.username, role: decodedToken.role });
          }
        } else {
          // Token expired, clear and force re-login
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          setIsAuthenticated(false);
          setUser(null);
          toast.info('Your session has expired. Please log in again.');
        }
      } catch (error) {
        console.error('Failed to decode token:', error);
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        setIsAuthenticated(false);
        setUser(null);
      }
    } else {
      setIsAuthenticated(false);
      setUser(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    checkAuthStatus();
  }, [checkAuthStatus]);

  const login = async (username, password) => {
  try {
    const formData = new URLSearchParams();
    formData.append("username", username);
    formData.append("password", password);
    formData.append("grant_type", "password");

    const response = await api.post(
      "/api/v1/auth/login",
      formData,
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    const { access_token } = response.data;

    // save token
    localStorage.setItem("accessToken", access_token);
    localStorage.setItem("userToken", access_token);

    // Fetch canonical user object from backend so we have numeric `id`
    try {
      const meRes = await api.get('/api/v1/users/me');
      const me = meRes.data;
      setIsAuthenticated(true);
      setUser({ id: me.id, username: me.username, role: me.role });
    } catch (e) {
      // Fallback to token decode if /me fails
      try {
        const decoded = decodeJwt(access_token);
        setIsAuthenticated(true);
        setUser({ id: decoded.sub, username: decoded.username, role: decoded.role });
      } catch (e2) {
        setIsAuthenticated(true);
        setUser({ email: username, role: 'viewer' });
      }
    }

    return true;
  } catch (error) {
    console.error("Login failed:", error);
    throw error;
  }
};

  const logout = () => {
    
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('userToken');
    setIsAuthenticated(false);
    setUser(null);
    toast.info('You have been logged out.');
    
    window.location.href = '/login';
  };

  const value = {
    isAuthenticated,
    user,
    loading,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// NOTE: `useAuth` hook was moved to `src/hooks/useAuthHook.jsx` to keep this
// file exporting only React components so React Fast Refresh works reliably.
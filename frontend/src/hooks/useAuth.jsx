import React, { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import { toast } from 'react-toastify';
import { AuthContext } from './authContext';
import { decodeJwt } from '../utils/jwt';

export function AuthProvider({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const checkAuthStatus = useCallback(() => {
    const accessToken = localStorage.getItem('accessToken');
    if (accessToken) {
      try {
        const decodedToken = decodeJwt(accessToken);
        const currentTime = Date.now() / 1000;
        if (decodedToken.exp > currentTime) {
          setIsAuthenticated(true);
          setUser({
            id: decodedToken.sub, // Assuming 'sub' is user ID
            username: decodedToken.username, // Assuming 'username' is in token
            role: decodedToken.role, // Assuming 'role' is in token
          });
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
      const response = await api.post('/auth/login', { username, password });
      const { access_token, refresh_token } = response.data;
     
      localStorage.setItem('accessToken', access_token);
      localStorage.setItem('refreshToken', refresh_token);
      localStorage.setItem('userToken', access_token); 
      checkAuthStatus(); 
      return true;
    } catch (error) {
      console.error('Login failed:', error);
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
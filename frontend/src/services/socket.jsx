import React, { createContext, useState, useEffect, useRef, useCallback } from 'react';
import { WS_BASE_URL } from '../utils/constants';
import { toast } from 'react-toastify';

export const IncidentContext = createContext(null);

export function IncidentProvider({ children }) {
  const [latestIncident, setLatestIncident] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const ws = useRef(null);
  const reconnectTimeout = useRef(null);
  const retryCount = useRef(0);
  const MAX_RETRIES = 10;
  const RECONNECT_INTERVAL = 5000;

  const connectWebSocket = useCallback(() => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      console.log('WebSocket already open.');
      return;
    }

    console.log(`Attempting to connect to WebSocket: ${WS_BASE_URL}/ws/incidents`);
    ws.current = new WebSocket(`${WS_BASE_URL}/ws/incidents`);

    ws.current.onopen = () => {
      console.log('WebSocket connected.');
      setIsConnected(true);
      retryCount.current = 0; // Reset retry count on successful connection
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
        reconnectTimeout.current = null;
      }
      toast.success('Live incident feed connected!', { toastId: 'ws-connect-success' });
    };

    ws.current.onmessage = (event) => {
      try {
        const incidentData = JSON.parse(event.data);
        console.log('Received incident:', incidentData);
        setLatestIncident(incidentData);
        
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    ws.current.onclose = (event) => {
      setIsConnected(false);
      console.log('WebSocket disconnected:', event.code, event.reason);
      if (event.code !== 1000 && retryCount.current < MAX_RETRIES) { // 1000 is normal closure
        retryCount.current++;
        console.log(`Attempting to reconnect in ${RECONNECT_INTERVAL / 1000} seconds (Attempt ${retryCount.current}/${MAX_RETRIES})...`);
        toast.warn(`Live feed disconnected. Reconnecting... (Attempt ${retryCount.current})`, { toastId: 'ws-reconnect-attempt' });
        reconnectTimeout.current = setTimeout(connectWebSocket, RECONNECT_INTERVAL);
      } else if (retryCount.current >= MAX_RETRIES) {
        toast.error('Failed to reconnect to live feed after multiple attempts.', { toastId: 'ws-reconnect-fail' });
        console.error('Max WebSocket reconnection attempts reached.');
      }
    };

    ws.current.onerror = (error) => {
      console.error('WebSocket error:', error);
      ws.current.close(); // Force close to trigger onclose and reconnection logic
      toast.error('WebSocket error occurred. Attempting to reconnect.', { toastId: 'ws-error' });
    };
  }, []);

  useEffect(() => {
    connectWebSocket();

   
    return () => {
      if (ws.current) {
        console.log('Closing WebSocket on component unmount.');
        ws.current.close(1000, 'Component unmounted');
      }
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
      }
    };
  }, [connectWebSocket]);

  const value = {
    latestIncident,
    isConnected,
  };

  return (
    <IncidentContext.Provider value={value}>
      {children}
    </IncidentContext.Provider>
  );
}
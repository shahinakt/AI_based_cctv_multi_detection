import React, { createContext, useState, useEffect, useRef, useCallback } from 'react';
import { WS_BASE_URL } from '../utils/constants';

export const IncidentContext = createContext(null);

export function IncidentProvider({ children }) {
  const [latestIncident, setLatestIncident] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const ws = useRef(null);
  const reconnectTimeout = useRef(null);
  const retryCount = useRef(0);
  const pingInterval = useRef(null);
  const MAX_RETRIES = 10;
  const RECONNECT_INTERVAL = 5000;
  const PING_INTERVAL = 30000; // Send ping every 30 seconds

  const connectWebSocket = useCallback(() => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      console.log('WebSocket already open.');
      return;
    }

    // Get auth token for WebSocket authentication
    const token = localStorage.getItem('accessToken') || localStorage.getItem('userToken');
    const wsUrl = token 
      ? `${WS_BASE_URL}/ws/incidents?token=${encodeURIComponent(token)}` 
      : `${WS_BASE_URL}/ws/incidents`;

    console.log(`Attempting to connect to WebSocket: ${wsUrl.replace(/token=[^&]+/, 'token=***')}`);
    ws.current = new WebSocket(wsUrl);

    ws.current.onopen = () => {
      console.log('WebSocket connected.');
      setIsConnected(true);
      retryCount.current = 0; // Reset retry count on successful connection
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
        reconnectTimeout.current = null;
      }
      
      // Start heartbeat to keep connection alive
      if (pingInterval.current) {
        clearInterval(pingInterval.current);
      }
      pingInterval.current = setInterval(() => {
        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
          console.log('Sending ping to keep connection alive');
          ws.current.send(JSON.stringify({ action: 'ping' }));
        }
      }, PING_INTERVAL);
      
      // Connection established – silent (no popup)
    };

    ws.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('Received WebSocket message:', data);

        // Skip heartbeat / control messages – only process real incidents
        // A real incident always has a numeric id and a timestamp field.
        if (!data || data.type === 'pong' || data.action === 'pong' || !data.id || !data.timestamp) {
          return;
        }

        setLatestIncident(data);
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    ws.current.onclose = (event) => {
      setIsConnected(false);
      
      // Clear heartbeat
      if (pingInterval.current) {
        clearInterval(pingInterval.current);
        pingInterval.current = null;
      }
      
      console.log('WebSocket disconnected:', event.code, event.reason);
      if (event.code !== 1000 && retryCount.current < MAX_RETRIES) { // 1000 is normal closure
        retryCount.current++;
        console.log(`Attempting to reconnect in ${RECONNECT_INTERVAL / 1000} seconds (Attempt ${retryCount.current}/${MAX_RETRIES})...`);
        reconnectTimeout.current = setTimeout(connectWebSocket, RECONNECT_INTERVAL);
      } else if (retryCount.current >= MAX_RETRIES) {
        console.error('Max WebSocket reconnection attempts reached.');
      }
    };

    ws.current.onerror = (error) => {
      console.error('WebSocket error:', error);
      ws.current.close(); // Force close to trigger onclose and reconnection logic
    };
  }, []);

  useEffect(() => {
    connectWebSocket();

   
    return () => {
      // Clear heartbeat
      if (pingInterval.current) {
        clearInterval(pingInterval.current);
        pingInterval.current = null;
      }
      
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
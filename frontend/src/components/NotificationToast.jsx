import React, { useContext, useEffect } from 'react';
import { toast } from 'react-toastify';
import { IncidentContext } from '../services/socket';

function NotificationToast() {
  // Guard in case the provider is not mounted yet (avoids crash during SSR/tests)
  const incidentCtx = useContext(IncidentContext) || {};
  const { latestIncident } = incidentCtx;

  useEffect(() => {
    if (latestIncident) {
      toast.warn(
        <div>
          <p className="font-bold">New Incident Detected!</p>
          <p>Type: {latestIncident.type}</p>
          <p>Camera: {latestIncident.camera_id}</p>
          <p className="text-xs">{new Date(latestIncident.timestamp).toLocaleTimeString()}</p>
        </div>,
        {
          toastId: latestIncident.id, 
          onClick: () => {
            
          },
        }
      );
    }
  }, [latestIncident]);

  return null; 
}

export default NotificationToast;
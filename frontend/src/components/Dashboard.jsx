import React, { useEffect, useState, useContext } from 'react';
import { IncidentContext } from '../services/socket';
import FeedCard from './FeedCard';
import api from '../services/api';
import { toast } from 'react-toastify';
import { useAuth } from '../hooks/useAuthHook';

function Dashboard() {
  const { latestIncident } = useContext(IncidentContext);
  const [cameras, setCameras] = useState([]);
  const [loadingCameras, setLoadingCameras] = useState(true);
  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    // Wait for auth to initialize before making authenticated requests
    if (authLoading) return;

    const fetchCameras = async () => {
      try {
        if (user) {
          // Authenticated user: fetch via authenticated endpoint then show only their cameras
          const res = await api.get('/api/v1/cameras/');
          const all = res.data || [];
          // Admins see all cameras; other users see only their own cameras
          const role = user.role || (user?.role && user.role.value) || 'viewer';
          if (String(role).toLowerCase().includes('admin')) {
            setCameras(all);
          } else {
            setCameras(all.filter((c) => Number(c.admin_user_id) === Number(user.id)));
          }
        } else {
          // Public/unauthenticated: use legacy public endpoint
          const response = await api.get('/cameras');
          setCameras(response.data || []);
        }
      } catch (error) {
        toast.error('Failed to fetch camera list.');
        console.error('Error fetching cameras:', error);
      } finally {
        setLoadingCameras(false);
      }
    };

    fetchCameras();
  }, [authLoading, user]);

  return (
    <div className="p-4">
      <h1 className="text-3xl font-bold text-primary mb-6">Live Dashboard</h1>

      <div className="mb-8">
        <h2 className="text-2xl font-semibold text-text-secondary mb-4">Latest Incident</h2>
        {latestIncident ? (
          <div className="bg-surface p-4 rounded-lg shadow-md">
            <p className="text-lg font-medium text-accent">Type: {latestIncident.type}</p>
            <p className="text-text-secondary">Timestamp: {new Date(latestIncident.timestamp).toLocaleString()}</p>
            <p className="text-text-secondary">Camera ID: {latestIncident.camera_id}</p>
            {latestIncident.image_url && (
              <img src={latestIncident.image_url} alt="Latest Incident" className="mt-4 max-w-full h-auto rounded-md" />
            )}
            {/* You might want to add a link to the incident details page */}
          </div>
        ) : (
          <p className="text-text-secondary">No recent incidents detected.</p>
        )}
      </div>

      <h2 className="text-2xl font-semibold text-text-secondary mb-4">Live Camera Feeds</h2>
      {loadingCameras ? (
        <p className="text-text-secondary">Loading cameras...</p>
      ) : cameras.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {cameras.map((camera) => (
            <FeedCard key={camera.id} camera={camera} latestIncident={latestIncident} />
          ))}
        </div>
      ) : (
        <p className="text-text-secondary">No cameras configured or available.</p>
      )}
    </div>
  );
}

export default Dashboard;
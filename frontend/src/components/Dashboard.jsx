import React, { useEffect, useState, useContext } from 'react';
import { IncidentContext } from '../services/socket';
import FeedCard from './FeedCard';
import api from '../services/api';
import { toast } from 'react-toastify';

function Dashboard() {
  const { latestIncident } = useContext(IncidentContext);
  const [cameras, setCameras] = useState([]);
  const [loadingCameras, setLoadingCameras] = useState(true);

  useEffect(() => {
    const fetchCameras = async () => {
      try {
        const response = await api.get('/cameras');
        setCameras(response.data);
      } catch (error) {
        toast.error('Failed to fetch camera list.');
        console.error('Error fetching cameras:', error);
      } finally {
        setLoadingCameras(false);
      }
    };
    fetchCameras();
  }, []);

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
import React, { useState, useEffect } from 'react';
import { getIncidents } from '../services/api';
import api from '../services/api';
import { toast } from 'react-toastify';
import { useAuth } from '../hooks/useAuthHook';


function IncidentList() {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedIncident, setSelectedIncident] = useState(null);
  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    if (authLoading) return;

    const fetchIncidents = async () => {
      try {
        const response = await getIncidents();
        if (!response.success) {
          toast.error(response.message || 'Failed to fetch incidents.');
          setIncidents([]);
          return;
        }
        let allIncidents = response.data || [];

        // If user is not admin, filter incidents to those relevant to the user
        const role = user?.role || (user?.role && user.role.value) || 'viewer';
        if (!String(role).toLowerCase().includes('admin')) {
          // Fetch cameras to determine ownership
          try {
            const camsRes = await api.get('/api/v1/cameras/');
            const cams = camsRes.data || [];
            const ownedCameraIds = new Set(cams.filter(c => Number(c.admin_user_id) === Number(user?.id)).map(c => c.id));

            // Keep incidents where camera_id is owned by user OR assigned to the user
            allIncidents = allIncidents.filter(inc => ownedCameraIds.has(Number(inc.camera_id)) || Number(inc.assigned_user_id) === Number(user?.id));
          } catch (cerr) {
            // If fetching cameras fails, fall back to filtering by assigned_user_id only
            allIncidents = allIncidents.filter(inc => Number(inc.assigned_user_id) === Number(user?.id));
          }
        }

        setIncidents(allIncidents);
      } catch (error) {
        toast.error('Failed to fetch incidents.');
        console.error('Error fetching incidents:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchIncidents();
  }, [authLoading, user]);

  const handleViewDetails = (incident) => {
    setSelectedIncident(incident);
  };

  const handleCloseDetails = () => {
    setSelectedIncident(null);
  };

  if (loading) {
    return <div className="text-text-secondary">Loading incidents...</div>;
  }

  return (
    <div className="p-4">
      <h1 className="text-3xl font-bold text-primary mb-6">Incidents</h1>

      {incidents.length === 0 ? (
        <p className="text-text-secondary">No incidents found.</p>
      ) : (
        <div className="overflow-x-auto bg-surface rounded-lg shadow-md">
          <table className="min-w-full divide-y divide-gray-600">
            <thead className="bg-gray-700">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                  ID
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                  Type
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                  Camera ID
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                  Timestamp
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-600">
              {incidents.map((incident) => (
                <tr key={incident.id} className="hover:bg-gray-700 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-text">
                    {incident.id}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-text-secondary">
                    {incident.type}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-text-secondary">
                    {incident.camera_id}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-text-secondary">
                    {new Date(incident.timestamp).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button
                      onClick={() => handleViewDetails(incident)}
                      className="text-primary hover:text-blue-400 transition-colors"
                    >
                      View Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedIncident && (
        <IncidentDetail incident={selectedIncident} onClose={handleCloseDetails} />
      )}
    </div>
  );
}

export default IncidentList;


function IncidentDetail({ incident, onClose }) {
  if (!incident) return null;
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
      <div className="bg-surface rounded-lg p-6 w-11/12 md:w-2/3 lg:w-1/2">
        <h2 className="text-xl font-semibold text-primary mb-2">Incident Details</h2>
        <p className="text-text-secondary"><strong>ID:</strong> {incident.id}</p>
        <p className="text-text-secondary"><strong>Type:</strong> {incident.type}</p>
        <p className="text-text-secondary"><strong>Camera ID:</strong> {incident.camera_id}</p>
        <p className="text-text-secondary"><strong>Timestamp:</strong> {new Date(incident.timestamp).toLocaleString()}</p>
        {incident.description && (
          <div className="mt-3 p-3 bg-gray-800 rounded">
            <p className="text-text"><strong>Description:</strong></p>
            <p className="text-text-secondary mt-1 whitespace-pre-wrap">{incident.description}</p>
          </div>
        )}
        {incident.image_url && <img src={incident.image_url} alt="incident" className="mt-4 w-full rounded" />}
        <div className="mt-4 flex justify-end">
          <button onClick={onClose} className="bg-primary text-white px-4 py-2 rounded">Close</button>
        </div>
      </div>
    </div>
  );
}
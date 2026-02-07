import React, { useState, useEffect, useContext } from 'react';
import { getIncidents } from '../services/api';
import api from '../services/api';
import { toast } from 'react-toastify';
import { useAuth } from '../hooks/useAuthHook';
import { IncidentContext } from '../services/socket';

function IncidentList() {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedIncident, setSelectedIncident] = useState(null);
  const { user, loading: authLoading } = useAuth();
  const { latestIncident, isConnected } = useContext(IncidentContext) || {};

  // WebSocket: Listen for new incidents and add to list
  useEffect(() => {
    if (latestIncident && latestIncident.id) {
      setIncidents(prevIncidents => {
        // Check if incident already exists
        const exists = prevIncidents.some(inc => inc.id === latestIncident.id);
        if (!exists) {
          console.log(`[WebSocket] Adding new incident ${latestIncident.id} to list`);
          // Add new incident to the top of the list
          return [latestIncident, ...prevIncidents];
        }
        return prevIncidents;
      });
      
      // Show notification for new incident
      toast.info(`New ${latestIncident.type} incident detected on Camera ${latestIncident.camera_id}`, {
        toastId: `incident-${latestIncident.id}`
      });
    }
  }, [latestIncident]);

  useEffect(() => {
    if (authLoading) return;

    const fetchIncidents = async () => {
      try {
        const response = await getIncidents();
        console.log('[Frontend] getIncidents response:', response);
        
        if (!response.success) {
          toast.error(response.message || 'Failed to fetch incidents.');
          setIncidents([]);
          return;
        }
        
        // Ensure response.data is an array
        let allIncidents = Array.isArray(response.data) ? response.data : [];
        
        if (!Array.isArray(response.data)) {
          console.error('[Frontend] API returned non-array data:', typeof response.data, response.data);
          toast.error('Invalid data format received from server');
          setIncidents([]);
          return;
        }

        // Backend now handles filtering, so we can use the data directly
        // But keep client-side filtering as fallback for backwards compatibility
        const role = user?.role || (user?.role && user.role.value) || 'viewer';
        
        // No need for client-side filtering anymore - backend does it
        // Just log for debugging
        console.log(`[Frontend] Received ${allIncidents.length} incidents from API for user ${user?.username} (role: ${role})`);

        setIncidents(allIncidents);
        if (allIncidents.length > 0) {
          console.log('[Frontend] Latest incident:', allIncidents[0]);
        }
      } catch (error) {
        toast.error('Failed to fetch incidents.');
        console.error('[Frontend] Error fetching incidents:', error);
        setIncidents([]);  // Ensure we set empty array on error
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

  // Manual refresh function for debugging
  const handleManualRefresh = async () => {
    setLoading(true);
    try {
      const response = await getIncidents();
      console.log('[Manual Refresh] API Response:', response);
      if (response.success && response.data) {
        setIncidents(response.data);
        toast.success(`Refreshed: ${response.data.length} incidents loaded`);
      } else {
        toast.error('Failed to refresh incidents');
      }
    } catch (error) {
      console.error('[Manual Refresh] Error:', error);
      toast.error('Error refreshing incidents');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="text-text-secondary">Loading incidents...</div>;
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-primary">Incidents</h1>
        
        <div className="flex items-center gap-4">
          {/* Manual Refresh Button */}
          <button 
            onClick={handleManualRefresh}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm font-medium disabled:opacity-50"
          >
            {loading ? 'Refreshing...' : '🔄 Refresh'}
          </button>
          
          {/* WebSocket Status Indicator */}
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
            <span className={`text-sm ${isConnected ? 'text-green-400' : 'text-red-400'}`}>
              {isConnected ? 'Live Updates Connected' : 'Connecting...'}
            </span>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-text-secondary">Loading incidents...</div>
      ) : incidents.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-text-secondary mb-2">No incidents found.</p>
          <p className="text-sm text-gray-400">
            {isConnected ? 'Waiting for new incidents...' : 'Check WebSocket connection'}
          </p>
        </div>
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

export default IncidentList;
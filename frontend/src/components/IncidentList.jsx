import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { toast } from 'react-toastify';


function IncidentList() {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedIncident, setSelectedIncident] = useState(null);

  useEffect(() => {
    const fetchIncidents = async () => {
      try {
        const response = await api.get('/incidents');
        setIncidents(response.data);
      } catch (error) {
        toast.error('Failed to fetch incidents.');
        console.error('Error fetching incidents:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchIncidents();
  }, []);

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
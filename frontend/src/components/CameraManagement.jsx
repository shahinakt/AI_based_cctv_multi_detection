import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { toast } from 'react-toastify';

function CameraManagement() {
  const [cameras, setCameras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newCamera, setNewCamera] = useState({ name: '', location: '', stream_url: '', status: 'active' });
  const [editingCamera, setEditingCamera] = useState(null);

  useEffect(() => {
    fetchCameras();
  }, []);

  const fetchCameras = async () => {
    try {
      const response = await api.get('/cameras');
      setCameras(response.data);
    } catch (error) {
      toast.error('Failed to fetch cameras.');
      console.error('Error fetching cameras:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    if (editingCamera) {
      setEditingCamera({ ...editingCamera, [name]: value });
    } else {
      setNewCamera({ ...newCamera, [name]: value });
    }
  };

  const handleAddCamera = async (e) => {
    e.preventDefault();
    try {
      await api.post('/cameras', newCamera);
      toast.success('Camera added successfully!');
      setNewCamera({ name: '', location: '', stream_url: '', status: 'active' });
      fetchCameras();
    } catch (error) {
      toast.error('Failed to add camera.');
      console.error('Error adding camera:', error);
    }
  };

  const handleUpdateCamera = async (e) => {
    e.preventDefault();
    if (!editingCamera) return;
    try {
      await api.put(`/cameras/${editingCamera.id}`, editingCamera);
      toast.success('Camera updated successfully!');
      setEditingCamera(null);
      fetchCameras();
    } catch (error) {
      toast.error('Failed to update camera.');
      console.error('Error updating camera:', error);
    }
  };

  const handleDeleteCamera = async (id) => {
    if (window.confirm('Are you sure you want to delete this camera?')) {
      try {
        await api.delete(`/cameras/${id}`);
        toast.success('Camera deleted successfully!');
        fetchCameras();
      } catch (error) {
        toast.error('Failed to delete camera.');
        console.error('Error deleting camera:', error);
      }
    }
  };

  if (loading) {
    return <div className="text-text-secondary">Loading cameras...</div>;
  }

  return (
    <div className="p-4">
      <h1 className="text-3xl font-bold text-primary mb-6">Camera Management</h1>

      <div className="bg-surface p-6 rounded-lg shadow-md mb-8">
        <h2 className="text-2xl font-semibold text-text mb-4">{editingCamera ? 'Edit Camera' : 'Add New Camera'}</h2>
        <form onSubmit={editingCamera ? handleUpdateCamera : handleAddCamera} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-text-secondary text-sm font-bold mb-2">
              Camera Name
            </label>
            <input
              type="text"
              id="name"
              name="name"
              className="shadow appearance-none border rounded w-full py-2 px-3 text-text leading-tight focus:outline-none focus:shadow-outline bg-gray-600 border-gray-500"
              value={editingCamera ? editingCamera.name : newCamera.name}
              onChange={handleInputChange}
              required
            />
          </div>
          <div>
            <label htmlFor="location" className="block text-text-secondary text-sm font-bold mb-2">
              Location
            </label>
            <input
              type="text"
              id="location"
              name="location"
              className="shadow appearance-none border rounded w-full py-2 px-3 text-text leading-tight focus:outline-none focus:shadow-outline bg-gray-600 border-gray-500"
              value={editingCamera ? editingCamera.location : newCamera.location}
              onChange={handleInputChange}
              required
            />
          </div>
          <div>
            <label htmlFor="stream_url" className="block text-text-secondary text-sm font-bold mb-2">
              Stream URL (HLS/MJPEG)
            </label>
            <input
              type="text"
              id="stream_url"
              name="stream_url"
              placeholder="0 for laptop webcam, or RTSP/HTTP URL"
              className="shadow appearance-none border rounded w-full py-2 px-3 text-text leading-tight focus:outline-none focus:shadow-outline bg-gray-600 border-gray-500"
              value={editingCamera ? editingCamera.stream_url : newCamera.stream_url}
              onChange={handleInputChange}
              required
            />
          </div>
          <div>
            <label htmlFor="status" className="block text-text-secondary text-sm font-bold mb-2">
              Status
            </label>
            <select
              id="status"
              name="status"
              className="shadow appearance-none border rounded w-full py-2 px-3 text-text leading-tight focus:outline-none focus:shadow-outline bg-gray-600 border-gray-500"
              value={editingCamera ? editingCamera.status : newCamera.status}
              onChange={handleInputChange}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="maintenance">Maintenance</option>
            </select>
          </div>
          <div className="flex space-x-4">
            <button
              type="submit"
              className="bg-primary hover:bg-blue-600 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline transition-colors"
            >
              {editingCamera ? 'Update Camera' : 'Add Camera'}
            </button>
            {editingCamera && (
              <button
                type="button"
                onClick={() => setEditingCamera(null)}
                className="bg-secondary hover:bg-gray-600 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline transition-colors"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="overflow-x-auto bg-surface rounded-lg shadow-md">
        <table className="min-w-full divide-y divide-gray-600">
          <thead className="bg-gray-700">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                ID
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                Name
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                Location
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                Stream URL
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                Status
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-600">
            {cameras.map((camera) => (
              <tr key={camera.id} className="hover:bg-gray-700 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-text">
                  {camera.id}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-text-secondary">
                  {camera.name}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-text-secondary">
                  {camera.location}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-text-secondary">
                  <a href={camera.stream_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    Link
                  </a>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-text-secondary">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                    camera.status === 'active' ? 'bg-green-100 text-green-800' :
                    camera.status === 'inactive' ? 'bg-red-100 text-red-800' :
                    'bg-yellow-100 text-yellow-800'
                  }`}>
                    {camera.status}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  <button
                    onClick={() => setEditingCamera(camera)}
                    className="text-primary hover:text-blue-400 mr-4 transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDeleteCamera(camera.id)}
                    className="text-accent hover:text-red-400 transition-colors"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default CameraManagement;
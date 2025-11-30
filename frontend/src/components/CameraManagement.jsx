import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { toast } from 'react-toastify';
import { useAuth } from '../hooks/useAuthHook';

function CameraManagement() {
  const [cameras, setCameras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [readOnly, setReadOnly] = useState(false);
  const [newCamera, setNewCamera] = useState({ name: '', location: '', stream_url: '', is_active: true });
  const [editingCamera, setEditingCamera] = useState(null);
  const [ownedCount, setOwnedCount] = useState(0);

  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    // Wait for auth to finish initializing so the token (if any)
    // is attached by the `api` interceptor. Otherwise unauth'd
    // requests may return 401/403 and cause noisy errors.
    if (authLoading) return;
    fetchCameras();
  }, [authLoading]);

  // Security role should not access this page at all
  if (user?.role === 'security') {
    return (
      <div className="p-4">
        <h1 className="text-2xl font-semibold text-text">Access denied</h1>
        <p className="text-text-secondary mt-2">Your role does not permit camera management.</p>
      </div>
    );
  }

  const fetchCameras = async () => {
    try {
      // Try authenticated endpoint first (admins)
      const response = await api.get('/api/v1/cameras/');
      const camData = response.data || [];
      // If the logged-in user is admin, show all; otherwise show only their own cameras
      const role = user?.role || (user?.role && user.role.value) || null;
      if (role && String(role).toLowerCase().includes('admin')) {
        setCameras(camData);
      } else if (user) {
        const owned = camData.filter((c) => Number(c.admin_user_id) === Number(user.id));
        setCameras(owned);
      } else {
        // No authenticated user; show public list
        setCameras(camData);
      }
      setReadOnly(false);
      const ownerCount = camData.filter((c) => Number(c.admin_user_id) === Number(user?.id)).length;
      setOwnedCount(ownerCount);

      // If backend did not include admin_username, try to fetch users and map ids -> usernames
      if (camData.some((c) => !c.admin_username && c.admin_user_id)) {
        try {
          const usersRes = await api.get('/api/v1/users/');
          const users = usersRes.data || [];
          const userMap = Object.fromEntries(users.map(u => [u.id, u.username]));
          setCameras(prev => prev.map(c => ({ ...c, admin_username: c.admin_username || userMap[c.admin_user_id] })));
        } catch (uerr) {
          console.warn('Could not fetch users to enrich camera owner names:', uerr?.message || uerr);
        }
      }
    } catch (error) {
      console.warn('Authenticated cameras fetch failed, falling back to legacy /cameras:', error?.message || error);
      try {
          const legacy = await api.get('/cameras/');
        const camData = legacy.data || [];
        // Legacy endpoint is public; but if logged-in and not admin, limit to own cameras
        const role = user?.role || (user?.role && user.role.value) || null;
        if (role && String(role).toLowerCase().includes('admin')) {
          setCameras(camData);
        } else if (user) {
          setCameras(camData.filter((c) => Number(c.admin_user_id) === Number(user.id)));
        } else {
          setCameras(camData);
        }
        setReadOnly(true);
        const ownerCount = camData.filter((c) => Number(c.admin_user_id) === Number(user?.id)).length;
        setOwnedCount(ownerCount);
        // same user enrichment for legacy response
        if (camData.some((c) => !c.admin_username && c.admin_user_id)) {
          try {
            const usersRes = await api.get('/api/v1/users/');
            const users = usersRes.data || [];
            const userMap = Object.fromEntries(users.map(u => [u.id, u.username]));
            setCameras(prev => prev.map(c => ({ ...c, admin_username: c.admin_username || userMap[c.admin_user_id] })));
          } catch (uerr) {
            console.warn('Could not fetch users to enrich camera owner names:', uerr?.message || uerr);
          }
        }
        toast.info('Showing public camera list (read-only). Log in as admin to enable management actions.');
      } catch (err2) {
        toast.error('Failed to fetch cameras.');
        console.error('Error fetching cameras (both endpoints):', err2);
      }
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
    // Prevent creating more than 4 cameras for viewer role
    if (user?.role === 'viewer' && ownedCount >= 4) {
      toast.error('You have reached the maximum of 4 cameras. Delete one to add another.');
      return;
    }
    try {
      // CameraCreate schema expects: name, stream_url, location
      const payload = {
        name: newCamera.name,
        stream_url: newCamera.stream_url,
        location: newCamera.location,
      };
      await api.post('/api/v1/cameras/', payload);
      toast.success('Camera added successfully!');
      setNewCamera({ name: '', location: '', stream_url: '', is_active: true });
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
      // Only send allowed update fields; CameraUpdate supports name, stream_url, location, is_active
      const payload = {
        ...(editingCamera.name !== undefined && { name: editingCamera.name }),
        ...(editingCamera.stream_url !== undefined && { stream_url: editingCamera.stream_url }),
        ...(editingCamera.location !== undefined && { location: editingCamera.location }),
        ...(editingCamera.is_active !== undefined && { is_active: editingCamera.is_active }),
      };
      await api.put(`/api/v1/cameras/${editingCamera.id}/`, payload);
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
          await api.delete(`/api/v1/cameras/${id}/`);
          toast.success('Camera deleted successfully!');
        fetchCameras();
      } catch (error) {
          const message = error?.response?.data?.detail || error?.message || 'Failed to delete camera.';
          toast.error(message);
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
            <label htmlFor="is_active" className="block text-text-secondary text-sm font-bold mb-2">
              Status
            </label>
            <select
              id="is_active"
              name="is_active"
              className="shadow appearance-none border rounded w-full py-2 px-3 text-text leading-tight focus:outline-none focus:shadow-outline bg-gray-600 border-gray-500"
              value={editingCamera ? (editingCamera.is_active ? 'active' : 'inactive') : (newCamera.is_active ? 'active' : 'inactive')}
              onChange={(e) => {
                const val = e.target.value === 'active';
                if (editingCamera) setEditingCamera({ ...editingCamera, is_active: val });
                else setNewCamera({ ...newCamera, is_active: val });
              }}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <div className="flex space-x-4">
            <button
              type="submit"
              disabled={readOnly || (!editingCamera && user?.role === 'viewer' && ownedCount >= 4)}
              className={`bg-primary hover:bg-blue-600 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline transition-colors ${(!editingCamera && user?.role === 'viewer' && ownedCount >= 4) || readOnly ? 'opacity-50 cursor-not-allowed' : ''}`}
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
          {!editingCamera && user?.role === 'viewer' && ownedCount >= 4 && (
            <p className="text-accent mt-2">You have reached the maximum of 4 cameras.</p>
          )}
          {readOnly && (
            <p className="text-accent mt-2">Camera list is in read-only mode (legacy endpoint). Log in as admin to enable management.</p>
          )}
        </form>
      </div>

      <div className="overflow-x-auto bg-surface rounded-lg shadow-md">
        {readOnly && (
          <div className="p-3 text-sm text-text-secondary">
            Showing public camera list (read-only). Log in as admin to enable management actions.
          </div>
        )}
        <table className="min-w-full divide-y divide-gray-600">
          <thead className="bg-gray-700">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">ID</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">Location</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">Stream URL</th>
              {user?.role === 'admin' && (
                <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">Owner</th>
              )}
              {user?.role === 'admin' && (
                <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">FPS</th>
              )}
              {user?.role === 'admin' && (
                <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">Last Frame</th>
              )}
              {user?.role === 'admin' && (
                <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">Created</th>
              )}
              <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-600">
            {cameras.map((camera) => (
              <tr key={camera.id} className="hover:bg-gray-700 transition-colors">
                <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-text">{camera.id}</td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-text-secondary">{camera.name}</td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-text-secondary">{camera.location}</td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-text-secondary">
                  <a href={camera.stream_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Link</a>
                </td>
                {user?.role === 'admin' && (
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-text-secondary">{camera.admin_username || camera.admin_user_id || '—'}</td>
                )}
                {user?.role === 'admin' && (
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-text-secondary">{camera.fps ?? '—'}</td>
                )}
                {user?.role === 'admin' && (
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-text-secondary">{camera.last_frame_time ? new Date(camera.last_frame_time).toLocaleString() : '—'}</td>
                )}
                {user?.role === 'admin' && (
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-text-secondary">{camera.created_at ? new Date(camera.created_at).toLocaleString() : '—'}</td>
                )}
                <td className="px-4 py-3 whitespace-nowrap text-sm text-text-secondary">
                  {(() => {
                    const streaming = camera.streaming_status;
                    const active = camera.is_active;
                    const statusText = streaming || (active ? 'active' : 'inactive');
                    const statusClass = statusText === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';
                    return (
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${statusClass}`}>{statusText}</span>
                    );
                  })()}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm font-medium">
                  {readOnly ? (
                    <span className="text-text-secondary text-xs">Read-only</span>
                  ) : user?.role === 'admin' ? (
                    <>
                      <button onClick={() => setEditingCamera(camera)} className="text-primary hover:text-blue-400 mr-4 transition-colors">Edit</button>
                      <button onClick={() => handleDeleteCamera(camera.id)} className="text-accent hover:text-red-400 transition-colors">Delete</button>
                    </>
                  ) : camera.admin_user_id === user?.id ? (
                    <>
                      <button onClick={() => setEditingCamera(camera)} className="text-primary hover:text-blue-400 mr-4 transition-colors">Edit</button>
                    </>
                  ) : (
                    <span className="text-text-secondary text-xs">No actions</span>
                  )}
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
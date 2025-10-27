import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { toast } from 'react-toastify';

function UserManagement() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'viewer' });
  const [editingUser, setEditingUser] = useState(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const response = await api.get('/users');
      setUsers(response.data);
    } catch (error) {
      toast.error('Failed to fetch users.');
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    if (editingUser) {
      setEditingUser({ ...editingUser, [name]: value });
    } else {
      setNewUser({ ...newUser, [name]: value });
    }
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    try {
      await api.post('/users', newUser);
      toast.success('User added successfully!');
      setNewUser({ username: '', password: '', role: 'viewer' });
      fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to add user.');
      console.error('Error adding user:', error);
    }
  };

  const handleUpdateUser = async (e) => {
    e.preventDefault();
    if (!editingUser) return;
    try {
      
      const userDataToUpdate = { ...editingUser };
      if (!userDataToUpdate.password) {
        delete userDataToUpdate.password;
      }
      await api.put(`/users/${editingUser.id}`, userDataToUpdate);
      toast.success('User updated successfully!');
      setEditingUser(null);
      fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update user.');
      console.error('Error updating user:', error);
    }
  };

  const handleDeleteUser = async (id) => {
    if (window.confirm('Are you sure you want to delete this user?')) {
      try {
        await api.delete(`/users/${id}`);
        toast.success('User deleted successfully!');
        fetchUsers();
      } catch (error) {
        toast.error('Failed to delete user.');
        console.error('Error deleting user:', error);
      }
    }
  };

  if (loading) {
    return <div className="text-text-secondary">Loading users...</div>;
  }

  return (
    <div className="p-4">
      <h1 className="text-3xl font-bold text-primary mb-6">User Management</h1>

      <div className="bg-surface p-6 rounded-lg shadow-md mb-8">
        <h2 className="text-2xl font-semibold text-text mb-4">{editingUser ? 'Edit User' : 'Add New User'}</h2>
        <form onSubmit={editingUser ? handleUpdateUser : handleAddUser} className="space-y-4">
          <div>
            <label htmlFor="username" className="block text-text-secondary text-sm font-bold mb-2">
              Username
            </label>
            <input
              type="text"
              id="username"
              name="username"
              className="shadow appearance-none border rounded w-full py-2 px-3 text-text leading-tight focus:outline-none focus:shadow-outline bg-gray-600 border-gray-500"
              value={editingUser ? editingUser.username : newUser.username}
              onChange={handleInputChange}
              required
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-text-secondary text-sm font-bold mb-2">
              Password {editingUser && <span className="text-xs text-gray-400">(Leave blank to keep current)</span>}
            </label>
            <input
              type="password"
              id="password"
              name="password"
              className="shadow appearance-none border rounded w-full py-2 px-3 text-text leading-tight focus:outline-none focus:shadow-outline bg-gray-600 border-gray-500"
              value={editingUser ? editingUser.password || '' : newUser.password}
              onChange={handleInputChange}
              required={!editingUser} // Password is only required for new users
            />
          </div>
          <div>
            <label htmlFor="role" className="block text-text-secondary text-sm font-bold mb-2">
              Role
            </label>
            <select
              id="role"
              name="role"
              className="shadow appearance-none border rounded w-full py-2 px-3 text-text leading-tight focus:outline-none focus:shadow-outline bg-gray-600 border-gray-500"
              value={editingUser ? editingUser.role : newUser.role}
              onChange={handleInputChange}
            >
              <option value="admin">Admin</option>
              <option value="security">Security</option>
              <option value="viewer">Viewer</option>
            </select>
          </div>
          <div className="flex space-x-4">
            <button
              type="submit"
              className="bg-primary hover:bg-blue-600 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline transition-colors"
            >
              {editingUser ? 'Update User' : 'Add User'}
            </button>
            {editingUser && (
              <button
                type="button"
                onClick={() => setEditingUser(null)}
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
                Username
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                Role
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-600">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-gray-700 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-text">
                  {user.id}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-text-secondary">
                  {user.username}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-text-secondary">
                  {user.role}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  <button
                    onClick={() => setEditingUser(user)}
                    className="text-primary hover:text-blue-400 mr-4 transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDeleteUser(user.id)}
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

export default UserManagement;
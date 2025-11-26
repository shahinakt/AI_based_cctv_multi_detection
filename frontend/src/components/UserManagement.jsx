// src/components/UserManagement.jsx
import React, { useState, useEffect } from "react";
import api from "../services/api"; // ✅ default import
import { toast } from "react-toastify";
import { useNavigate } from "react-router-dom";

function UserManagement() {
  const navigate = useNavigate();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  const [newUser, setNewUser] = useState({
    username: "",
    email: "",
    password: "",
    role: "viewer",
  });

  const [editingUser, setEditingUser] = useState(null);

  // ─────────────────────────────
  // Fetch all users (admin only)
  // ─────────────────────────────
  const fetchUsers = async () => {
    try {
      const res = await api.get("/api/v1/users/"); // ✅ matches backend
      console.log("Users from API:", res.data);
      setUsers(res.data);
    } catch (error) {
      console.error("Error fetching users:", error);
      toast.error(
        error.response?.data?.detail || "Failed to fetch users from server."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  // ─────────────────────────────
  // Form change handler
  // ─────────────────────────────
  const handleInputChange = (e) => {
    const { name, value } = e.target;

    if (editingUser) {
      setEditingUser((prev) => ({ ...prev, [name]: value }));
    } else {
      setNewUser((prev) => ({ ...prev, [name]: value }));
    }
  };

  // ─────────────────────────────
  // Add new user (admin creates)
  // ─────────────────────────────
  const handleAddUser = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        username: newUser.username,
        email: newUser.email,
        password: newUser.password,
        role: newUser.role,
      };

      console.log("Add user payload:", payload);

      await api.post("/api/v1/users/", payload); // ✅ POST /api/v1/users/

      toast.success("User added successfully!");
      setNewUser({
        username: "",
        email: "",
        password: "",
        role: "viewer",
      });
      fetchUsers();
    } catch (error) {
      console.error("Error adding user:", error);
      toast.error(
        error.response?.data?.detail || "Failed to add user. Check console."
      );
    }
  };

  // ─────────────────────────────
  // Update user
  // ─────────────────────────────
  const handleUpdateUser = async (e) => {
    e.preventDefault();
    if (!editingUser) return;

    try {
      const userDataToUpdate = { ...editingUser };

      // if password field exists and empty, remove it so backend ignores it
      if ("password" in userDataToUpdate && !userDataToUpdate.password) {
        delete userDataToUpdate.password;
      }

      console.log("Update user payload:", userDataToUpdate);

      await api.put(
        `/api/v1/users/${editingUser.id}`,
        userDataToUpdate
      );

      toast.success("User updated successfully!");
      setEditingUser(null);
      fetchUsers();
    } catch (error) {
      console.error("Error updating user:", error);
      toast.error(
        error.response?.data?.detail || "Failed to update user. Check console."
      );
    }
  };

  // ─────────────────────────────
  // Delete user
  // ─────────────────────────────
  const handleDeleteUser = async (id) => {
    if (!window.confirm("Are you sure you want to delete this user?")) return;

    try {
      await api.delete(`/api/v1/users/${id}`);
      toast.success("User deleted successfully!");
      fetchUsers();
    } catch (error) {
      console.error("Error deleting user:", error);
      toast.error("Failed to delete user. Check console.");
    }
  };

  if (loading) {
    return <div className="text-text-secondary">Loading users...</div>;
  }

  return (
    <div className="p-4">
      <h1 className="text-3xl font-bold text-primary mb-6">User Management</h1>

      {/* Add / Edit form */}
      <div className="bg-surface p-6 rounded-lg shadow-md mb-8">
        <h2 className="text-2xl font-semibold text-text mb-4">
          {editingUser ? "Edit User" : "Add New User"}
        </h2>

        <form
          onSubmit={editingUser ? handleUpdateUser : handleAddUser}
          className="space-y-4"
        >
          {/* Username */}
          <div>
            <label className="block text-text-secondary text-sm font-bold mb-2">
              Username
            </label>
            <input
              type="text"
              name="username"
              className="shadow appearance-none border rounded w-full py-2 px-3 text-text bg-gray-600 border-gray-500"
              value={editingUser ? editingUser.username : newUser.username}
              onChange={handleInputChange}
              required
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-text-secondary text-sm font-bold mb-2">
              Email
            </label>
            <input
              type="email"
              name="email"
              className="shadow appearance-none border rounded w-full py-2 px-3 text-text bg-gray-600 border-gray-500"
              value={editingUser ? editingUser.email || "" : newUser.email}
              onChange={handleInputChange}
              required={!editingUser}
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-text-secondary text-sm font-bold mb-2">
              Password{" "}
              {editingUser && (
                <span className="text-xs text-gray-400">
                  (Leave blank to keep current)
                </span>
              )}
            </label>
            <input
              type="password"
              name="password"
              className="shadow appearance-none border rounded w-full py-2 px-3 text-text bg-gray-600 border-gray-500"
              value={editingUser ? editingUser.password || "" : newUser.password}
              onChange={handleInputChange}
              required={!editingUser}
            />
          </div>

          {/* Role */}
          <div>
            <label className="block text-text-secondary text-sm font-bold mb-2">
              Role
            </label>
            <select
              name="role"
              className="shadow appearance-none border rounded w-full py-2 px-3 text-text bg-gray-600 border-gray-500"
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
              className="bg-primary hover:bg-blue-600 text-white font-bold py-2 px-4 rounded transition-colors"
            >
              {editingUser ? "Update User" : "Add User"}
            </button>
            {editingUser && (
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="bg-secondary hover:bg-gray-600 text-white font-bold py-2 px-4 rounded transition-colors"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Users table */}
      <div className="overflow-x-auto bg-surface rounded-lg shadow-md">
        <table className="min-w-full divide-y divide-gray-600">
          <thead className="bg-gray-700">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                ID
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                Username
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                Email
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                Role
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-600">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-gray-700 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-text">
                  {u.id}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-text-secondary">
                  <button
                    onClick={() => navigate(`/users/${u.id}`)}
                    className="text-blue-400 hover:underline"
                  >
                    {u.username}
                  </button>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-text-secondary">
                  {u.email}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-text-secondary">
                  {u.role}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  <button
                    onClick={() => setEditingUser(u)}
                    className="text-primary hover:text-blue-400 mr-4 transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDeleteUser(u.id)}
                    className="text-accent hover:text-red-400 transition-colors"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}

            {users.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-6 py-4 text-center text-sm text-text-secondary"
                >
                  No users found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default UserManagement;



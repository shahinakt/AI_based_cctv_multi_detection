// src/components/UserManagement.jsx
import React, { useState, useEffect } from "react";
import api from "../services/api"; // ✅ default import
import { toast } from "react-toastify";
import { useNavigate } from "react-router-dom";
import { validateName, validatePhone } from "../utils/validation";

function UserManagement() {
  const navigate = useNavigate();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  const [newUser, setNewUser] = useState({
    username: "",
    email: "",
    password: "",
    role: "viewer",
    full_name: "",
    phone: "",
  });

  const [editingUser, setEditingUser] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({ full_name: null, phone: null });

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
    // Strip non-digits and limit to 10 for phone field
    const sanitised = name === 'phone' ? value.replace(/\D/g, '').slice(0, 10) : value;

    if (editingUser) {
      setEditingUser((prev) => ({ ...prev, [name]: sanitised }));
    } else {
      setNewUser((prev) => ({ ...prev, [name]: sanitised }));
    }

    // Real-time validation for name and phone
    if (name === "full_name") {
      setFieldErrors((prev) => ({ ...prev, full_name: validateName(sanitised) }));
    }
    if (name === "phone") {
      setFieldErrors((prev) => ({ ...prev, phone: validatePhone(sanitised) }));
    }
  };

  // ─────────────────────────────
  // Add new user (admin creates)
  // ─────────────────────────────
  const handleAddUser = async (e) => {
    e.preventDefault();

    // Validate name and phone before submitting
    const nameErr = validateName(newUser.full_name);
    const phoneErr = validatePhone(newUser.phone);
    setFieldErrors({ full_name: nameErr, phone: phoneErr });
    if (nameErr || phoneErr) return;

    try {
      const payload = {
        username: newUser.username,
        email: newUser.email,
        password: newUser.password,
        role: newUser.role,
        ...(newUser.full_name.trim() && { full_name: newUser.full_name.trim() }),
        ...(newUser.phone.trim() && { phone: newUser.phone.trim() }),
      };

      console.log("Add user payload:", payload);

      await api.post("/api/v1/users/", payload); // ✅ POST /api/v1/users/

      toast.success("User added successfully!");
      setNewUser({
        username: "",
        email: "",
        password: "",
        role: "viewer",
        full_name: "",
        phone: "",
      });
      setFieldErrors({ full_name: null, phone: null });
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

    // Validate name and phone before submitting
    const nameErr = validateName(editingUser.full_name || "");
    const phoneErr = validatePhone(editingUser.phone || "");
    setFieldErrors({ full_name: nameErr, phone: phoneErr });
    if (nameErr || phoneErr) return;

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

          {/* Full Name (optional) */}
          <div>
            <label className="block text-text-secondary text-sm font-bold mb-2">
              Full Name <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              name="full_name"
              className={`shadow appearance-none border rounded w-full py-2 px-3 text-text bg-gray-600 ${fieldErrors.full_name ? "border-red-500" : "border-gray-500"}`}
              value={editingUser ? editingUser.full_name || "" : newUser.full_name}
              onChange={handleInputChange}
              placeholder="Letters only"
            />
            {fieldErrors.full_name && (
              <p className="text-red-400 text-xs mt-1">{fieldErrors.full_name}</p>
            )}
          </div>

          {/* Phone Number (optional) */}
          <div>
            <label className="block text-text-secondary text-sm font-bold mb-2">
              Phone Number <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="tel"
              name="phone"
              className={`shadow appearance-none border rounded w-full py-2 px-3 text-text bg-gray-600 ${fieldErrors.phone ? "border-red-500" : "border-gray-500"}`}
              value={editingUser ? editingUser.phone || "" : newUser.phone}
              onChange={handleInputChange}
              placeholder="10-digit number"
              maxLength={10}
              inputMode="numeric"
            />
            {fieldErrors.phone && (
              <p className="text-red-400 text-xs mt-1">{fieldErrors.phone}</p>
            )}
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



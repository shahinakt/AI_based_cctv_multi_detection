import React, { useState } from 'react';
import api from '../services/api';
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';

function Register() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    username: "",
    email: "",
    password: "",
    role: "viewer", // default role
  });

  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setForm({
      ...form,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e) => {
  e.preventDefault();
  setLoading(true);

  try {
    await api.post("/api/v1/auth/register", form);

    toast.success("Registration successful! Please log in.");
    navigate("/login");
  } catch (error) {
    console.error("Registration failed:", error);

    // 🔍 ADD THIS:
    console.log("Register error detail:", error.response?.data);

    toast.error(
      error.response?.data?.detail || "Registration failed. Try again."
    );
  } finally {
    setLoading(false);
  }
};

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="bg-surface p-8 rounded-lg shadow-lg w-full max-w-md">
        <h2 className="text-3xl font-bold text-center text-primary mb-6">
          Create your account
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Username */}
          <div>
            <label className="block text-text-secondary font-bold mb-2">
              Username
            </label>
            <input
              type="text"
              name="username"
              className="border rounded w-full py-2 px-3 bg-gray-700 border-gray-500"
              value={form.username}
              onChange={handleChange}
              required
              disabled={loading}
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-text-secondary font-bold mb-2">
              Email
            </label>
            <input
              type="email"
              name="email"
              className="border rounded w-full py-2 px-3 bg-gray-700 border-gray-500"
              value={form.email}
              onChange={handleChange}
              required
              disabled={loading}
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-text-secondary font-bold mb-2">
              Password
            </label>
            <input
              type="password"
              name="password"
              className="border rounded w-full py-2 px-3 bg-gray-700 border-gray-500"
              value={form.password}
              onChange={handleChange}
              required
              disabled={loading}
            />
          </div>

          {/* Role selection (viewer / security / admin) */}
          <div>
            <label className="block text-text-secondary font-bold mb-2">
              Select Role
            </label>
            <select
              name="role"
              className="border rounded w-full py-2 px-3 bg-gray-700 border-gray-500"
              value={form.role}
              onChange={handleChange}
              required
              disabled={loading}
            >
              <option value="viewer">Viewer</option>
              <option value="security">Security</option>
              
            </select>
          </div>

          {/* Submit button */}
          <button
            type="submit"
            disabled={loading}
            className="bg-primary hover:bg-blue-600 text-white font-bold py-2 px-4 rounded w-full flex justify-center items-center gap-2"
          >
            {loading ? (
              <>
                <span className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"></span>
                Creating...
              </>
            ) : (
              "Register"
            )}
          </button>

          {/* Back to login */}
          <div className="text-center mt-4">
            <button
              type="button"
              onClick={() => navigate("/login")}
              className="text-blue-400 hover:underline"
            >
              Already have an account? Login
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}

export default Register;


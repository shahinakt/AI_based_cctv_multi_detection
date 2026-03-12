import React, { useState } from 'react';
import api from '../services/api';
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';
import { validateName, validatePhone, validatePassword } from '../utils/validation';

function Register() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    username: "",
    email: "",
    password: "",
    role: "viewer",
    full_name: "",
    phone: "",
  });

  const [fieldErrors, setFieldErrors] = useState({ full_name: null, phone: null, password: null });
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    // Strip non-digits and limit to 10 for phone field
    const sanitised = name === 'phone' ? value.replace(/\D/g, '').slice(0, 10) : value;
    setForm((prev) => ({ ...prev, [name]: sanitised }));

    // Validate on change
    if (name === "full_name") {
      setFieldErrors((prev) => ({ ...prev, full_name: validateName(sanitised) }));
    }
    if (name === "phone") {
      setFieldErrors((prev) => ({ ...prev, phone: validatePhone(sanitised) }));
    }
    if (name === "password") {
      setFieldErrors((prev) => ({ ...prev, password: validatePassword(sanitised) }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Final validation pass before submit
    const nameErr = validateName(form.full_name);
    const phoneErr = validatePhone(form.phone);
    const passwordErr = validatePassword(form.password);
    setFieldErrors({ full_name: nameErr, phone: phoneErr, password: passwordErr });
    if (nameErr || phoneErr || passwordErr) return;

    setLoading(true);
    try {
      const payload = {
        username: form.username,
        email: form.email,
        password: form.password,
        role: form.role,
        ...(form.full_name.trim() && { full_name: form.full_name.trim() }),
        ...(form.phone.trim() && { phone: form.phone.trim() }),
      };
      await api.post("/api/v1/auth/register", payload);
      toast.success("Registration successful! Please log in.");
      navigate("/login");
    } catch (error) {
      console.error("Registration failed:", error);
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
              className={`border rounded w-full py-2 px-3 bg-gray-700 ${fieldErrors.password ? "border-red-500" : "border-gray-500"}`}
              value={form.password}
              onChange={handleChange}
              required
              disabled={loading}
              placeholder="At least 8 characters"
            />
            {fieldErrors.password && (
              <p className="text-red-400 text-xs mt-1">{fieldErrors.password}</p>
            )}
          </div>

          {/* Role selection (viewer only) */}
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
              
            </select>
          </div>

          {/* Full Name (optional) */}
          <div>
            <label className="block text-text-secondary font-bold mb-2">
              Full Name <span className="text-gray-400 font-normal text-sm">(optional)</span>
            </label>
            <input
              type="text"
              name="full_name"
              className={`border rounded w-full py-2 px-3 bg-gray-700 ${fieldErrors.full_name ? "border-red-500" : "border-gray-500"}`}
              value={form.full_name}
              onChange={handleChange}
              disabled={loading}
              placeholder="Letters only"
            />
            {fieldErrors.full_name && (
              <p className="text-red-400 text-xs mt-1">{fieldErrors.full_name}</p>
            )}
          </div>

          {/* Phone Number (optional) */}
          <div>
            <label className="block text-text-secondary font-bold mb-2">
              Phone Number <span className="text-gray-400 font-normal text-sm">(optional)</span>
            </label>
            <input
              type="tel"
              name="phone"
              className={`border rounded w-full py-2 px-3 bg-gray-700 ${fieldErrors.phone ? "border-red-500" : "border-gray-500"}`}
              value={form.phone}
              onChange={handleChange}
              disabled={loading}
              placeholder="10-digit number"
              maxLength={10}
              inputMode="numeric"
            />
            {fieldErrors.phone && (
              <p className="text-red-400 text-xs mt-1">{fieldErrors.phone}</p>
            )}
          </div>

          {/* Submit button */}
          <button
            type="submit"
            disabled={loading}
            className="bg-primary hover:brightness-90 text-white font-bold py-2 px-4 rounded w-full flex justify-center items-center gap-2 focus:outline-none"
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

          {/* Back to login - improved UX with role shortcuts */}
          <div className="text-center mt-6">
            <p className="text-sm text-text-secondary mb-3">
              Already have an account?
            </p>

            <div className="flex justify-center items-center gap-3">
              <button
                type="button"
                onClick={() => navigate('/login?role=viewer')}
                className="px-4 py-2 bg-gray-800 text-white rounded-md hover:bg-gray-700 border border-gray-600"
                aria-label="Login as viewer"
              >
                Viewer
              </button>

              <button
                type="button"
                onClick={() => navigate('/login?role=security')}
                className="px-4 py-2 bg-gray-800 text-white rounded-md hover:bg-gray-700 border border-gray-600"
                aria-label="Login as security"
              >
                Security
              </button>

              <button
                type="button"
                onClick={() => navigate('/login?role=admin')}
                className="px-4 py-2 bg-gray-800 text-white rounded-md hover:bg-gray-700 border border-gray-600"
                aria-label="Login as admin"
              >
                Admin
              </button>
            </div>
          </div>

        </form>
      </div>
    </div>
  );
}

export default Register;


import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuthHook';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';

function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false); // 👁️ toggle
  const [loading, setLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(username, password);
      toast.success('Login successful!');
      navigate('/dashboard');
    } catch (error) {
      toast.error(error.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="bg-surface p-8 rounded-lg shadow-lg w-full max-w-md">
        
        <h2 className="text-3xl font-bold text-center text-primary mb-6">Login</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          
          {/* Username */}
          <div>
            <label
              htmlFor="username"
              className="block text-text-secondary text-sm font-bold mb-2"
            >
              Username
            </label>
            <input
              type="text"
              id="username"
              className="shadow appearance-none border rounded w-full py-2 px-3 text-text bg-gray-600 border-gray-500 focus:outline-none focus:shadow-outline"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          {/* Password with Eye Toggle */}
          <div>
            <label
              htmlFor="password"
              className="block text-text-secondary text-sm font-bold mb-2"
            >
              Password
            </label>

            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                id="password"
                className="shadow appearance-none border rounded w-full py-2 px-3 text-text bg-gray-600 border-gray-500 focus:outline-none focus:shadow-outline"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
              />

              <button
  type="button"
  onClick={() => setShowPassword(!showPassword)}
  className="absolute inset-y-0 right-3 flex items-center text-gray-300"
>
  {showPassword ? (
    // 👁️ Visible
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.477 0 8.268 2.943 9.542 7-1.274 4.057-5.065 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  ) : (
    // 🙈 Hidden (eye-slash)
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.477 0-8.268-2.943-9.542-7a10.06 10.06 0 012.285-4.045M9.878 9.878a3 3 0 104.243 4.243M6.18 6.18A9.956 9.956 0 0112 5c4.477 0 8.268 2.943 9.542 7a10.06 10.06 0 01-4.274 5.058M3 3l18 18" />
    </svg>
  )}
</button>

            </div>
          </div>

          {/* Submit Button With Spinner */}
          <button
            type="submit"
            className="bg-primary text-white font-bold py-2 px-4 rounded w-full flex justify-center items-center gap-2 hover:bg-blue-600 transition-colors"
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"></span>
                Logging in...
              </>
            ) : (
              "Sign In"
            )}
          </button>

        </form>

        {/* Register Redirect */}
        <div className="text-center mt-4">
          <button
            onClick={() => navigate('/register')}
            className="text-blue-400 hover:underline"
          >
            Don’t have an account? Register
          </button>
        </div>

      </div>
    </div>
  );
}

export default Login;

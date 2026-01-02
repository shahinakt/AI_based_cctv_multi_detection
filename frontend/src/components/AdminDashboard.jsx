import React, { useEffect, useState, useContext } from "react";
import { useAuth } from '../hooks/useAuthHook';
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import { toast } from "react-toastify";

function StatCard({ label, value, subtitle }) {
  return (
    <div className="bg-surface rounded-xl shadow-md p-5 flex flex-col gap-1">
      <span className="text-sm text-text-secondary uppercase tracking-wide">
        {label}
      </span>
      <span className="text-3xl font-bold text-primary">{value}</span>
      {subtitle && (
        <span className="text-xs text-text-secondary">{subtitle}</span>
      )}
    </div>
  );
}

function ActionCard({ title, description, onClick }) {
  return (
    <button
      onClick={onClick}
      className="bg-surface border border-gray-700 hover:border-primary rounded-xl p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg"
    >
      <h3 className="text-lg font-semibold text-text mb-1">{title}</h3>
      <p className="text-sm text-text-secondary">{description}</p>
    </button>
  );
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    cameras: 0,
    incidents: 0,
    users: 0,
    openIncidents: 0,
  });
  const [loading, setLoading] = useState(true);
  const [cameras, setCameras] = useState([]);
  const [camerasReadOnly, setCamerasReadOnly] = useState(false);
  const [authError, setAuthError] = useState(false);

  const { loading: authLoading } = useAuth();

  useEffect(() => {
    // Wait for auth initialization so API requests include tokens
    if (authLoading) return;
    const loadStats = async () => {
      setLoading(true);

      const next = {
        cameras: 0,
        incidents: 0,
        users: 0,
        openIncidents: 0,
      };

      // --- Cameras ---
      try {
        console.log("📡 Fetching cameras from /api/v1/cameras/...");
        const camsRes = await api.get("/api/v1/cameras/");
        const camsData = camsRes.data || [];
        console.log(`✅ Fetched ${camsData.length} cameras`);
        next.cameras = camsData.length;
        // populate cameras state so admin can preview feeds
        setCameras(camsData);
        setCamerasReadOnly(false);
        // Enrich owner username if missing
        if (camsData.some((c) => !c.admin_username && c.admin_user_id)) {
          try {
            const usersRes = await api.get('/api/v1/users/');
            const users = usersRes.data || [];
            const userMap = Object.fromEntries(users.map(u => [u.id, u.username]));
            setCameras(prev => prev.map(c => ({ ...c, admin_username: c.admin_username || userMap[c.admin_user_id] })));
          } catch (uerr) {
            console.warn('Could not fetch users to enrich camera owner names:', uerr?.message || uerr);
          }
        }
      } catch (err) {
        console.error("❌ Failed to fetch cameras:", err);
        console.error("   Error response:", err?.response);
        console.error("   Error message:", err?.message);
        
        // If unauthorized, surface a clear message so user can login
        const status = err?.response?.status;
        if (status === 401 || status === 403) {
          setAuthError(true);
          toast.error('Authentication required. Please log in as admin.');
        }
        
        // Try legacy public endpoint as a fallback so the admin can at least view camera list
        try {
          console.log("📡 Trying legacy /cameras/ endpoint...");
          const legacy = await api.get('/cameras/');
          const legacyData = legacy.data || [];
          console.log(`✅ Legacy endpoint returned ${legacyData.length} cameras`);
          next.cameras = legacyData.length;
          setCameras(legacyData);
          setCamerasReadOnly(true);
          // Attempt to enrich owner username if possible
          if (legacyData.some((c) => !c.admin_username && c.admin_user_id)) {
            try {
              const usersRes = await api.get('/api/v1/users/');
              const users = usersRes.data || [];
              const userMap = Object.fromEntries(users.map(u => [u.id, u.username]));
              setCameras(prev => prev.map(c => ({ ...c, admin_username: c.admin_username || userMap[c.admin_user_id] })));
            } catch (uerr) {
              console.warn('Could not fetch users to enrich camera owner names (legacy):', uerr?.message || uerr);
            }
          }
          if (status !== 401 && status !== 403) {
            toast.info('Showing public camera list (read-only). Log in as admin to enable management actions.');
          }
        } catch (legacyErr) {
          console.error("❌ Legacy endpoint also failed:", legacyErr);
          // Surface backend detail (401/403/500) to help debugging
          const serverMsg = err?.response?.data?.detail || err?.response?.data?.message || err?.message || "Network Error";
          const errorMsg = err?.message === "Network Error" 
            ? "Cannot connect to backend server. Please ensure the backend is running on http://127.0.0.1:8000"
            : serverMsg;
          console.error("Final error message:", errorMsg);
          toast.error(`Failed to load cameras: ${errorMsg}`);
        }
      }

      // --- Incidents ---
      try {
        const incRes = await api.get("/api/v1/incidents");
        const incidents = incRes.data || [];
        next.incidents = incidents.length;
        next.openIncidents = incidents.filter((i) => !i.acknowledged).length;
      } catch (err) {
        console.error("Failed to load incidents for stats", err);
        toast.error("Failed to load incidents for dashboard");
      }

      // --- Users ---
      try {
        const usersRes = await api.get("/api/v1/users/");
        const users = usersRes.data || [];
        next.users = users.length;
      } catch (err) {
        console.error("Failed to load users for stats", err);
        toast.error("Failed to load users for dashboard");
      }

      setStats(next);
      setLoading(false);
    };

    loadStats();
  }, [authLoading]);


  return (
    <div className="p-6 space-y-8">
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-primary">Admin Dashboard</h1>
          <p className="text-text-secondary mt-1">
            Full control over cameras, incidents and users.
          </p>
        </div>
      </header>

      {/* Top stats */}
      <section>
        {loading ? (
          <p className="text-text-secondary">Loading statistics...</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <StatCard
              label="Total Cameras"
              value={stats.cameras}
              subtitle="Configured in the system"
            />
            <StatCard
              label="Total Incidents"
              value={stats.incidents}
              subtitle="All time"
            />
            <StatCard
              label="Open Incidents"
              value={stats.openIncidents}
              subtitle="Not yet acknowledged"
            />
            <StatCard
              label="Users"
              value={stats.users}
              subtitle="Admins, security & viewers"
            />
          </div>
        )}
      </section>

      {/* All cameras list (read-only) */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-text">All Cameras</h2>
        {loading ? (
          <p className="text-text-secondary">Loading cameras...</p>
        ) : cameras && cameras.length > 0 ? (
          <div>
            {camerasReadOnly && (
              <div className="p-3 text-sm text-text-secondary">Showing public camera list (read-only). Log in as admin to enable management actions.</div>
            )}
            <div className="overflow-x-auto bg-surface rounded-lg shadow-md">
            <table className="min-w-full divide-y divide-gray-600">
              <thead className="bg-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">ID</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">Location</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">Stream URL</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">Owner</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-600">
                {cameras.map((cam) => (
                  <tr key={cam.id} className="hover:bg-gray-700 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-text">{cam.id}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-text-secondary">{cam.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-text-secondary">{cam.location}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-text-secondary">
                      <a href={cam.stream_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Link</a>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-text-secondary">{cam.admin_username || cam.admin_user_id || '—'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-text-secondary">
                      {(() => {
                        const streaming = cam.streaming_status;
                        const active = cam.is_active;
                        const statusText = streaming || (active ? 'active' : 'inactive');
                        const statusClass = statusText === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';
                        return (
                          <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${statusClass}`}>{statusText}</span>
                        );
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        ) : (
          <p className="text-text-secondary">No cameras configured or available.</p>
        )}
      </section>

      {/* Cameras are managed on the separate "Manage Cameras" page. */}

      {/* Quick actions */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-text">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ActionCard
            title="Manage Cameras"
            description="Add, edit or remove cameras and adjust sensitivity."
            onClick={() => navigate("/cameras")}
          />
          <ActionCard
            title="Review Incidents"
            description="View all incidents, verify abuse/theft/accident events."
            onClick={() => navigate("/incidents")}
          />
          <ActionCard
            title="Manage Users"
            description="Promote security staff, create viewer accounts."
            onClick={() => navigate("/users")}
          />
        </div>
      </section>

      {/* System overview removed per admin UX request */}
    </div>
  );
}


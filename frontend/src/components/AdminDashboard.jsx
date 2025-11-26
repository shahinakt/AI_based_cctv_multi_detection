import React, { useEffect, useState } from "react";
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

  useEffect(() => {
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
        const camsRes = await api.get("/api/v1/cameras");
        const cameras = camsRes.data || [];
        next.cameras = cameras.length;
      } catch (err) {
        console.error("Failed to load cameras for stats", err);
        toast.error("Failed to load cameras for dashboard");
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
  }, []);


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

      {/* System overview placeholder */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-text">System Overview</h2>
        <div className="bg-surface rounded-xl p-5 shadow-md">
          <p className="text-text-secondary text-sm">
            Here you can later plug in charts (incidents per day, camera
            uptime, model version metrics, etc.). For now this is just a clean
            placeholder container.
          </p>
        </div>
      </section>
    </div>
  );
}


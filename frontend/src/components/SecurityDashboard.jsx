// src/components/SecurityDashboard.jsx
import React, { useEffect, useState } from "react";
import api from "../services/api";
import { toast } from "react-toastify";

function IncidentCard({ incident }) {
  const severityColor =
    incident.severity === "critical"
      ? "text-red-400"
      : incident.severity === "high"
      ? "text-orange-400"
      : incident.severity === "medium"
      ? "text-yellow-400"
      : "text-green-400";

  return (
    <div className="bg-surface rounded-xl p-4 shadow-sm border border-gray-700 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm text-text-secondary">
          #{incident.id} • Camera {incident.camera_id}
        </span>
        <span className={`text-xs font-semibold uppercase ${severityColor}`}>
          {incident.severity}
        </span>
      </div>
      <p className="text-text font-medium">
        {incident.type.replace("_", " ")}
      </p>
      {incident.description && (
        <p className="text-sm text-text-secondary">
          {incident.description}
        </p>
      )}
      <p className="text-xs text-text-secondary mt-1">
        {new Date(incident.timestamp).toLocaleString()}
      </p>

      {/* Evidence preview – read-only */}
      {incident.evidence_items && incident.evidence_items.length > 0 && (
        <div className="mt-2 border-t border-gray-700 pt-2">
          <p className="text-xs font-semibold text-text-secondary mb-1">
            Evidence ({incident.evidence_items.length})
          </p>
          <div className="flex flex-wrap gap-2">
            {incident.evidence_items.map((ev) => (
              <span
                key={ev.id}
                className="text-xs bg-gray-700 rounded px-2 py-1"
              >
                {ev.file_type} • {ev.sha256_hash.slice(0, 8)}…
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function SecurityDashboard() {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadIncidents = async () => {
      try {
        const res = await getIncidents();
        if (res.success) setIncidents(res.data || []);
        else toast.error(res.message || 'Failed to fetch incidents');
      } catch (err) {
        console.error("Failed to load incidents", err);
        toast.error("Failed to fetch incidents");
      } finally {
        setLoading(false);
      }
    };

    loadIncidents();
  }, []);

  return (
    <div className="p-6 space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-primary">Security Dashboard</h1>
        <p className="text-text-secondary mt-1">
          Read-only view of incidents and their evidence.
        </p>
      </header>

      <section>
        <h2 className="text-xl font-semibold text-text mb-3">
          Recent Incidents
        </h2>

        {loading ? (
          <p className="text-text-secondary">Loading incidents...</p>
        ) : incidents.length === 0 ? (
          <p className="text-text-secondary">No incidents found.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {incidents.map((incident) => (
              <IncidentCard key={incident.id} incident={incident} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

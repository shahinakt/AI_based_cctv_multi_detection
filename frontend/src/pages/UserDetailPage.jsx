import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../services/api";
import { toast } from "react-toastify";

export default function UserDetailPage() {
  const { id } = useParams(); // user id from URL
  const [user, setUser] = useState(null);
  const [cameras, setCameras] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchOverview = async () => {
      try {
        const res = await api.get(`/api/v1/users/${id}/overview`);
        setUser(res.data.user);
        setCameras(res.data.cameras || []);
        setIncidents(res.data.incidents || []);
      } catch (err) {
        console.error("Failed to fetch user overview:", err);
        toast.error("Failed to load user data.");
      } finally {
        setLoading(false);
      }
    };

    fetchOverview();
  }, [id]);

  const handleDeleteCamera = async (cameraId) => {
    if (!window.confirm("Delete this camera?")) return;
    try {
      await api.delete(`/api/v1/cameras/${cameraId}`);
      setCameras((prev) => prev.filter((c) => c.id !== cameraId));
      toast.success("Camera deleted");
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete camera");
    }
  };

  const handleDeleteIncident = async (incidentId) => {
    if (!window.confirm("Delete this incident?")) return;
    try {
      await api.delete(`/api/v1/incidents/${incidentId}`);
      setIncidents((prev) => prev.filter((i) => i.id !== incidentId));
      toast.success("Incident deleted");
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete incident");
    }
  };

  if (loading) return <div className="p-4 text-white">Loading...</div>;
  if (!user) return <div className="p-4 text-white">User not found.</div>;

  return (
    <div className="p-8 text-white min-h-screen bg-background space-y-8">
      {/* User header */}
      <section>
        <h1 className="text-2xl font-bold">
          User: {user.username}{" "}
          <span className="text-sm text-gray-400">({user.role})</span>
        </h1>
        <p className="text-gray-300 mt-1">Email: {user.email}</p>
      </section>

      {/* Cameras table */}
      <section>
        <h2 className="text-xl font-semibold mb-2">Cameras owned</h2>
        <div className="bg-surface rounded-xl shadow overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-700">
              <tr>
                <th className="px-4 py-2 text-left">ID</th>
                <th className="px-4 py-2 text-left">Name</th>
                <th className="px-4 py-2 text-left">Location</th>
                <th className="px-4 py-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {cameras.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-3 text-center text-gray-400"
                  >
                    No cameras for this user.
                  </td>
                </tr>
              )}
              {cameras.map((cam) => (
                <tr
                  key={cam.id}
                  className="border-t border-gray-700 hover:bg-gray-800"
                >
                  <td className="px-4 py-2">{cam.id}</td>
                  <td className="px-4 py-2">{cam.name}</td>
                  <td className="px-4 py-2">{cam.location}</td>
                  <td className="px-4 py-2">
                    {/* You can add Edit later */}
                    <button
                      onClick={() => handleDeleteCamera(cam.id)}
                      className="text-red-400 hover:text-red-300 text-xs"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Incidents table */}
      <section>
        <h2 className="text-xl font-semibold mb-2">Incidents</h2>
        <div className="bg-surface rounded-xl shadow overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-700">
              <tr>
                <th className="px-4 py-2 text-left">ID</th>
                <th className="px-4 py-2 text-left">Camera</th>
                <th className="px-4 py-2 text-left">Type</th>
                <th className="px-4 py-2 text-left">Severity</th>
                <th className="px-4 py-2 text-left">Score</th>
                <th className="px-4 py-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {incidents.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-3 text-center text-gray-400"
                  >
                    No incidents for this user.
                  </td>
                </tr>
              )}
              {incidents.map((inc) => (
                <tr
                  key={inc.id}
                  className="border-t border-gray-700 hover:bg-gray-800"
                >
                  <td className="px-4 py-2">{inc.id}</td>
                  <td className="px-4 py-2">{inc.camera_id}</td>
                  <td className="px-4 py-2">{inc.type}</td>
                  <td className="px-4 py-2">{inc.severity}</td>
                  <td className="px-4 py-2">{inc.severity_score}</td>
                  <td className="px-4 py-2">
                    <button
                      onClick={() => handleDeleteIncident(inc.id)}
                      className="text-red-400 hover:text-red-300 text-xs"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

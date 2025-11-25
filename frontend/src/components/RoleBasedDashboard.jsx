// src/components/RoleBasedDashboard.jsx
import React from "react";
import { useAuth } from "../hooks/useAuthHook";
import Dashboard from "./Dashboard"; // your existing viewer dashboard
import AdminDashboard from "./AdminDashboard";
import SecurityDashboard from "./SecurityDashboard";

export default function RoleBasedDashboard() {
  const { user } = useAuth();

  if (!user) return null;

  if (user.role === "admin") {
    return <AdminDashboard />;
  }

  if (user.role === "security") {
    return <SecurityDashboard />;
  }

  // default: viewer uses your existing dashboard UI
  return <Dashboard />;
}

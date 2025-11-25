import React from "react";
import { IncidentProvider } from "../services/socket";
import RoleBasedDashboard from "../components/RoleBasedDashboard";

function DashboardPage() {
  return (
    <IncidentProvider>
      <RoleBasedDashboard />
    </IncidentProvider>
  );
}

export default DashboardPage;

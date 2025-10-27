import React from 'react';
import Dashboard from '../components/Dashboard';
import { IncidentProvider } from '../services/socket'; 

function DashboardPage() {
  return (
    <IncidentProvider> {/* Wrap Dashboard with IncidentProvider */}
      <Dashboard />
    </IncidentProvider>
  );
}

export default DashboardPage;
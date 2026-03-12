import React from 'react';
import IncidentList from '../components/IncidentList';
import { IncidentProvider } from '../services/socket';

function IncidentsPage() {
  return (
    <IncidentProvider>
      <div className="p-4">
        <IncidentList />
      </div>
    </IncidentProvider>
  );
}

export default IncidentsPage;
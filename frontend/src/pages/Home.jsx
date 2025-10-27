import React from 'react';
import { Link } from 'react-router-dom';

function HomePage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-160px)] text-center p-4">
      <h1 className="text-5xl font-extrabold text-primary mb-6">
        AI-Powered Hybrid CCTV System
      </h1>
      <p className="text-xl text-text-secondary mb-8 max-w-2xl">
        Proactive monitoring and rapid response for abuse, theft, and health emergencies,
        secured with blockchain for tamper-proof evidence.
      </p>
      <div className="flex space-x-4">
        <Link
          to="/dashboard"
          className="bg-primary hover:bg-blue-600 text-white font-bold py-3 px-8 rounded-lg text-lg transition-colors shadow-lg"
        >
          View Dashboard
        </Link>
        <Link
          to="/incidents"
          className="bg-secondary hover:bg-gray-600 text-white font-bold py-3 px-8 rounded-lg text-lg transition-colors shadow-lg"
        >
          Browse Incidents
        </Link>
      </div>
    </div>
  );
}

export default HomePage;
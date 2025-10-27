import React from 'react';
import { Outlet, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuthHook';
import NotificationToast from './NotificationToast'; 

function Layout() {
  const { isAuthenticated, logout, user } = useAuth();

  return (
    <div className="min-h-screen flex flex-col bg-background text-text">
      <header className="bg-surface shadow-md p-4 flex justify-between items-center">
        <Link to="/" className="text-2xl font-bold text-primary">
          AI-CCTV System
        </Link>
        <nav>
          {isAuthenticated ? (
            <ul className="flex space-x-4 items-center">
              <li>
                <Link to="/dashboard" className="hover:text-primary transition-colors">
                  Dashboard
                </Link>
              </li>
              <li>
                <Link to="/incidents" className="hover:text-primary transition-colors">
                  Incidents
                </Link>
              </li>
              {(user?.role === 'admin' || user?.role === 'security') && (
                <li>
                  <Link to="/cameras" className="hover:text-primary transition-colors">
                    Cameras
                  </Link>
                </li>
              )}
              {user?.role === 'admin' && (
                <li>
                  <Link to="/users" className="hover:text-primary transition-colors">
                    Users
                  </Link>
                </li>
              )}
              <li>
                <button onClick={logout} className="bg-accent text-white px-4 py-2 rounded-md hover:bg-red-600 transition-colors">
                  Logout
                </button>
              </li>
            </ul>
          ) : (
            <Link to="/login" className="bg-primary text-white px-4 py-2 rounded-md hover:bg-blue-600 transition-colors">
              Login
            </Link>
          )}
        </nav>
      </header>
      <main className="flex-grow container mx-auto p-4">
        <Outlet />
      </main>
      <footer className="bg-surface shadow-md p-4 text-center text-text-secondary">
        &copy; {new Date().getFullYear()} AI-CCTV System. All rights reserved.
      </footer>
      <NotificationToast />
    </div>
  );
}

export default Layout;
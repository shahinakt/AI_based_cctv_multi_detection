import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuthHook';
import Layout from './components/Layout';
import HomePage from './pages/Home';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import IncidentsPage from './pages/IncidentsPage';
import CamerasPage from './pages/CamerasPage';
import UsersPage from './pages/UsersPage';

function PrivateRoute({ children, roles }) {
  const { isAuthenticated, user } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (roles && user && !roles.includes(user.role)) {
   
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route
            path="dashboard"
            element={
              <PrivateRoute>
                <DashboardPage />
              </PrivateRoute>
            }
          />
          <Route
            path="incidents"
            element={
              <PrivateRoute>
                <IncidentsPage />
              </PrivateRoute>
            }
          />
          <Route
            path="cameras"
            element={
              <PrivateRoute roles={['admin', 'security']}>
                <CamerasPage />
              </PrivateRoute>
            }
          />
          <Route
            path="users"
            element={
              <PrivateRoute roles={['admin']}>
                <UsersPage />
              </PrivateRoute>
            }
          />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
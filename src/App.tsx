import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AuthGuard } from './components/AuthGuard';
import { Layout } from './components/Layout';
import { Landing } from './pages/Landing';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { AttendancePage } from './pages/Attendance';
import { Management } from './pages/Management';
import { ChangePassword } from './pages/ChangePassword';

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <Router>
          <Routes>
            {/* Public Routes */}
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />

            {/* Protected Routes */}
            <Route
              path="/dashboard"
              element={
                <AuthGuard>
                  <Layout>
                    <Dashboard />
                  </Layout>
                </AuthGuard>
              }
            />
            <Route
              path="/attendance"
              element={
                <AuthGuard>
                  <Layout>
                    <AttendancePage />
                  </Layout>
                </AuthGuard>
              }
            />
            <Route
              path="/management"
              element={
                <AuthGuard allowedRoles={['admin', 'it_coordinator']}>
                  <Layout>
                    <Management />
                  </Layout>
                </AuthGuard>
              }
            />
            <Route
              path="/students"
              element={
                <AuthGuard allowedRoles={['admin', 'it_coordinator']}>
                  <Layout>
                    <Management />
                  </Layout>
                </AuthGuard>
              }
            />
            <Route
              path="/classes"
              element={
                <AuthGuard allowedRoles={['admin', 'it_coordinator']}>
                  <Layout>
                    <Management />
                  </Layout>
                </AuthGuard>
              }
            />
            <Route
              path="/change-password"
              element={
                <AuthGuard>
                  <ChangePassword />
                </AuthGuard>
              }
            />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Router>
      </AuthProvider>
    </ErrorBoundary>
  );
}

import React from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { AcademicYearProvider } from './contexts/AcademicYearContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AuthGuard } from './components/AuthGuard';
import { Layout } from './components/Layout';
import { Landing } from './pages/Landing';
import { Login } from './pages/Login';
import { ForgotPassword } from './pages/ForgotPassword';
import { Register } from './pages/Register';
import { Dashboard } from './pages/Dashboard';
import { AttendancePage } from './pages/Attendance';
import { Management } from './pages/Management';
import { Reports } from './pages/Reports';
import { Settings } from './pages/Settings';
import { ChangePassword } from './pages/ChangePassword';

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AcademicYearProvider>
          <Router>
            <Routes>
              {/* Public Routes */}
              <Route path="/" element={<Landing />} />
              <Route path="/login" element={<Login />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/register" element={<Register />} />

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
                path="/reports"
                element={
                  <AuthGuard allowedRoles={['admin', 'it_coordinator', 'teacher']}>
                    <Layout>
                      <Reports />
                    </Layout>
                  </AuthGuard>
                }
              />
              <Route
                path="/settings"
                element={
                  <AuthGuard allowedRoles={['admin', 'it_coordinator']}>
                    <Layout>
                      <Settings />
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
        </AcademicYearProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

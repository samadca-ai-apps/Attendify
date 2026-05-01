import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useAcademicYear } from '../contexts/AcademicYearContext';
import { auth } from '../firebase';
import { LogOut, LayoutDashboard, ClipboardCheck, Settings, Menu, X, FileText, ShieldCheck, User, Key, Calendar } from 'lucide-react';
import { CURRENT_ACADEMIC_YEAR } from '../contexts/AcademicYearContext';

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { appUser, school } = useAuth();
  const { academicYear, setAcademicYear } = useAcademicYear();
  const navigate = useNavigate();
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (appUser && (appUser.role === 'teacher') && academicYear !== CURRENT_ACADEMIC_YEAR) {
      setAcademicYear(CURRENT_ACADEMIC_YEAR);
    }
  }, [appUser, setAcademicYear, academicYear]);

  useEffect(() => {
    if (appUser && (appUser.role === 'admin' || appUser.role === 'it_coordinator')) {
      setAcademicYear(CURRENT_ACADEMIC_YEAR);
    }
  }, [appUser, setAcademicYear]);

  // Determine if user can edit academic year
  const canEditAcademicYear = appUser?.role === 'admin' || appUser?.role === 'it_coordinator';

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    await auth.signOut();
    navigate('/login');
  };

  const navItems = [
    { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard, roles: ['admin', 'it_coordinator', 'teacher'] },
    { label: 'Attendance', path: '/attendance', icon: ClipboardCheck, roles: ['admin', 'it_coordinator', 'teacher'] },
    { label: 'Management', path: '/management', icon: ShieldCheck, roles: ['admin', 'it_coordinator'] },
    { label: 'Reports', path: '/reports', icon: FileText, roles: ['admin', 'it_coordinator', 'teacher'] },
  ];

  const filteredNavItems = navItems.filter(item => 
    appUser && item.roles.includes(appUser.role)
  );

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center">
              <Link to="/dashboard" className="flex items-center gap-2">
                <div className="bg-blue-600 p-2 rounded-lg">
                  <ClipboardCheck className="h-6 w-6 text-white" />
                </div>
                <span className="text-xl font-bold text-gray-900 hidden sm:block">
                  {school?.name || 'Attendify'}
                </span>
              </Link>
            </div>

            <nav className="hidden md:flex space-x-4">
              {filteredNavItems.map(item => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    location.pathname === item.path
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-600 hover:text-blue-600 hover:bg-blue-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </div>
                </Link>
              ))}
            </nav>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5">
                <Calendar className="h-4 w-4 text-gray-500" />
                {canEditAcademicYear ? (
                  <select 
                    value={academicYear} 
                    onChange={(e) => setAcademicYear(e.target.value)}
                    className="bg-transparent text-sm font-medium text-gray-700 outline-none"
                  >
                    <option value="2024-2025">2024-2025</option>
                    <option value="2025-2026">2025-2026</option>
                  </select>
                ) : (
                  <span className="text-sm font-medium text-gray-700">{academicYear}</span>
                )}
              </div>
              <div className="relative" ref={userMenuRef}>
                <button
                  onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                  className="flex items-center gap-2 p-2 rounded-full hover:bg-gray-100 transition-colors"
                >
                  <div className="flex flex-col items-end">
                    <span className="text-sm font-medium text-gray-900">{appUser?.name}</span>
                    <span className="text-xs text-gray-500 capitalize">{appUser?.role.replace('_', ' ')}</span>
                  </div>
                  <User className="h-8 w-8 p-1.5 bg-gray-100 rounded-full text-gray-600" />
                </button>

                {isUserMenuOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-50">
                    <Link
                      to="/settings"
                      className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      onClick={() => setIsUserMenuOpen(false)}
                    >
                      <Settings className="h-4 w-4" /> Settings
                    </Link>
                    <Link
                      to="/change-password"
                      className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      onClick={() => setIsUserMenuOpen(false)}
                    >
                      <Key className="h-4 w-4" /> Change Password
                    </Link>
                    <button
                      onClick={handleLogout}
                      className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                    >
                      <LogOut className="h-4 w-4" /> Logout
                    </button>
                  </div>
                )}
              </div>
              <button
                className="md:hidden p-2 text-gray-500 hover:bg-gray-100 rounded-lg"
                onClick={() => setIsMenuOpen(!isMenuOpen)}
              >
                {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Menu */}
        {isMenuOpen && (
          <div className="md:hidden bg-white border-t border-gray-100 py-2 px-4 space-y-1">
            {filteredNavItems.map(item => (
              <Link
                key={item.path}
                to={item.path}
                className={`block px-3 py-2 rounded-md text-base font-medium ${
                  location.pathname === item.path
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:text-blue-600 hover:bg-blue-50'
                }`}
                onClick={() => setIsMenuOpen(false)}
              >
                <div className="flex items-center gap-3">
                  <item.icon className="h-5 w-5" />
                  {item.label}
                </div>
              </Link>
            ))}
            <div className="border-t border-gray-100 pt-2 mt-2">
              <Link to="/settings" className="block px-3 py-2 text-base font-medium text-gray-600 hover:bg-gray-50" onClick={() => setIsMenuOpen(false)}>Settings</Link>
              <Link to="/change-password" className="block px-3 py-2 text-base font-medium text-gray-600 hover:bg-gray-50" onClick={() => setIsMenuOpen(false)}>Change Password</Link>
              <button onClick={handleLogout} className="block w-full text-left px-3 py-2 text-base font-medium text-red-600 hover:bg-red-50">Logout</button>
            </div>
          </div>
        )}
      </header>

      <main className="flex-grow max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>

      <footer className="bg-white border-t border-gray-200 py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-gray-500 text-sm">
          &copy; {new Date().getFullYear()} {school?.name || 'Attendify'} School Management. All rights reserved.
        </div>
      </footer>
    </div>
  );
};

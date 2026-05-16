import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase';
import { ClipboardCheck, User, Lock, ArrowRight } from 'lucide-react';

export const Landing: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const loginId = formData.get('loginId') as string;
    const password = formData.get('password') as string;

    try {
      // If the input contains '@', treat it as an email, otherwise construct the teacher email
      const loginEmail = loginId.includes('@') ? loginId : `${loginId}@attendify.com`;
      await signInWithEmailAndPassword(auth, loginEmail, password);
      navigate('/dashboard');
    } catch (err: any) {
      setError('Invalid School Code/Teacher ID or password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Hero Section */}
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between w-full">
        <div className="flex items-center gap-2">
          <div className="bg-blue-600 p-2 rounded-lg shadow-lg">
            <ClipboardCheck className="h-6 w-6 text-white" />
          </div>
          <span className="text-2xl font-bold text-gray-900">Attendify</span>
        </div>
        <Link to="/register" className="text-sm font-semibold text-blue-600 hover:text-blue-700">
          Register School
        </Link>
      </nav>

      <main className="flex-grow flex flex-col lg:flex-row">
        <div className="lg:w-1/2 bg-blue-600 p-12 lg:p-24 flex flex-col justify-center text-white">
          <h1 className="text-[33px] font-extrabold mb-6 leading-tight">
            Manage School Attendance with Ease.
          </h1>
          <p className="text-xl text-blue-100 mb-12 max-w-lg">
            The most comprehensive multi-tenant attendance tracking system for modern schools. Secure, scalable, and easy to use.
          </p>
        </div>

        <div className="lg:w-1/2 p-12 lg:p-24 flex flex-col justify-center bg-gray-50">
          <div className="max-w-md mx-auto w-full">
            <h2 className="text-3xl font-bold text-gray-900 mb-2">Sign In</h2>
            <p className="text-gray-600 mb-8">Enter your School Code/Teacher ID and password to access your account.</p>

            {error && (
              <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6 text-red-700 text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-4">
                <div className="relative">
                  <User className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                  <input
                    name="loginId"
                    type="text"
                    required
                    placeholder="School Code / Teacher ID"
                    className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                  />
                </div>

                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                  <input
                    name="password"
                    type="password"
                    required
                    placeholder="Password"
                    className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                ) : (
                  <>
                    Sign In
                    <ArrowRight className="h-5 w-5" />
                  </>
                )}
              </button>
            </form>

            <div className="mt-8 text-center">
              <p className="text-gray-500 text-sm">
                Don't have a school account?{' '}
                <Link to="/register" className="text-blue-600 font-semibold hover:text-blue-700">
                  Register Your School
                </Link>
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

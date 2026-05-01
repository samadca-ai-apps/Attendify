import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { User as UserType } from '../types';
import { ClipboardCheck, Building2, UserCircle, User as UserIcon, Mail, Lock, CheckCircle2, ArrowRight } from 'lucide-react';

export const Register: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const schoolName = formData.get('schoolName') as string;
    const address = formData.get('address') as string;
    const contactPerson = formData.get('contactPerson') as string;
    const schoolCode = formData.get('schoolCode') as string;
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    try {
      // 1. Create Auth User (using the provided email)
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const uid = userCredential.user.uid;

      // 2. Create School Record
      const schoolId = `SCH-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
      const schoolData: any = {
        schoolId,
        name: schoolName,
        address,
        contactPerson,
        schoolCode,
        email, // Save the original email
        createdBy: uid,
        createdAt: new Date().toISOString(),
      };

      await setDoc(doc(db, 'schools', schoolId), schoolData);

      // 3. Create Admin User Record
      const userData: UserType = {
        uid,
        schoolId,
        role: 'admin',
        name: contactPerson,
        teacherId: schoolCode,
        status: 'active',
        firstLogin: false,
      };
      await setDoc(doc(db, 'users', uid), userData);

      setSuccess(true);
      setTimeout(() => navigate('/dashboard'), 2000);
    } catch (err: any) {
      if (err.code === 'auth/email-already-in-use') {
        setError('This email is already registered. Please try logging in instead.');
      } else {
        setError(err.message || 'Registration failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center animate-in fade-in zoom-in duration-300">
          <div className="bg-green-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="h-10 w-10 text-green-600" />
          </div>
          <h2 className="text-3xl font-bold text-gray-900 mb-2">School Registered!</h2>
          <p className="text-gray-600 mb-6">Your school has been successfully registered. Redirecting to your dashboard...</p>
          <div className="flex justify-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-600"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between w-full">
        <div className="flex items-center gap-2">
          <div className="bg-blue-600 p-2 rounded-lg shadow-lg">
            <ClipboardCheck className="h-6 w-6 text-white" />
          </div>
          <span className="text-2xl font-bold text-gray-900">Attendify</span>
        </div>
        <Link to="/" className="text-sm font-semibold text-blue-600 hover:text-blue-700">
          Sign In
        </Link>
      </nav>

      <main className="flex-grow flex flex-col lg:flex-row">
        <div className="lg:w-1/2 bg-blue-600 p-12 lg:p-24 flex flex-col justify-center text-white">
          <h1 className="text-[33px] font-extrabold mb-6 leading-tight">
            Join Thousands of Schools.
          </h1>
          <p className="text-xl text-blue-100 mb-12 max-w-lg">
            Register your school today and start tracking attendance efficiently.
          </p>
        </div>

        <div className="lg:w-1/2 p-12 lg:p-24 flex flex-col justify-center bg-gray-50">
          <div className="max-w-md mx-auto w-full">
            <h2 className="text-3xl font-bold text-gray-900 mb-2">Register Your School</h2>
            <p className="text-gray-600 mb-8">Fill in the details below to create your school account.</p>

            {error && (
              <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6 text-red-700 text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-4">
                <div className="relative">
                  <Building2 className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                  <input
                    name="schoolName"
                    type="text"
                    required
                    placeholder="School Name"
                    className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                  />
                </div>

                <div className="relative">
                  <UserCircle className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                  <input
                    name="contactPerson"
                    type="text"
                    required
                    placeholder="Contact Person Name"
                    className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="relative">
                    <UserIcon className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                    <input
                      name="schoolCode"
                      type="text"
                      required
                      placeholder="School Code"
                      className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                    />
                  </div>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                    <input
                      name="email"
                      type="email"
                      required
                      placeholder="Email"
                      className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                    />
                  </div>
                </div>

                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                  <input
                    name="password"
                    type="password"
                    required
                    placeholder="Initial Password"
                    className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                  />
                </div>

                <div className="relative">
                  <textarea
                    name="address"
                    required
                    placeholder="School Address"
                    rows={3}
                    className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
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
                    Register School
                    <ArrowRight className="h-5 w-5" />
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
};

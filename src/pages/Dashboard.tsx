import React, { useEffect, useState } from 'react';
import { collection, query, where, getDocs, limit, orderBy } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { Attendance, Student, Class, Division } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts';
import { Users, BookOpen, ClipboardCheck, TrendingUp, AlertCircle, CheckCircle2 } from 'lucide-react';

export const Dashboard: React.FC = () => {
  const { appUser } = useAuth();
  const [stats, setStats] = useState({
    totalStudents: 0,
    totalClasses: 0,
    avgAttendance: 0,
    recentAttendance: [] as Attendance[],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!appUser) {
      setLoading(false);
      return;
    }

    const fetchStats = async () => {
      try {
        const schoolId = appUser.schoolId;

        // 1. Total Students
        const studentsQuery = query(
          collection(db, 'students'),
          where('schoolId', '==', schoolId),
          where('status', '==', 'active')
        );
        const studentsSnap = await getDocs(studentsQuery);
        const totalStudents = studentsSnap.size;

        // 2. Total Classes
        const classesQuery = query(
          collection(db, 'classes'),
          where('schoolId', '==', schoolId)
        );
        const classesSnap = await getDocs(classesQuery);
        const totalClasses = classesSnap.size;

        // 3. Recent Attendance
        const attendanceQuery = query(
          collection(db, 'attendance'),
          where('schoolId', '==', schoolId),
          orderBy('date', 'desc'),
          limit(7)
        );
        const attendanceSnap = await getDocs(attendanceQuery);
        const recentAttendance = attendanceSnap.docs.map(doc => doc.data() as Attendance);

        // 4. Avg Attendance
        let avgAttendance = 0;
        if (recentAttendance.length > 0) {
          const totalPresent = recentAttendance.reduce((acc, curr) => {
            const presentCount = curr.records.filter(r => r.status === 'present').length;
            return acc + (presentCount / curr.records.length);
          }, 0);
          avgAttendance = Math.round((totalPresent / recentAttendance.length) * 100);
        }

        setStats({
          totalStudents,
          totalClasses,
          avgAttendance,
          recentAttendance: recentAttendance.reverse(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, 'dashboard_stats');
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [appUser]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const chartData = stats.recentAttendance.map(a => ({
    date: a.date,
    present: Math.round((a.records.filter(r => r.status === 'present').length / a.records.length) * 100),
  }));

  const COLORS = ['#3b82f6', '#ef4444', '#f59e0b', '#10b981'];

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Welcome back, {appUser?.name}!</h1>
          <p className="text-gray-500 mt-1">Here's what's happening in your school today.</p>
        </div>
        <div className="bg-white px-4 py-2 rounded-xl shadow-sm border border-gray-100 flex items-center gap-2">
          <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
          <span className="text-sm font-medium text-gray-700">System Live</span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: 'Total Students', value: stats.totalStudents, icon: Users, color: 'blue' },
          { label: 'Total Classes', value: stats.totalClasses, icon: BookOpen, color: 'purple' },
          { label: 'Avg Attendance', value: `${stats.avgAttendance}%`, icon: TrendingUp, color: 'green' },
          { label: 'Recent Reports', value: stats.recentAttendance.length, icon: ClipboardCheck, color: 'orange' },
        ].map((stat, i) => (
          <div key={i} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
            <div className={`p-3 rounded-xl bg-${stat.color}-50 w-fit mb-4`}>
              <stat.icon className={`h-6 w-6 text-${stat.color}-600`} />
            </div>
            <p className="text-sm font-medium text-gray-500">{stat.label}</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-gray-900">Attendance Trends</h2>
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">Last 7 Reports</span>
          </div>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                <XAxis 
                  dataKey="date" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#9ca3af', fontSize: 12 }}
                  dy={10}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#9ca3af', fontSize: 12 }}
                  unit="%"
                />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                />
                <Line 
                  type="monotone" 
                  dataKey="present" 
                  stroke="#3b82f6" 
                  strokeWidth={4} 
                  dot={{ r: 6, fill: '#3b82f6', strokeWidth: 2, stroke: '#fff' }}
                  activeDot={{ r: 8, strokeWidth: 0 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col">
          <h2 className="text-lg font-bold text-gray-900 mb-6">Quick Actions</h2>
          <div className="space-y-4 flex-grow">
            {appUser?.role === 'teacher' ? (
              <button className="w-full flex items-center gap-4 p-4 rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors text-left font-medium">
                <div className="bg-blue-600 p-2 rounded-lg text-white">
                  <ClipboardCheck className="h-5 w-5" />
                </div>
                Take Attendance
              </button>
            ) : (
              <>
                <button className="w-full flex items-center gap-4 p-4 rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors text-left font-medium">
                  <div className="bg-blue-600 p-2 rounded-lg text-white">
                    <Users className="h-5 w-5" />
                  </div>
                  Add New Student
                </button>
                <button className="w-full flex items-center gap-4 p-4 rounded-xl bg-purple-50 text-purple-700 hover:bg-purple-100 transition-colors text-left font-medium">
                  <div className="bg-purple-600 p-2 rounded-lg text-white">
                    <BookOpen className="h-5 w-5" />
                  </div>
                  Manage Classes
                </button>
              </>
            )}
          </div>
          
          <div className="mt-8 pt-8 border-t border-gray-100">
            <div className="flex items-center gap-3 text-sm text-gray-500">
              <AlertCircle className="h-4 w-4 text-orange-500" />
              <span>3 classes haven't submitted attendance today.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

import React, { useEffect, useState } from 'react';
import { collection, query, where, getDocs, limit, orderBy, onSnapshot } from 'firebase/firestore';
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
    chartData: [] as { date: string, present: number }[],
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

        setStats(prev => ({ ...prev, totalStudents, totalClasses }));
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, 'dashboard_static_stats');
      }
    };

    fetchStats();

    // 3. Real-time Attendance
    const attendanceQuery = query(
      collection(db, 'attendance'),
      where('schoolId', '==', appUser.schoolId),
      orderBy('date', 'desc'),
      limit(30) // Fetch more to aggregate by date
    );

    const unsubscribe = onSnapshot(attendanceQuery, (snapshot) => {
      const allRecent = snapshot.docs.map(doc => doc.data() as Attendance);
      
      // Aggregate by date for chart
      const aggregatedByDate: Record<string, { present: number, total: number }> = {};
      
      allRecent.forEach(record => {
        if (!aggregatedByDate[record.date]) {
          aggregatedByDate[record.date] = { present: 0, total: 0 };
        }
        const presentCount = record.records.filter(r => r.status === 'present').length;
        aggregatedByDate[record.date].present += presentCount;
        aggregatedByDate[record.date].total += record.records.length;
      });

      const sortedDates = Object.keys(aggregatedByDate).sort().reverse();
      const latestDates = sortedDates.slice(0, 7);
      
      const chartData = latestDates.map(date => ({
        date,
        present: Math.round((aggregatedByDate[date].present / aggregatedByDate[date].total) * 100)
      })).reverse();

      // Calculate average attendance from all fetched records
      let avgAttendance = 0;
      if (allRecent.length > 0) {
        const totalPresent = allRecent.reduce((acc, curr) => acc + curr.records.filter(r => r.status === 'present').length, 0);
        const totalStudents = allRecent.reduce((acc, curr) => acc + curr.records.length, 0);
        avgAttendance = Math.round((totalPresent / totalStudents) * 100);
      }

      setStats(prev => ({
        ...prev,
        avgAttendance,
        recentAttendance: allRecent.slice(0, 7),
        chartData
      }));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'dashboard_attendance_stream');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [appUser]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const chartData = stats.chartData || [];

  const COLORS = ['#3b82f6', '#ef4444', '#f59e0b', '#10b981'];

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">School Overview</h1>
          <p className="text-gray-500 mt-1">Real-time attendance insights and school statistics.</p>
        </div>
        <div className="flex items-center gap-2 bg-blue-50 px-4 py-2 rounded-xl border border-blue-100">
          <CheckCircle2 className="h-5 w-5 text-blue-600" />
          <span className="text-sm font-bold text-blue-700">System Online</span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600">
              <Users className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Total Students</p>
              <h3 className="text-2xl font-bold text-gray-900">{stats.totalStudents}</h3>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 bg-purple-50 rounded-xl flex items-center justify-center text-purple-600">
              <BookOpen className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Total Classes</p>
              <h3 className="text-2xl font-bold text-gray-900">{stats.totalClasses}</h3>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 bg-green-50 rounded-xl flex items-center justify-center text-green-600">
              <ClipboardCheck className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Avg. Attendance</p>
              <h3 className="text-2xl font-bold text-gray-900">{stats.avgAttendance}%</h3>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 bg-orange-50 rounded-xl flex items-center justify-center text-orange-600">
              <TrendingUp className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Growth Trend</p>
              <h3 className="text-2xl font-bold text-gray-900">+12%</h3>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Attendance Chart */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold text-gray-900 text-lg">Attendance Trends</h3>
            <select className="text-sm bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-blue-500">
              <option>Last 7 Days</option>
              <option>Last 30 Days</option>
            </select>
          </div>
          <div className="h-[300px] w-full">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis 
                    dataKey="date" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#94a3b8', fontSize: 12 }}
                    dy={10}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#94a3b8', fontSize: 12 }}
                    unit="%"
                  />
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="present" 
                    stroke="#3b82f6" 
                    strokeWidth={3} 
                    dot={{ r: 4, fill: '#3b82f6', strokeWidth: 2, stroke: '#fff' }}
                    activeDot={{ r: 6, strokeWidth: 0 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-2">
                <AlertCircle className="h-8 w-8" />
                <p>No attendance data available yet</p>
              </div>
            )}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <h3 className="font-bold text-gray-900 text-lg mb-6">Recent Activity</h3>
          <div className="space-y-6">
            {stats.recentAttendance.length > 0 ? (
              stats.recentAttendance.map((record, idx) => (
                <div key={idx} className="flex gap-4">
                  <div className="h-10 w-10 bg-blue-50 rounded-full flex items-center justify-center text-blue-600 shrink-0">
                    <ClipboardCheck className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900 truncate">
                      Attendance Marked
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {record.className} - {record.divisionName}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-1 uppercase font-bold tracking-wider">
                      {new Date(record.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-12 text-gray-400">
                <p className="text-sm">No recent activity</p>
              </div>
            )}
          </div>
          {stats.recentAttendance.length > 0 && (
            <button className="w-full mt-6 py-2.5 text-sm font-bold text-blue-600 bg-blue-50 rounded-xl hover:bg-blue-100 transition-colors">
              View All Activity
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

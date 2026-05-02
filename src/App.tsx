/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import { auth, db } from './lib/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { User } from './types';
import Login from './components/Login';
import AdminDashboard from './components/AdminDashboard';
import EmployeeDashboard from './components/EmployeeDashboard';
import ProfilePage from './components/ProfilePage';
import ToolsPage, { ToolTarget } from './components/ToolsPage';
import { LogOut, Home, ArrowLeft, UserCircle2, Wrench } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

type AdminDashboardView = 'leads' | 'employees' | 'attendance' | 'requirements' | 'inventory';
type EmployeeDashboardView = 'pending' | 'today' | 'upcoming' | 'requirements' | 'inventory';
type DashboardTarget = ToolTarget | null;

const isAdminView = (view: DashboardTarget): view is AdminDashboardView =>
  view === 'leads' || view === 'employees' || view === 'attendance' || view === 'requirements' || view === 'inventory';

const isEmployeeView = (view: DashboardTarget): view is EmployeeDashboardView =>
  view === 'pending' || view === 'today' || view === 'upcoming' || view === 'requirements' || view === 'inventory';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [activeScreen, setActiveScreen] = useState<'dashboard' | 'profile' | 'tools'>('dashboard');
  const [dashboardBackSignal, setDashboardBackSignal] = useState(0);
  const [dashboardTarget, setDashboardTarget] = useState<DashboardTarget>(null);
  const [dashboardTargetSignal, setDashboardTargetSignal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loginToastName, setLoginToastName] = useState<string | null>(null);
  const loginToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isAdminLikeUser = user?.role === 'admin' || user?.role === 'manager';

  const showLoginToast = (name: string) => {
    setLoginToastName(name);
    if (loginToastTimerRef.current) {
      clearTimeout(loginToastTimerRef.current);
    }
    loginToastTimerRef.current = setTimeout(() => {
      setLoginToastName(null);
      loginToastTimerRef.current = null;
    }, 4500);
  };

  useEffect(() => {
    let unsubscribe = () => {};

    const initAuth = async () => {
      const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

      // In local development, always start from login screen.
      if (isLocalhost) {
        try {
          await signOut(auth);
        } catch {
          // Ignore sign-out errors during initialization and continue.
        }
      }

      unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
        if (firebaseUser) {
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          if (userDoc.exists()) {
            setUser({ uid: firebaseUser.uid, ...userDoc.data() } as User);
            setActiveScreen('dashboard');
          } else {
            // If user exists in Auth but not in Firestore (shouldn't happen with our logic)
            setUser(null);
            setActiveScreen('dashboard');
          }
        } else {
          setUser(null);
          setActiveScreen('dashboard');
        }
        setLoading(false);
      });
    };

    void initAuth();

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    return () => {
      if (loginToastTimerRef.current) {
        clearTimeout(loginToastTimerRef.current);
      }
    };
  }, []);

  const handleLogout = async () => {
    await signOut(auth);
    setUser(null);
    setActiveScreen('dashboard');
    setDashboardTarget(null);
  };

  const handleBack = () => {
    if (activeScreen === 'profile' || activeScreen === 'tools') {
      setActiveScreen('dashboard');
      return;
    }
    if (activeScreen === 'dashboard') {
      setDashboardBackSignal((prev) => prev + 1);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <Login
        onLoginSuccess={(u) => {
          setUser(u);
          showLoginToast(u.name);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="bg-blue-600 p-2 rounded-lg">
            <Home className="text-white w-5 h-5" />
          </div>
          <div>
            <h1 className="font-bold text-lg text-gray-900 leading-none">EstatePulse</h1>
            <p className="text-xs text-gray-500 font-medium">{user.role.toUpperCase()}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden md:block text-right">
            <p className="text-sm font-semibold text-gray-900">{user.name}</p>
            <p className="text-xs text-gray-500">{user.phone}</p>
          </div>
          <button
            onClick={() => setActiveScreen('tools')}
            className="p-2 hover:bg-gray-100 rounded-full text-gray-600 transition-colors"
            title="Tools"
          >
            <Wrench className="w-5 h-5" />
          </button>
          <button
            onClick={() => setActiveScreen('profile')}
            className="p-2 hover:bg-gray-100 rounded-full text-gray-600 transition-colors"
            title="Profile"
          >
            <UserCircle2 className="w-5 h-5" />
          </button>
          <button 
            onClick={handleBack}
            className="p-2 hover:bg-gray-100 rounded-full text-gray-600 transition-colors"
            title="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <button 
            onClick={handleLogout}
            className="p-2 hover:bg-gray-100 rounded-full text-gray-600 transition-colors"
            title="Logout"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="flex-1 w-full max-w-7xl mx-auto p-4 md:p-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={`${user.role}-${activeScreen}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {activeScreen === 'profile' ? (
              <ProfilePage user={user} onClose={() => setActiveScreen('dashboard')} />
            ) : activeScreen === 'tools' ? (
              <ToolsPage
                user={user}
                onSelectTool={(tool) => {
                  const resolvedTool =
                    !isAdminLikeUser && tool === 'attendance' ? 'today' : tool;
                  setDashboardTarget(resolvedTool);
                  setDashboardTargetSignal((prev) => prev + 1);
                  setActiveScreen('dashboard');
                }}
              />
            ) : isAdminLikeUser ? (
              <AdminDashboard
                user={user}
                backSignal={dashboardBackSignal}
                initialView={isAdminView(dashboardTarget) ? dashboardTarget : undefined}
                initialViewSignal={dashboardTargetSignal}
              />
            ) : (
              <EmployeeDashboard
                user={user}
                backSignal={dashboardBackSignal}
                initialView={isEmployeeView(dashboardTarget) ? dashboardTarget : undefined}
                initialViewSignal={dashboardTargetSignal}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      <AnimatePresence>
        {loginToastName && (
          <motion.div
            initial={{ opacity: 0, y: -16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.96 }}
            transition={{ duration: 0.2 }}
            className="fixed top-20 right-4 z-[120] w-[300px] max-w-[calc(100vw-2rem)] rounded-2xl bg-white/95 border border-gray-200 shadow-2xl px-4 py-3 backdrop-blur"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                {loginToastName.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{loginToastName}</p>
                <p className="text-xs text-gray-500">Logged in</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

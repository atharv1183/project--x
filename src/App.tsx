/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import { auth, db } from './lib/firebase';
import { onAuthStateChanged, signInWithCustomToken, signOut } from 'firebase/auth';
import { doc, getDoc, onSnapshot, orderBy, query } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { PlatformAnnouncement, User } from './types';
import Login from './components/Login';
import AdminDashboard from './components/AdminDashboard';
import EmployeeDashboard from './components/EmployeeDashboard';
import ProfilePage from './components/ProfilePage';
import ToolsPage, { ToolTarget } from './components/ToolsPage';
import PublicHeroPage from './components/PublicHeroPage';
import SuperAdminControlCenter from './components/SuperAdminControlCenter';
import { functions } from './lib/firebase';
import { LogOut, Home, ArrowLeft, UserCircle2, Wrench, ShieldCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

type AdminDashboardView = 'performance' | 'leads' | 'employees' | 'attendance' | 'requirements' | 'inventory';
type EmployeeDashboardView = 'performance' | 'pending' | 'today' | 'upcoming' | 'attendance' | 'requirements' | 'inventory';
type DashboardTarget = ToolTarget | null;

const isAdminView = (view: DashboardTarget): view is AdminDashboardView =>
  view === 'performance' || view === 'leads' || view === 'employees' || view === 'attendance' || view === 'requirements' || view === 'inventory';

const isEmployeeView = (view: DashboardTarget): view is EmployeeDashboardView =>
  view === 'performance' || view === 'pending' || view === 'today' || view === 'upcoming' || view === 'attendance' || view === 'requirements' || view === 'inventory';

export default function App() {
  const pathname = window.location.pathname.toLowerCase();
  const isPublicHeroRoute = pathname === '/' || pathname === '/hero' || pathname === '/website';
  const [user, setUser] = useState<User | null>(null);
  const [activeScreen, setActiveScreen] = useState<'dashboard' | 'profile' | 'tools' | 'platform'>('dashboard');
  const [activeAnnouncements, setActiveAnnouncements] = useState<PlatformAnnouncement[]>([]);
  const [impersonation, setImpersonation] = useState<{ clientId: string; clientName: string; startedAt: string; actorRestoreToken?: string } | null>(null);
  const [dashboardBackSignal, setDashboardBackSignal] = useState(0);
  const [dashboardTarget, setDashboardTarget] = useState<DashboardTarget>(null);
  const [dashboardTargetSignal, setDashboardTargetSignal] = useState(0);
  const [brand, setBrand] = useState<{ logoUrl: string; companyName: string; tagline: string }>({
    logoUrl: '',
    companyName: 'EstatePulse',
    tagline: '',
  });
  const [loading, setLoading] = useState(true);
  const [loginToastName, setLoginToastName] = useState<string | null>(null);
  const loginToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isAdminLikeUser = user?.role === 'super_admin' || user?.role === 'admin' || user?.role === 'client_admin' || user?.role === 'manager';
  const isSuperAdmin = user?.role === 'super_admin';
  const useFullHeightDashboardShell = activeScreen === 'dashboard' && (isAdminLikeUser || user?.role === 'employee');

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
    if (isPublicHeroRoute) {
      setLoading(false);
      return;
    }

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
            const nextUser = { uid: firebaseUser.uid, ...userDoc.data() } as User;
            if ((nextUser as any).clientId) {
              const clientDoc = await getDoc(doc(db, 'platformClients', String((nextUser as any).clientId)));
              if (clientDoc.exists()) {
                const clientData = clientDoc.data() as any;
                const expiryMs = clientData?.subscriptionExpiryDate
                  ? new Date(clientData.subscriptionExpiryDate).getTime()
                  : 0;
                const isExpired = Number.isFinite(expiryMs) && expiryMs > 0 && expiryMs < Date.now();
                const blockedByState = ['expired', 'suspended', 'deleted_permanently', 'archived'].includes(String(clientData?.state || ''));
                if (isExpired || blockedByState) {
                  await signOut(auth);
                  setUser(null);
                  setActiveScreen('dashboard');
                  alert('Your company subscription is expired or suspended. Please contact platform admin.');
                  setLoading(false);
                  return;
                }
              }
            }
            setUser(nextUser);
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
  }, [isPublicHeroRoute]);

  useEffect(() => {
    const raw = localStorage.getItem('super_admin_impersonation');
    if (!raw) return;
    try {
      setImpersonation(JSON.parse(raw));
    } catch {
      localStorage.removeItem('super_admin_impersonation');
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'platformAnnouncements'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() } as PlatformAnnouncement))
        .filter((item) => item.active)
        .filter((item) => item.targetType === 'all' || (item.targetClientIds || []).length > 0)
        .slice(0, 3);
      setActiveAnnouncements(data);
    });
    return () => unsub();
  }, [user]);

  useEffect(() => {
    const loadBranding = async () => {
      if (!user) {
        setBrand({ logoUrl: '', companyName: 'EstatePulse', tagline: '' });
        return;
      }
      const ownerUid = user.managerId || user.uid;
      try {
        const ownerDoc = await getDoc(doc(db, 'users', ownerUid));
        const ownerData = ownerDoc.exists() ? (ownerDoc.data() as any) : {};
        setBrand({
          logoUrl: ownerData?.brandLogoUrl || '',
          companyName: ownerData?.brandCompanyName || (user as any).clientName || 'EstatePulse',
          tagline: ownerData?.brandTagline || '',
        });
      } catch {
        setBrand({ logoUrl: '', companyName: (user as any).clientName || 'EstatePulse', tagline: '' });
      }
    };
    void loadBranding();
  }, [user]);

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
    localStorage.removeItem('super_admin_impersonation');
    setImpersonation(null);
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

  if (isPublicHeroRoute) {
    return <PublicHeroPage />;
  }

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
    <div className={useFullHeightDashboardShell ? "h-screen bg-gray-50 flex flex-col overflow-y-auto overflow-x-hidden" : "min-h-screen bg-gray-50 flex flex-col"}>
      {!useFullHeightDashboardShell && (
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="bg-blue-600 p-2 rounded-lg w-9 h-9 flex items-center justify-center overflow-hidden">
            {brand.logoUrl ? (
              <img src={brand.logoUrl} alt="Brand" className="w-full h-full object-cover" />
            ) : (
              <Home className="text-white w-5 h-5" />
            )}
          </div>
          <div>
            <h1 className="font-bold text-lg text-gray-900 leading-none">{brand.companyName || 'EstatePulse'}</h1>
            {brand.tagline ? (
              <p className="text-[10px] text-gray-500 leading-none mt-0.5">{brand.tagline}</p>
            ) : null}
            <p className="text-xs text-gray-500 font-medium">{user.role.toUpperCase()}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden md:block text-right">
            <p className="text-sm font-semibold text-gray-900">{user.name}</p>
            <p className="text-xs text-gray-500">{user.phone}</p>
          </div>
          {isSuperAdmin && (
            <button
              onClick={() => setActiveScreen('platform')}
              className="p-2 hover:bg-gray-100 rounded-full text-gray-600 transition-colors"
              title="Super Admin Control Center"
            >
              <ShieldCheck className="w-5 h-5" />
            </button>
          )}
          <button
            onClick={() => setActiveScreen('tools')}
            className="p-2 hover:bg-gray-100 rounded-full text-gray-600 transition-colors"
            title="Tools"
          >
            <Wrench className="w-5 h-5" />
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
      )}
      {impersonation && (
        <div className="bg-amber-100 border-b border-amber-200 px-4 py-2 flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-amber-900">Super Admin Session Active: Acting as {impersonation.clientName}</p>
          <button
            onClick={async () => {
              try {
                if (!functions) {
                  localStorage.removeItem('super_admin_impersonation');
                  setImpersonation(null);
                  return;
                }
                if (impersonation.actorRestoreToken) {
                  await signInWithCustomToken(auth, impersonation.actorRestoreToken);
                  const endImpersonation = httpsCallable(functions, 'endImpersonationSession');
                  await endImpersonation({ clientId: impersonation.clientId });
                }
              } catch (error) {
                console.error('Failed to restore super admin session', error);
              } finally {
                localStorage.removeItem('super_admin_impersonation');
                setImpersonation(null);
              }
            }}
            className="px-3 py-1.5 rounded-lg bg-amber-200 text-amber-900 text-xs font-semibold"
          >
            End Session
          </button>
        </div>
      )}
      {activeAnnouncements.length > 0 && (
        <div className="border-b border-blue-100 bg-blue-50 px-4 py-2">
          <p className="text-xs font-semibold text-blue-800">
            {activeAnnouncements[0].title}: {activeAnnouncements[0].message}
          </p>
        </div>
      )}

      <main className={useFullHeightDashboardShell ? "flex-1 w-full p-0 pb-20" : "flex-1 w-full max-w-7xl mx-auto p-4 md:p-6 pb-24"}>
        <AnimatePresence mode="wait">
          <motion.div
            key={`${user.role}-${activeScreen}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className={useFullHeightDashboardShell ? "h-full" : undefined}
          >
            {activeScreen === 'profile' ? (
              <ProfilePage
                user={user}
                onClose={() => setActiveScreen('dashboard')}
                onUserUpdate={(patch) => setUser((prev) => (prev ? { ...prev, ...patch } : prev))}
              />
            ) : activeScreen === 'tools' ? (
              <ToolsPage
                user={user}
                onSelectTool={(tool) => {
                  setDashboardTarget(tool);
                  setDashboardTargetSignal((prev) => prev + 1);
                  setActiveScreen('dashboard');
                }}
              />
            ) : activeScreen === 'platform' && isSuperAdmin ? (
              <SuperAdminControlCenter
                user={user}
                onStartImpersonation={async ({ clientId, clientName }) => {
                  if (!functions) {
                    alert('Firebase Functions is not available. Please deploy/enable Functions first.');
                    return;
                  }
                  const startImpersonation = httpsCallable(functions, 'startImpersonationSession');
                  const response = await startImpersonation({ clientId });
                  const data = response.data as {
                    targetToken: string;
                    actorRestoreToken: string;
                    clientId: string;
                    clientName: string;
                  };
                  await signInWithCustomToken(auth, data.targetToken);
                  const payload = {
                    clientId: data.clientId || clientId,
                    clientName: data.clientName || clientName,
                    startedAt: new Date().toISOString(),
                    actorRestoreToken: data.actorRestoreToken,
                  };
                  localStorage.setItem('super_admin_impersonation', JSON.stringify(payload));
                  setImpersonation(payload as any);
                  setActiveScreen('dashboard');
                }}
              />
            ) : isAdminLikeUser ? (
              <AdminDashboard
                user={user}
                brand={brand}
                backSignal={dashboardBackSignal}
                initialView={isAdminView(dashboardTarget) ? dashboardTarget : undefined}
                initialViewSignal={dashboardTargetSignal}
              />
            ) : (
              <EmployeeDashboard
                user={user}
                brand={brand}
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

      <nav className="fixed inset-x-0 bottom-0 z-[130] border-t border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-around px-2">
          <button onClick={() => setActiveScreen('dashboard')} className="flex flex-col items-center justify-center text-[11px] font-semibold text-slate-700">
            <Home className="h-5 w-5" />
            <span>Home</span>
          </button>
          <button onClick={() => setActiveScreen('profile')} className="flex flex-col items-center justify-center text-[11px] font-semibold text-slate-700">
            <UserCircle2 className="h-5 w-5" />
            <span>Profile</span>
          </button>
          <button onClick={() => setActiveScreen('tools')} className="flex flex-col items-center justify-center text-[11px] font-semibold text-slate-700">
            <Wrench className="h-5 w-5" />
            <span>Tools</span>
          </button>
          {isSuperAdmin && (
            <button onClick={() => setActiveScreen('platform')} className="flex flex-col items-center justify-center text-[11px] font-semibold text-slate-700">
              <ShieldCheck className="h-5 w-5" />
              <span>Platform</span>
            </button>
          )}
          <button onClick={handleLogout} className="flex flex-col items-center justify-center text-[11px] font-semibold text-rose-600">
            <LogOut className="h-5 w-5" />
            <span>Logout</span>
          </button>
        </div>
      </nav>
    </div>
  );
}

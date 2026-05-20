/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import { auth, db } from './lib/firebase';
import { onAuthStateChanged, signInWithCustomToken, signOut } from 'firebase/auth';
import { addDoc, collection, doc, getDoc, onSnapshot, orderBy, query, serverTimestamp } from 'firebase/firestore';
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
import { LogOut, Home, ArrowLeft, UserCircle2, Wrench, ShieldCheck, CircleHelp, RefreshCcw, ChevronsUpDown } from 'lucide-react';
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
  const [showAdminMenu, setShowAdminMenu] = useState(false);
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [subscriptionExpiryText, setSubscriptionExpiryText] = useState<string>('N/A');
  const [supportTicketForm, setSupportTicketForm] = useState({ subject: '', message: '', priority: 'medium' as 'low' | 'medium' | 'high' });
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
    const loadSubscriptionExpiry = async () => {
      if (!user || !(user as any).clientId) {
        setSubscriptionExpiryText('N/A');
        return;
      }
      try {
        const clientDoc = await getDoc(doc(db, 'platformClients', String((user as any).clientId)));
        if (!clientDoc.exists()) {
          setSubscriptionExpiryText('N/A');
          return;
        }
        const expiryRaw = (clientDoc.data() as any)?.subscriptionExpiryDate;
        if (!expiryRaw) {
          setSubscriptionExpiryText('N/A');
          return;
        }
        const expiryDate = new Date(expiryRaw);
        setSubscriptionExpiryText(Number.isNaN(expiryDate.getTime()) ? String(expiryRaw) : expiryDate.toLocaleDateString());
      } catch {
        setSubscriptionExpiryText('N/A');
      }
    };
    void loadSubscriptionExpiry();
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

  const handleSelfResetPassword = async () => {
    if (!functions) {
      alert('Password reset service is unavailable right now.');
      return;
    }
    const defaultPassword = (user.phone || '').replace(/\D/g, '');
    const entered = prompt('Enter a new temporary password (min 8 chars):', defaultPassword);
    if (entered === null) return;
    const nextPassword = entered.trim();
    if (nextPassword.length < 8) {
      alert('Password must be at least 8 characters.');
      return;
    }
    try {
      const fn = httpsCallable(functions, 'resetUserPassword');
      await fn({ targetUid: user.uid, targetPhone: defaultPassword, newPassword: nextPassword });
      alert('Password reset successful.');
      setShowAdminMenu(false);
    } catch (error: any) {
      alert(error?.message || 'Failed to reset password.');
    }
  };

  const handleRaiseSupportTicket = async () => {
    const subject = supportTicketForm.subject.trim();
    const message = supportTicketForm.message.trim();
    if (!subject || !message) {
      alert('Subject and message are required.');
      return;
    }
    try {
      await addDoc(collection(db, 'supportTickets'), {
        subject,
        message,
        priority: supportTicketForm.priority,
        status: 'open',
        userId: user.uid,
        userName: user.name,
        companyId: (user as any).clientId || null,
        companyName: (user as any).clientName || null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      alert('Support ticket raised successfully.');
      setSupportTicketForm({ subject: '', message: '', priority: 'medium' });
      setShowSupportModal(false);
      setShowAdminMenu(false);
    } catch (error: any) {
      alert(error?.message || 'Failed to raise support ticket.');
    }
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
    <div className={useFullHeightDashboardShell ? "h-screen bg-gray-50 flex flex-col overflow-hidden" : "min-h-screen bg-gray-50 flex flex-col"}>
      {isAdminLikeUser && (
        <div className="fixed right-4 top-4 z-[130]">
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowAdminMenu((prev) => !prev)}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 shadow-md"
              title="Account menu"
            >
              {user.profileImageUrl ? (
                <img src={user.profileImageUrl} alt={user.name} className="h-7 w-7 rounded-full object-cover" />
              ) : (
                <UserCircle2 className="w-5 h-5" />
              )}
              <span className="hidden sm:inline">{user.name}</span>
              <ChevronsUpDown className="w-4 h-4 text-slate-500" />
            </button>
            {showAdminMenu && (
              <div className="absolute right-0 mt-2 w-72 rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl">
                <div className="px-3 py-2 border-b border-slate-100">
                  <p className="text-sm font-black text-slate-800">{user.name}</p>
                  <p className="text-xs font-medium text-slate-500">{user.phone}</p>
                  <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-slate-400">Subscription Expiry: {subscriptionExpiryText}</p>
                </div>
                <button onClick={() => { setActiveScreen('profile'); setShowAdminMenu(false); }} className="w-full rounded-xl px-3 py-2 text-left text-sm font-bold text-slate-700 hover:bg-slate-50">Profile</button>
                <button onClick={handleSelfResetPassword} className="w-full rounded-xl px-3 py-2 text-left text-sm font-bold text-slate-700 hover:bg-slate-50">Reset Password</button>
                <button onClick={() => { setActiveScreen('tools'); setShowAdminMenu(false); }} className="w-full rounded-xl px-3 py-2 text-left text-sm font-bold text-slate-700 hover:bg-slate-50">Backup & Restore</button>
                <button onClick={() => { setShowSupportModal(true); }} className="w-full rounded-xl px-3 py-2 text-left text-sm font-bold text-slate-700 hover:bg-slate-50">Help & Support (Raise Ticket)</button>
                <button onClick={handleLogout} className="w-full rounded-xl px-3 py-2 text-left text-sm font-bold text-rose-600 hover:bg-rose-50">Logout</button>
              </div>
            )}
          </div>
        </div>
      )}
      {!useFullHeightDashboardShell && (
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

      <main className={useFullHeightDashboardShell ? "flex-1 w-full p-0" : "flex-1 w-full max-w-7xl mx-auto p-4 md:p-6"}>
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

      {showSupportModal && (
        <div className="fixed inset-0 z-[140] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl">
            <h3 className="text-lg font-black text-slate-900">Raise Support Ticket</h3>
            <p className="mt-1 text-xs font-medium text-slate-500">Share issue details and our support team will follow up.</p>
            <div className="mt-4 space-y-3">
              <input
                value={supportTicketForm.subject}
                onChange={(e) => setSupportTicketForm((prev) => ({ ...prev, subject: e.target.value }))}
                placeholder="Subject"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium"
              />
              <select
                value={supportTicketForm.priority}
                onChange={(e) => setSupportTicketForm((prev) => ({ ...prev, priority: e.target.value as 'low' | 'medium' | 'high' }))}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
              <textarea
                value={supportTicketForm.message}
                onChange={(e) => setSupportTicketForm((prev) => ({ ...prev, message: e.target.value }))}
                placeholder="Describe the issue"
                rows={4}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium"
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setShowSupportModal(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600">Cancel</button>
              <button onClick={handleRaiseSupportTicket} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white">Submit Ticket</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

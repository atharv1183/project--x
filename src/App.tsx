/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import { auth, db } from './lib/firebase';
import { browserLocalPersistence, onAuthStateChanged, setPersistence, signInWithCustomToken, signOut } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { PlatformAnnouncement, User } from './types';
import Login from './components/Login';
import AdminDashboard from './components/AdminDashboard';
import EmployeeDashboard from './components/EmployeeDashboard';
import ProfilePage from './components/ProfilePage';
import ToolsPage, { ToolTarget } from './components/ToolsPage';
import { FloatingContact } from './components/FloatingContact';
import PublicHeroPage from './components/PublicHeroPage';
import SuperAdminControlCenter from './components/SuperAdminControlCenter';
import BookDemo from './pages/BookDemo';
import PropertyDetailPage from './pages/PropertyDetailPage';
import PublicContentPage from './pages/PublicContentPage';
import PublicBlogsPage from './pages/PublicBlogsPage';
import PublicFeaturesPage from './pages/PublicFeaturesPage';
import PrivacyPolicy from './pages/legal/PrivacyPolicy';
import TermsOfService from './pages/legal/TermsOfService';
import RefundPolicy from './pages/legal/RefundPolicy';
import CookiePolicy from './pages/legal/CookiePolicy';
import Disclaimer from './pages/legal/Disclaimer';
import AcceptableUse from './pages/legal/AcceptableUse';
import VerifyCertificatePage from './pages/VerifyCertificatePage';
import AboutPage from './pages/AboutPage';
import { functions } from './lib/firebase';
import { LogOut, Home, ArrowLeft, UserCircle2, Wrench, ShieldCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Routes, Route, Navigate } from 'react-router-dom';

type AdminDashboardView = 'performance' | 'leads' | 'employees' | 'attendance' | 'requirements' | 'inventory' | 'activity_logs' | 'deleted_leads';
type EmployeeDashboardView = 'performance' | 'leads' | 'pending' | 'today' | 'upcoming' | 'attendance' | 'requirements' | 'inventory' | 'activity_logs' | 'deleted_leads';
type DashboardTarget = ToolTarget | 'deleted_leads' | null;

const isAdminView = (view: DashboardTarget): view is AdminDashboardView =>
  view === 'performance' || view === 'leads' || view === 'employees' || view === 'attendance' || view === 'requirements' || view === 'inventory' || view === 'activity_logs' || view === 'deleted_leads';

const isEmployeeView = (view: DashboardTarget): view is EmployeeDashboardView =>
  view === 'performance' || view === 'leads' || view === 'pending' || view === 'today' || view === 'upcoming' || view === 'attendance' || view === 'requirements' || view === 'inventory' || view === 'activity_logs' || view === 'deleted_leads';

const defaultScreenForUser = (user: User): 'dashboard' | 'platform' =>
  user.role === 'super_admin' ? 'platform' : 'dashboard';

const SESSION_DURATION_MS = 24 * 60 * 60 * 1000;
const sessionStartedKey = (uid: string) => `estatepulse_session_started_at_${uid}`;

export default function App() {
  const pathname = window.location.pathname.toLowerCase();
  const isPublicHeroRoute = pathname === '/' || pathname === '/hero' || pathname === '/website';
  const isBookDemoRoute = pathname === '/book-demo' || pathname === '/get-started';
  const isContentRoute = pathname.startsWith('/blog/') || pathname.startsWith('/city/') || pathname.startsWith('/money/') || pathname.startsWith('/compare/');
  const isBlogsRoute = pathname === '/blogs' || pathname === '/blog';
  const isFeaturesRoute = pathname === '/features' || pathname === '/feature';
  const isAboutRoute = pathname === '/about';
  const isVerifyCertRoute = pathname === '/verify-certificate' || pathname === '/verify';
  const isLegalRoute = pathname.startsWith('/legal/');
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
  const [brandLogoFailed, setBrandLogoFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loginToastName, setLoginToastName] = useState<string | null>(null);
  const loginToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isAdminLikeUser = user?.role === 'super_admin' || user?.role === 'admin' || user?.role === 'client_admin' || user?.role === 'manager';
  const isSuperAdmin = user?.role === 'super_admin';
  const useFullHeightDashboardShell = Boolean(isAdminLikeUser || user?.role === 'employee');

  const clearSessionStart = (uid?: string | null) => {
    if (uid) {
      localStorage.removeItem(sessionStartedKey(uid));
    }
  };

  const getOrCreateSessionStart = (uid: string) => {
    const key = sessionStartedKey(uid);
    const existing = Number(localStorage.getItem(key) || 0);
    if (Number.isFinite(existing) && existing > 0) return existing;
    const now = Date.now();
    localStorage.setItem(key, String(now));
    return now;
  };

  const hasSessionExpired = (uid: string) => Date.now() - getOrCreateSessionStart(uid) >= SESSION_DURATION_MS;

  const endSession = async (uid?: string | null) => {
    clearSessionStart(uid || auth.currentUser?.uid || null);
    localStorage.removeItem('super_admin_impersonation');
    setImpersonation(null);
    await signOut(auth);
    setUser(null);
    setActiveScreen('dashboard');
    setDashboardTarget(null);
  };

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
      await setPersistence(auth, browserLocalPersistence);

      unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
        try {
          if (firebaseUser) {
            if (hasSessionExpired(firebaseUser.uid)) {
              alert('Your session expired after 24 hours. Please login again.');
              await endSession(firebaseUser.uid);
              return;
            }
            const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
            if (userDoc.exists()) {
              const nextUser = { uid: firebaseUser.uid, ...userDoc.data() } as User;
              const canResolveClientFromPlatform =
                !(nextUser as any).clientId && (nextUser.role === 'admin' || nextUser.role === 'client_admin');
              if (canResolveClientFromPlatform) {
                try {
                  const byUid = await getDocs(query(collection(db, 'platformClients'), where('adminUid', '==', firebaseUser.uid), limit(1)));
                  const byEmail = byUid.empty
                    ? await getDocs(query(collection(db, 'platformClients'), where('adminEmail', '==', firebaseUser.email || ''), limit(1)))
                    : byUid;
                  const resolvedDoc = byEmail.docs[0];
                  if (resolvedDoc) {
                    const resolvedClientId = resolvedDoc.id;
                    const resolvedClientName = String((resolvedDoc.data() as any)?.name || (nextUser as any).clientName || '');
                    (nextUser as any).clientId = resolvedClientId;
                    (nextUser as any).clientName = resolvedClientName;
                    try {
                      await setDoc(doc(db, 'clientAdmins', firebaseUser.uid), { clientId: resolvedClientId }, { merge: true });
                      await updateDoc(doc(db, 'users', firebaseUser.uid), {
                        clientId: resolvedClientId,
                        clientName: resolvedClientName,
                        updatedAt: serverTimestamp(),
                      });
                    } catch (persistError) {
                      console.warn('Unable to persist resolved client mapping.', persistError);
                    }
                  }
                } catch (error) {
                  console.warn('Unable to resolve client mapping from platformClients.', error);
                }
              }
              if ((nextUser as any).clientId) {
                try {
                  const clientDoc = await getDoc(doc(db, 'platformClients', String((nextUser as any).clientId)));
                  if (clientDoc.exists()) {
                    const clientData = clientDoc.data() as any;
                    const expiryMs = clientData?.subscriptionExpiryDate
                      ? new Date(clientData.subscriptionExpiryDate).getTime()
                      : 0;
                    const isExpired = Number.isFinite(expiryMs) && expiryMs > 0 && expiryMs < Date.now();
                    const blockedByState = ['expired', 'suspended', 'deleted_permanently', 'archived'].includes(String(clientData?.state || ''));
                    if (isExpired || blockedByState) {
                      await endSession(firebaseUser.uid);
                      alert('Your company subscription is expired or suspended. Please contact platform admin.');
                      return;
                    }
                  }
                } catch (error) {
                  console.warn('Unable to verify client subscription during auth bootstrap.', error);
                }
              }
              setUser(nextUser);
              setActiveScreen(defaultScreenForUser(nextUser));
              if (isPublicHeroRoute) {
                window.history.replaceState(null, '', '/login');
              }
            } else {
              // If user exists in Auth but not in Firestore (shouldn't happen with our logic)
              setUser(null);
              setActiveScreen('dashboard');
            }
          } else {
            setUser(null);
            setActiveScreen('dashboard');
          }
        } catch (error) {
          console.error('Auth bootstrap failed. Falling back to login screen.', error);
          setUser(null);
          setActiveScreen('dashboard');
        } finally {
          setLoading(false);
        }
      });
    };

    void initAuth();

    return () => unsubscribe();
  }, [isBookDemoRoute, isPublicHeroRoute, isContentRoute, isBlogsRoute, isFeaturesRoute, isVerifyCertRoute]);

  useEffect(() => {
    if (!user) return;
    const timeoutMs = Math.max(0, SESSION_DURATION_MS - (Date.now() - getOrCreateSessionStart(user.uid)));
    const timer = setTimeout(() => {
      alert('Your session expired after 24 hours. Please login again.');
      void endSession(user.uid);
    }, timeoutMs);
    return () => clearTimeout(timer);
  }, [user]);

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
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs
          .map((item) => ({ id: item.id, ...item.data() } as PlatformAnnouncement))
          .filter((item) => item.active)
          .filter((item) => item.targetType === 'all' || (item.targetClientIds || []).length > 0)
          .slice(0, 3);
        setActiveAnnouncements(data);
      },
      (error) => {
        console.error('Failed to load platform announcements.', error);
        setActiveAnnouncements([]);
      }
    );
    return () => unsub();
  }, [user]);

  useEffect(() => {
    const loadBranding = async () => {
      if (!user) {
        setBrand({ logoUrl: '', companyName: 'EstatePulse', tagline: '' });
        return;
      }
      try {
        // Walk up the reporting chain and pick the first user with branding.
        // This ensures admin branding is visible to all users under that admin.
        const visited = new Set<string>();
        const chain: Array<any> = [];
        let cursorUid: string | undefined = user.uid;

        while (cursorUid && !visited.has(cursorUid)) {
          visited.add(cursorUid);
          const currentDoc = await getDoc(doc(db, 'users', cursorUid)).catch(() => null);
          if (!currentDoc?.exists()) break;
          const currentData = { uid: cursorUid, ...(currentDoc.data() as any) };
          chain.push(currentData);
          cursorUid = currentData.managerId;
        }

        let brandedOwner = chain.find((item) =>
          Boolean((item.brandLogoUrl || '').trim() || (item.brandCompanyName || '').trim() || (item.brandTagline || '').trim())
        );
        if (!brandedOwner && (user as any).clientId) {
          const brandDoc = await getDoc(doc(db, 'clientBranding', String((user as any).clientId))).catch(() => null);
          if (brandDoc?.exists()) {
            const brandData = brandDoc.data() as any;
            brandedOwner = {
              brandLogoUrl: brandData.logoUrl || '',
              brandCompanyName: brandData.companyName || '',
              brandTagline: brandData.tagline || '',
            };
          }
        }
        const ownerData = brandedOwner || chain[0] || {};

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

  useEffect(() => {
    setBrandLogoFailed(false);
  }, [brand.logoUrl]);

  const handleLogout = async () => {
    await endSession(user?.uid);
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

  const handleHomeNavigation = () => {
    setActiveScreen('dashboard');
    const leadTarget: DashboardTarget =
      (user?.role === 'super_admin' || user?.role === 'admin' || user?.role === 'client_admin' || user?.role === 'manager')
        ? 'leads'
        : 'today';
    setDashboardTarget(leadTarget);
    setDashboardTargetSignal((prev) => prev + 1);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const isPropertyDetailRoute = pathname.startsWith('/p/') || pathname === '/p';
  if (isPropertyDetailRoute) {
    const propertyId = window.location.pathname.split('/').pop() || '';
    return (
      <>
        <PropertyDetailPage propertyId={propertyId} />
        <FloatingContact />
      </>
    );
  }

  if (isContentRoute) {
    const segments = window.location.pathname.split('/').filter(Boolean);
    const type = segments[0]; // e.g., 'blog'
    const slug = segments[1] || '';
    return (
      <>
        <PublicContentPage type={type as 'blog' | 'city' | 'money' | 'compare'} slug={slug} />
        <FloatingContact />
      </>
    );
  }

  if (isBlogsRoute) {
    return (
      <>
        <PublicBlogsPage />
        <FloatingContact />
      </>
    );
  }

  if (isFeaturesRoute) {
    return (
      <>
        <PublicFeaturesPage />
        <FloatingContact />
      </>
    );
  }

  if (isAboutRoute) {
    return (
      <>
        <AboutPage />
        <FloatingContact />
      </>
    );
  }

  if (isVerifyCertRoute) {
    return (
      <>
        <VerifyCertificatePage />
        <FloatingContact />
      </>
    );
  }

  if (isLegalRoute) {
    const renderLegal = () => {
      if (pathname === '/legal/privacy-policy') return <PrivacyPolicy />;
      if (pathname === '/legal/terms-of-service') return <TermsOfService />;
      if (pathname === '/legal/refund-cancellation') return <RefundPolicy />;
      if (pathname === '/legal/cookie-policy') return <CookiePolicy />;
      if (pathname === '/legal/disclaimer') return <Disclaimer />;
      if (pathname === '/legal/acceptable-use') return <AcceptableUse />;
      return null;
    };
    return (
      <>
        {renderLegal()}
        <FloatingContact />
      </>
    );
  }

  if (isPublicHeroRoute && !user) {
    return (
      <>
        <PublicHeroPage />
        <FloatingContact />
      </>
    );
  }

  if (isBookDemoRoute) {
    return <BookDemo />;
  }

  if (!user) {
    return (
      <Login
        onLoginSuccess={(u) => {
          localStorage.setItem(sessionStartedKey(u.uid), String(Date.now()));
          if (isPublicHeroRoute) {
            window.history.replaceState(null, '', '/login');
          }
          setUser(u);
          setActiveScreen(defaultScreenForUser(u));
          showLoginToast(u.name);
        }}
      />
    );
  }

  return (
    <div
      className={useFullHeightDashboardShell ? "h-screen bg-gray-50 flex flex-col overflow-hidden" : "min-h-screen bg-gray-50 flex flex-col"}
      style={{ ['--bottom-nav-height' as string]: '64px' }}
    >
      {!useFullHeightDashboardShell && (
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="bg-blue-600 p-2 rounded-lg w-9 h-9 flex items-center justify-center overflow-hidden">
            {brand.logoUrl.trim() && !brandLogoFailed ? (
              <img
                src={brand.logoUrl.trim()}
                alt="Brand"
                className="w-full h-full object-cover"
                onError={() => setBrandLogoFailed(true)}
              />
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
            title="Backup & Restore"
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

      <main
        className={useFullHeightDashboardShell ? "flex-1 w-full p-0 overflow-y-auto overflow-x-hidden" : "flex-1 w-full max-w-7xl mx-auto p-4 md:p-6"}
        style={useFullHeightDashboardShell ? undefined : { paddingBottom: 'calc(var(--bottom-nav-height, 64px) + env(safe-area-inset-bottom, 0px) + 16px)' }}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={`${user.role}-${activeScreen}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className={useFullHeightDashboardShell ? "h-full" : undefined}
          >
            {activeScreen === 'platform' && isSuperAdmin ? (
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
            ) : (isAdminLikeUser || user.role === 'employee') ? (
              <>
                {isAdminLikeUser ? (
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
                {activeScreen === 'profile' && (
                  <div className="fixed inset-0 z-[131] bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
                    <div className="mx-auto max-w-3xl">
                      <ProfilePage
                        user={user}
                        onClose={() => setActiveScreen('dashboard')}
                        onUserUpdate={(patch) => setUser((prev) => (prev ? { ...prev, ...patch } : prev))}
                      />
                    </div>
                  </div>
                )}
                {activeScreen === 'tools' && (
                  <div className="fixed inset-0 z-[131] bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
                    <div className="mx-auto max-w-5xl">
                      <div className="mb-3 flex justify-end">
                        <button
                          onClick={() => setActiveScreen('dashboard')}
                          className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-slate-700"
                        >
                          Close
                        </button>
                      </div>
                      <ToolsPage
                        user={user}
                        onSelectTool={(tool) => {
                          setDashboardTarget(tool);
                          setDashboardTargetSignal((prev) => prev + 1);
                          setActiveScreen('dashboard');
                        }}
                      />
                    </div>
                  </div>
                )}
              </>
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

      <nav
        className="fixed inset-x-0 bottom-0 z-[130] border-t border-slate-200 bg-white/95 backdrop-blur"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-around px-2">
          <button onClick={handleHomeNavigation} className="flex flex-col items-center justify-center text-[11px] font-semibold text-slate-700">
            <Home className="h-5 w-5" />
            <span>Home</span>
          </button>
          <button onClick={() => setActiveScreen('profile')} className="flex flex-col items-center justify-center text-[11px] font-semibold text-slate-700">
            <UserCircle2 className="h-5 w-5" />
            <span>Profile</span>
          </button>
          <button onClick={() => setActiveScreen('tools')} className="flex flex-col items-center justify-center text-[11px] font-semibold text-slate-700">
            <Wrench className="h-5 w-5" />
            <span>Backup</span>
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

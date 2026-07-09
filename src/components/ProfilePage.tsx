import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import { auth, db } from '../lib/firebase';
import { EmailAuthProvider, reauthenticateWithCredential, updateEmail, updatePassword } from 'firebase/auth';
import { addDoc, collection, doc, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { User } from '../types';
import { ArrowLeft, Camera, Lock, Mail, Phone, Shield, UserCircle2 } from 'lucide-react';
import { addAuditLog } from '../lib/audit';

interface ProfilePageProps {
  user: User;
  onClose: () => void;
  onUserUpdate?: (patch: Partial<User>) => void;
  isEmployee?: boolean;
}

type SupportTicketItem = {
  id: string;
  subject: string;
  title?: string;
  message: string;
  priority: 'low' | 'medium' | 'high';
  status: string;
  userId: string;
  userName?: string;
  userRole?: string;
  companyId?: string | null;
  companyName?: string | null;
  createdAt?: any;
  updatedAt?: any;
};

function toMillis(value: unknown): number {
  if (!value) return 0;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? 0 : value.getTime();
  if (typeof value === 'object' && value !== null) {
    const maybeTimestamp = value as { toDate?: () => Date; seconds?: number };
    if (typeof maybeTimestamp.toDate === 'function') {
      const parsed = maybeTimestamp.toDate();
      return parsed instanceof Date && !Number.isNaN(parsed.getTime()) ? parsed.getTime() : 0;
    }
    if (typeof maybeTimestamp.seconds === 'number') return maybeTimestamp.seconds * 1000;
  }
  return 0;
}

export default function ProfilePage({ user, onClose, onUserUpdate, isEmployee }: ProfilePageProps) {
  const [mobile, setMobile] = useState(user.phone || '');
  const [email, setEmail] = useState(user.email || '');
  const [profileImageUrl, setProfileImageUrl] = useState(user.profileImageUrl || '');
  const [brandLogoUrl, setBrandLogoUrl] = useState(user.brandLogoUrl || '');
  const [brandLogoFile, setBrandLogoFile] = useState<File | null>(null);
  const [brandCompanyName, setBrandCompanyName] = useState(user.brandCompanyName || '');
  const [brandTagline, setBrandTagline] = useState(user.brandTagline || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [installPromptEvent, setInstallPromptEvent] = useState<any | null>(null);
  const [ticketSubject, setTicketSubject] = useState('');
  const [ticketMessage, setTicketMessage] = useState('');
  const [ticketPriority, setTicketPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [ticketLoading, setTicketLoading] = useState(false);
  const [supportTab, setSupportTab] = useState<'help' | 'tickets'>('help');
  const [showRaiseTicketForm, setShowRaiseTicketForm] = useState(false);
  const [myTickets, setMyTickets] = useState<SupportTicketItem[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(true);
  const [selectedTicketId, setSelectedTicketId] = useState<string>('');
  const canEditBrand = user.role === 'admin' || user.role === 'client_admin' || user.role === 'manager' || user.role === 'super_admin';
  const isCompanyAdminLike = user.role === 'admin' || user.role === 'client_admin' || user.role === 'manager';
  const isCompanyBrandOwner = user.role === 'admin' || user.role === 'client_admin';

  const isStandalone = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
  }, []);

  const platform = useMemo(() => {
    const ua = navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod/.test(ua)) return 'ios';
    if (/android/.test(ua)) return 'android';
    if (/macintosh|mac os x/.test(ua)) return 'mac';
    if (/windows/.test(ua)) return 'windows';
    return 'desktop';
  }, []);

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPromptEvent(event as any);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
  }, []);

  useEffect(() => {
    setTicketsLoading(true);
    const companyId = (user as any).clientId ? String((user as any).clientId) : '';
    const ticketQuery = isCompanyAdminLike && companyId
      ? query(collection(db, 'supportTickets'), where('companyId', '==', companyId))
      : query(collection(db, 'supportTickets'), where('userId', '==', user.uid));

    const unsubscribe = onSnapshot(
      ticketQuery,
      (snapshot) => {
        const nextTickets = snapshot.docs
          .map((item) => ({ id: item.id, ...item.data() } as SupportTicketItem))
          .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
        setMyTickets(nextTickets);
        setSelectedTicketId((prev) => prev || nextTickets[0]?.id || '');
        setTicketsLoading(false);
      },
      () => setTicketsLoading(false)
    );

    return () => unsubscribe();
  }, [isCompanyAdminLike, user]);

  const handleInstallApp = async () => {
    if (!installPromptEvent) return;
    await installPromptEvent.prompt();
    await installPromptEvent.userChoice.catch(() => {});
    setInstallPromptEvent(null);
  };

  const normalizePhone = (value: string) => value.replace(/\D/g, '');

  const uploadBrandLogo = async (file: File) => {
    const cloudName = String(import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || '').trim();
    const uploadPreset = String(import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || '').trim();
    if (!cloudName || !uploadPreset) {
      throw new Error('Cloudinary is not configured. Please contact admin.');
    }

    const body = new FormData();
    body.append('file', file);
    body.append('upload_preset', uploadPreset);
    body.append('folder', 'brand-logos');

    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`, {
      method: 'POST',
      body,
    });
    const result = await response.json().catch(() => null) as { secure_url?: string; error?: { message?: string } } | null;
    if (!response.ok || !result?.secure_url) {
      throw new Error(result?.error?.message || 'Brand logo upload failed.');
    }

    return result.secure_url;
  };

  const handleAvatarUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 1024 * 1024) {
      setError('Profile image should be under 1 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setProfileImageUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleBrandLogoUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 1024 * 1024) {
      setError('Brand logo should be under 1 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setBrandLogoFile(file);
        setBrandLogoUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleUpdateProfile = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    const currentUser = auth.currentUser;
    if (!currentUser) {
      setError('You are signed out. Please login again.');
      return;
    }

    const normalizedPhone = normalizePhone(mobile);
    if (normalizedPhone.length < 10 || normalizedPhone.length > 15) {
      setError('Enter a valid mobile number (10 to 15 digits).');
      return;
    }
    if (!email.trim()) {
      setError('Email is required.');
      return;
    }

    setLoading(true);
    try {
      const loginEmail = `${normalizedPhone}@estatepulse.com`;
      if (currentUser.email !== loginEmail) {
        if (!currentPassword) {
          setError('Enter current password to update mobile number.');
          return;
        }
        const credential = EmailAuthProvider.credential(currentUser.email || `${user.phone}@estatepulse.com`, currentPassword);
        await reauthenticateWithCredential(currentUser, credential);
        await updateEmail(currentUser, loginEmail);
      }

      const uploadedBrandLogoUrl = brandLogoFile ? await uploadBrandLogo(brandLogoFile) : brandLogoUrl.trim();

      await updateDoc(doc(db, 'users', user.uid), {
        phone: normalizedPhone,
        email: email.trim().toLowerCase(),
        profileImageUrl: profileImageUrl.trim(),
        ...(canEditBrand
          ? {
              brandLogoUrl: uploadedBrandLogoUrl,
              brandCompanyName: brandCompanyName.trim(),
              brandTagline: brandTagline.trim(),
            }
          : {}),
      });
      if (isCompanyBrandOwner && (user as any).clientId) {
        await setDoc(doc(db, 'clientBranding', String((user as any).clientId)), {
          logoUrl: uploadedBrandLogoUrl,
          companyName: brandCompanyName.trim(),
          tagline: brandTagline.trim(),
          updatedAt: serverTimestamp(),
          updatedBy: user.uid,
        }, { merge: true });
      }
      onUserUpdate?.({
        phone: normalizedPhone,
        email: email.trim().toLowerCase(),
        profileImageUrl: profileImageUrl.trim(),
        ...(canEditBrand
          ? {
              brandLogoUrl: uploadedBrandLogoUrl,
              brandCompanyName: brandCompanyName.trim(),
              brandTagline: brandTagline.trim(),
            }
          : {}),
      });
      await addAuditLog(db, {
        action: 'profile_modified',
        actorId: user.uid,
        actorName: user.name,
        actorRole: user.role,
        targetType: 'user',
        targetId: user.uid,
        clientId: user.clientId,
        description: 'Profile details updated',
        newValue: {
          phone: normalizedPhone,
          email: email.trim().toLowerCase(),
          profileImageUrl: profileImageUrl.trim(),
          brandLogoUrl: canEditBrand ? uploadedBrandLogoUrl : undefined,
          brandCompanyName: canEditBrand ? brandCompanyName.trim() : undefined,
          brandTagline: canEditBrand ? brandTagline.trim() : undefined,
        },
      });
      setBrandLogoUrl(uploadedBrandLogoUrl);
      setBrandLogoFile(null);
      setSuccess('Profile updated successfully.');
    } catch (err: any) {
      if (err?.code === 'auth/wrong-password' || err?.code === 'auth/invalid-credential') {
        setError('Current password is incorrect.');
      } else if (err?.code === 'auth/email-already-in-use') {
        setError('This mobile number is already used by another login.');
      } else if (err?.code === 'auth/requires-recent-login') {
        setError('Please sign in again, then retry profile update.');
      } else {
        setError(err?.message || 'Failed to update profile.');
      }
    } finally {
      setLoading(false);
    }
  };



  const handleRaiseTicket = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    const subject = ticketSubject.trim();
    const message = ticketMessage.trim();
    if (!subject || !message) {
      setError('Ticket subject and message are required.');
      return;
    }
    setTicketLoading(true);
    try {
      await addDoc(collection(db, 'supportTickets'), {
        title: subject,
        subject,
        message,
        priority: ticketPriority,
        status: 'open',
        userId: user.uid,
        userName: user.name,
        userRole: user.role,
        companyId: (user as any).clientId || null,
        companyName: (user as any).clientName || null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setTicketSubject('');
      setTicketMessage('');
      setTicketPriority('medium');
      setSuccess('Support ticket raised successfully.');
      setShowRaiseTicketForm(false);
      setSupportTab('tickets');
    } catch (err: any) {
      setError(err?.message || 'Failed to raise support ticket.');
    } finally {
      setTicketLoading(false);
    }
  };

  const selectedTicket = myTickets.find((ticket) => ticket.id === selectedTicketId) || null;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-2xl font-bold text-gray-900">Profile</h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            <ArrowLeft size={16} />
            Back
          </button>
        </div>
        <p className="text-sm text-gray-500 mt-1">Manage your account details and password.</p>

        <form onSubmit={handleUpdateProfile} className="mt-5 space-y-4">
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-2xl overflow-hidden border border-gray-200 bg-gray-100 flex items-center justify-center">
              {profileImageUrl ? (
                <img src={profileImageUrl} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <UserCircle2 size={34} className="text-gray-400" />
              )}
            </div>
            <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100">
              <Camera size={14} /> Upload Photo
              <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
            </label>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Mobile</label>
              <input
                type="tel"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Current Password (required if mobile changes)</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          {canEditBrand && (
            <div className="rounded-2xl border border-blue-100 bg-blue-50/40 p-4 space-y-3">
              <p className="text-sm font-bold text-blue-900">Self Brand</p>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Company Logo</label>
                <div className="flex items-center gap-3">
                  <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-gray-200 text-xs font-semibold text-gray-700 cursor-pointer hover:bg-gray-100">
                    <Camera size={14} /> Upload Logo
                    <input type="file" accept="image/*" className="hidden" onChange={handleBrandLogoUpload} />
                  </label>
                  {brandLogoUrl ? (
                    <>
                      <div className="w-10 h-10 rounded-lg overflow-hidden border border-gray-200 bg-gray-100">
                        <img src={brandLogoUrl} alt="Logo preview" className="w-full h-full object-cover" />
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setBrandLogoUrl('');
                          setBrandLogoFile(null);
                        }}
                        className="px-3 py-2 rounded-xl bg-white border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-100"
                      >
                        Remove
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Company Name</label>
                <input
                  type="text"
                  value={brandCompanyName}
                  onChange={(e) => setBrandCompanyName(e.target.value)}
                  className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Footer / Tagline (optional)</label>
                <input
                  type="text"
                  value={brandTagline}
                  onChange={(e) => setBrandTagline(e.target.value)}
                  className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <p className="text-xs text-blue-700">This branding is shown to you and all users assigned under you.</p>
            </div>
          )}
          <button type="submit" disabled={loading} className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl shadow-lg shadow-blue-200 active:scale-95 transition-all disabled:opacity-60">
            {loading ? 'Saving...' : 'Save Profile'}
          </button>
        </form>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100">
            <p className="text-xs text-gray-500 font-semibold flex items-center gap-2">
              <UserCircle2 size={14} /> Name
            </p>
            <p className="text-sm text-gray-900 font-bold mt-1">{user.name}</p>
          </div>
          <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100">
            <p className="text-xs text-gray-500 font-semibold flex items-center gap-2">
              <Shield size={14} /> Role
            </p>
            <p className="text-sm text-gray-900 font-bold mt-1 capitalize">{user.role}</p>
          </div>
          <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100">
            <p className="text-xs text-gray-500 font-semibold flex items-center gap-2">
              <Phone size={14} /> Mobile
            </p>
            <p className="text-sm text-gray-900 font-bold mt-1">{user.phone}</p>
          </div>
          <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100">
            <p className="text-xs text-gray-500 font-semibold flex items-center gap-2">
              <Mail size={14} /> Email
            </p>
            <p className="text-sm text-gray-900 font-bold mt-1">{user.email}</p>
          </div>
        </div>
      </div>

      {!isEmployee && (
      <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm">
        <h3 className="text-xl font-bold text-gray-900">Download Web App</h3>
        <p className="mt-1 text-sm text-gray-500">Install EstatePulse on mobile or desktop for app-like experience.</p>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">Quick Install</p>
            {isStandalone ? (
              <p className="mt-2 text-sm font-bold text-green-700">Web app is already installed on this device.</p>
            ) : installPromptEvent ? (
              <button
                type="button"
                onClick={handleInstallApp}
                className="mt-2 w-full py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold"
              >
                Install EstatePulse App
              </button>
            ) : (
              <p className="mt-2 text-sm text-gray-600">Direct install prompt is not available on this browser right now.</p>
            )}
          </div>
          <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">Current Device</p>
            <p className="mt-2 text-sm font-bold text-gray-900 capitalize">{platform}</p>
            <p className="mt-1 text-xs text-gray-600">
              {platform === 'ios'
                ? 'Open Share menu in Safari and choose "Add to Home Screen".'
                : platform === 'android'
                  ? 'In Chrome, open menu and tap "Install app" or "Add to Home screen".'
                  : platform === 'mac'
                    ? 'Use Chrome/Edge menu and choose "Install EstatePulse", or Safari Add to Dock.'
                    : platform === 'windows'
                      ? 'Use Chrome/Edge menu and choose "Install EstatePulse".'
                      : 'Use browser menu and choose install/add to home screen.'}
            </p>
          </div>
          <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100 md:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">Other Platforms</p>
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-gray-700">
              <p><span className="font-bold">Mobile:</span> Android Chrome or iPhone Safari to Home Screen.</p>
              <p><span className="font-bold">Windows:</span> Chrome/Edge menu -&gt; Install App.</p>
              <p><span className="font-bold">Mac:</span> Chrome/Edge install menu or Safari Add to Dock.</p>
            </div>
          </div>
        </div>
      </div>
      )}



      {!isEmployee && (
      <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm">
        <h3 className="text-xl font-bold text-gray-900">Help & Support</h3>
        <p className="mt-1 text-sm text-gray-500">Raise and track support requests for your account.</p>
        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="inline-flex rounded-xl border border-gray-200 bg-gray-50 p-1">
            <button
              type="button"
              onClick={() => setSupportTab('help')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold ${supportTab === 'help' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600'}`}
            >
              Help
            </button>
            <button
              type="button"
              onClick={() => setSupportTab('tickets')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold ${supportTab === 'tickets' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600'}`}
            >
              My Tickets
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              setSupportTab('help');
              setShowRaiseTicketForm((prev) => !prev);
            }}
            className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-bold shadow-lg shadow-blue-200"
          >
            {showRaiseTicketForm ? 'Close Form' : 'Raise Ticket'}
          </button>
        </div>

        {supportTab === 'help' && (
          <div className="mt-4 space-y-4">
            <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-4 text-sm text-blue-900">
              Share exact issue details, affected page, and expected outcome for faster resolution.
            </div>
            {showRaiseTicketForm && (
              <form onSubmit={handleRaiseTicket} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Subject</label>
                  <input
                    type="text"
                    value={ticketSubject}
                    onChange={(e) => setTicketSubject(e.target.value)}
                    placeholder="Brief issue title"
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Priority</label>
                  <select
                    value={ticketPriority}
                    onChange={(e) => setTicketPriority(e.target.value as 'low' | 'medium' | 'high')}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Message</label>
                  <textarea
                    value={ticketMessage}
                    onChange={(e) => setTicketMessage(e.target.value)}
                    rows={4}
                    placeholder="Describe the issue in detail"
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={ticketLoading}
                  className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl shadow-lg shadow-blue-200 active:scale-95 transition-all disabled:opacity-60"
                >
                  {ticketLoading ? 'Submitting Ticket...' : 'Raise Ticket'}
                </button>
              </form>
            )}
          </div>
        )}

        {supportTab === 'tickets' && (
          <div className="mt-4 space-y-4">
            {ticketsLoading ? (
              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 text-sm text-gray-600">Loading tickets...</div>
            ) : myTickets.length === 0 ? (
              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 text-sm text-gray-600">
                No tickets found. Use the Raise Ticket button to create your first request.
              </div>
            ) : (
              <div className="space-y-3">
                {myTickets.map((ticket) => (
                  <button
                    key={ticket.id}
                    type="button"
                    onClick={() => setSelectedTicketId(ticket.id)}
                    className={`w-full text-left rounded-2xl border p-3 transition ${selectedTicketId === ticket.id ? 'border-blue-300 bg-blue-50/50' : 'border-gray-100 bg-white hover:bg-gray-50'}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-bold text-gray-900">{ticket.subject || ticket.title || '-'}</p>
                      <span className={`text-[11px] font-bold px-2 py-1 rounded-full ${String(ticket.status || 'open').toLowerCase() === 'closed' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                        {String(ticket.status || 'open').replace('_', ' ')}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">#{ticket.id.slice(0, 8)} · Priority: {(ticket.priority || 'medium').toUpperCase()}</p>
                  </button>
                ))}
              </div>
            )}

            {selectedTicket && (
              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                <p className="text-sm font-bold text-gray-900">{selectedTicket.subject || selectedTicket.title || '-'}</p>
                <p className="mt-1 text-xs text-gray-500">
                  Ticket ID: {selectedTicket.id} · Created: {toMillis(selectedTicket.createdAt) ? new Date(toMillis(selectedTicket.createdAt)).toLocaleString() : 'N/A'}
                </p>
                <p className="mt-3 text-sm text-gray-700 whitespace-pre-wrap">{selectedTicket.message || 'No description provided.'}</p>
              </div>
            )}
          </div>
        )}
      </div>
      )}
    </div>
  );
}

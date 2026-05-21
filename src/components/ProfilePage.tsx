import { FormEvent, useEffect, useMemo, useState } from 'react';
import { auth, db } from '../lib/firebase';
import { EmailAuthProvider, reauthenticateWithCredential, updateEmail, updatePassword } from 'firebase/auth';
import { addDoc, collection, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { User } from '../types';
import { ArrowLeft, Camera, Lock, Mail, Phone, Shield, UserCircle2 } from 'lucide-react';

interface ProfilePageProps {
  user: User;
  onClose: () => void;
  onUserUpdate?: (patch: Partial<User>) => void;
}

export default function ProfilePage({ user, onClose, onUserUpdate }: ProfilePageProps) {
  const [mobile, setMobile] = useState(user.phone || '');
  const [email, setEmail] = useState(user.email || '');
  const [profileImageUrl, setProfileImageUrl] = useState(user.profileImageUrl || '');
  const [brandLogoUrl, setBrandLogoUrl] = useState(user.brandLogoUrl || '');
  const [brandCompanyName, setBrandCompanyName] = useState(user.brandCompanyName || '');
  const [brandTagline, setBrandTagline] = useState(user.brandTagline || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [installPromptEvent, setInstallPromptEvent] = useState<any | null>(null);
  const [ticketSubject, setTicketSubject] = useState('');
  const [ticketMessage, setTicketMessage] = useState('');
  const [ticketPriority, setTicketPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [ticketLoading, setTicketLoading] = useState(false);
  const canEditBrand = user.role === 'admin' || user.role === 'client_admin' || user.role === 'manager' || user.role === 'super_admin';

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

  const handleInstallApp = async () => {
    if (!installPromptEvent) return;
    await installPromptEvent.prompt();
    await installPromptEvent.userChoice.catch(() => {});
    setInstallPromptEvent(null);
  };

  const normalizePhone = (value: string) => value.replace(/\D/g, '');

  const handleAvatarUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
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

      await updateDoc(doc(db, 'users', user.uid), {
        phone: normalizedPhone,
        email: email.trim().toLowerCase(),
        profileImageUrl: profileImageUrl.trim(),
        ...(canEditBrand
          ? {
              brandLogoUrl: brandLogoUrl.trim(),
              brandCompanyName: brandCompanyName.trim(),
              brandTagline: brandTagline.trim(),
            }
          : {}),
      });
      onUserUpdate?.({
        phone: normalizedPhone,
        email: email.trim().toLowerCase(),
        profileImageUrl: profileImageUrl.trim(),
        ...(canEditBrand
          ? {
              brandLogoUrl: brandLogoUrl.trim(),
              brandCompanyName: brandCompanyName.trim(),
              brandTagline: brandTagline.trim(),
            }
          : {}),
      });
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

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!currentPassword) {
      setError('Enter your current password.');
      return;
    }
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New password and confirm password do not match.');
      return;
    }

    const currentUser = auth.currentUser;
    if (!currentUser) {
      setError('You are signed out. Please login again.');
      return;
    }

    const email = currentUser.email || `${user.phone}@estatepulse.com`;
    setLoading(true);
    try {
      const credential = EmailAuthProvider.credential(email, currentPassword);
      await reauthenticateWithCredential(currentUser, credential);
      await updatePassword(currentUser, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSuccess('Password updated successfully.');
    } catch (err: any) {
      if (err?.code === 'auth/wrong-password' || err?.code === 'auth/invalid-credential') {
        setError('Current password is incorrect.');
      } else if (err?.code === 'auth/too-many-requests') {
        setError('Too many attempts. Wait a few minutes and try again.');
      } else {
        setError(err?.message || 'Failed to update password.');
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
    } catch (err: any) {
      setError(err?.message || 'Failed to raise support ticket.');
    } finally {
      setTicketLoading(false);
    }
  };

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
                <label className="block text-sm font-semibold text-gray-700 mb-1">Company Logo URL</label>
                <input
                  type="text"
                  value={brandLogoUrl}
                  onChange={(e) => setBrandLogoUrl(e.target.value)}
                  placeholder="https://... or base64 data URL"
                  className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                />
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

      <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm">
        <h3 className="text-xl font-bold text-gray-900">Change Password</h3>
        <form onSubmit={handleChangePassword} className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Current Password</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">New Password</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                required
                minLength={8}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Confirm New Password</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                required
                minLength={8}
              />
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-600">
              {error}
            </div>
          )}
          {success && (
            <div className="p-3 bg-green-50 border border-green-100 rounded-lg text-sm text-green-700">
              {success}
            </div>
          )}

          <div className="mt-2 rounded-2xl border border-gray-100 bg-gray-50/60 p-3 sm:p-4">
            <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 font-bold text-gray-500 hover:bg-gray-100 rounded-xl transition-colors"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl shadow-lg shadow-blue-200 active:scale-95 transition-all disabled:opacity-60"
            >
              {loading ? 'Updating...' : 'Update Password'}
            </button>
            </div>
          </div>
        </form>
      </div>

      <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm">
        <h3 className="text-xl font-bold text-gray-900">Help & Support</h3>
        <p className="mt-1 text-sm text-gray-500">Facing an issue? Raise a ticket and our team will respond.</p>
        <form onSubmit={handleRaiseTicket} className="mt-4 space-y-4">
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
      </div>
    </div>
  );
}

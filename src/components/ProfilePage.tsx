import { FormEvent, useState } from 'react';
import { auth, db } from '../lib/firebase';
import { EmailAuthProvider, reauthenticateWithCredential, updateEmail, updatePassword } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { User } from '../types';
import { Camera, Lock, Mail, Phone, Shield, UserCircle2 } from 'lucide-react';

interface ProfilePageProps {
  user: User;
  onClose: () => void;
  onUserUpdate?: (patch: Partial<User>) => void;
}

export default function ProfilePage({ user, onClose, onUserUpdate }: ProfilePageProps) {
  const [mobile, setMobile] = useState(user.phone || '');
  const [email, setEmail] = useState(user.email || '');
  const [profileImageUrl, setProfileImageUrl] = useState(user.profileImageUrl || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

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
      });
      onUserUpdate?.({
        phone: normalizedPhone,
        email: email.trim().toLowerCase(),
        profileImageUrl: profileImageUrl.trim(),
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

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm">
        <h2 className="text-2xl font-bold text-gray-900">Profile</h2>
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
    </div>
  );
}

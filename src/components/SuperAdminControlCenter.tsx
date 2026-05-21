import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { AlertCircle, Building2, Headset, LayoutDashboard, Settings, ShieldCheck, Users } from 'lucide-react';
import { db, functions } from '../lib/firebase';
import { AuditLogEntry, PlatformClient, User } from '../types';
import { httpsCallable } from 'firebase/functions';

type Props = {
  user: User;
  onStartImpersonation: (payload: { clientId: string; clientName: string }) => Promise<void>;
};

type Module = 'dashboard' | 'companies' | 'users' | 'support' | 'settings';
type CompanyStatus = 'active' | 'trial' | 'suspended' | 'expired' | 'archived' | 'deleted_permanently';

type CompanyRecord = PlatformClient & {
  contactPerson?: string;
  mobileNumber?: string;
  email?: string;
  address?: string;
  billingCycle?: 'monthly' | 'quarterly' | 'yearly';
  subscriptionStartDate?: string;
  subscriptionExpiryDate?: string;
  paymentStatus?: 'paid' | 'pending' | 'overdue';
  paymentMode?: 'bank_transfer' | 'upi' | 'cash' | 'cheque';
  notes?: string;
  createdAt?: any;
};

type SupportTicket = {
  id: string;
  companyId?: string;
  companyName?: string;
  subject?: string;
  priority?: 'low' | 'medium' | 'high';
  status?: 'open' | 'in_progress' | 'waiting' | 'resolved' | 'closed';
  assignedTo?: string;
  createdAt?: any;
};

const MODULES: Array<{ id: Module; label: string; icon: any }> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'companies', label: 'Companies', icon: Building2 },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'support', label: 'Support', icon: Headset },
  { id: 'settings', label: 'Settings', icon: Settings },
];

const statusClass: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  trial: 'bg-blue-100 text-blue-700',
  suspended: 'bg-amber-100 text-amber-700',
  expired: 'bg-rose-100 text-rose-700',
  archived: 'bg-slate-100 text-slate-700',
  deleted_permanently: 'bg-slate-200 text-slate-800',
};

const toMillis = (value: unknown) => {
  if (!value) return 0;
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (typeof value === 'object' && value !== null) {
    const maybe = value as { toDate?: () => Date; seconds?: number };
    if (typeof maybe.toDate === 'function') return maybe.toDate().getTime();
    if (typeof maybe.seconds === 'number') return maybe.seconds * 1000;
  }
  return 0;
};

const asDateInput = (value?: any) => {
  const ms = toMillis(value);
  if (!ms) return '';
  return new Date(ms).toISOString().slice(0, 10);
};

const asDateTime = (value?: any) => {
  const ms = toMillis(value);
  if (!ms) return 'N/A';
  return new Date(ms).toLocaleString();
};

export default function SuperAdminControlCenter({ user, onStartImpersonation }: Props) {
  const [module, setModule] = useState<Module>('dashboard');
  const [clients, setClients] = useState<CompanyRecord[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [companySearch, setCompanySearch] = useState('');
  const [companyTableSort, setCompanyTableSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: 'name', dir: 'asc' });
  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState<'all' | User['role']>('all');
  const [userCompanyFilter, setUserCompanyFilter] = useState<string>('all');
  const [showAddCompany, setShowAddCompany] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [globalSettings, setGlobalSettings] = useState({
    supportEmail: '',
    loginRateLimitPerMin: '10',
    apiRateLimitPerMin: '120',
  });
  const [companyForm, setCompanyForm] = useState({
    companyName: '',
    contactPerson: '',
    mobileNumber: '',
    email: '',
    address: '',
    billingCycle: 'monthly' as 'monthly' | 'quarterly' | 'yearly',
    subscriptionStartDate: '',
    subscriptionExpiryDate: '',
    paymentStatus: 'pending' as 'paid' | 'pending' | 'overdue',
    paymentMode: 'bank_transfer' as 'bank_transfer' | 'upi' | 'cash' | 'cheque',
    notes: '',
    trialDays: '0',
  });
  const [backupPayload, setBackupPayload] = useState<any | null>(null);
  const backupRestoreInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const unsubClients = onSnapshot(query(collection(db, 'platformClients'), orderBy('name', 'asc')), (sn) => {
      setClients(sn.docs.map((d) => ({ id: d.id, ...d.data() } as CompanyRecord)));
    });
    const unsubUsers = onSnapshot(query(collection(db, 'users'), orderBy('createdAt', 'desc')), (sn) => {
      setAllUsers(sn.docs.map((d) => ({ uid: d.id, ...d.data() } as User)));
    });
    const unsubAudit = onSnapshot(query(collection(db, 'auditLogs'), orderBy('createdAt', 'desc')), (sn) => {
      setAuditLogs(sn.docs.slice(0, 150).map((d) => ({ id: d.id, ...d.data() } as AuditLogEntry)));
    });
    const unsubTickets = onSnapshot(query(collection(db, 'supportTickets'), orderBy('createdAt', 'desc')), (sn) => {
      setTickets(sn.docs.map((d) => ({ id: d.id, ...d.data() } as SupportTicket)));
    });
    const unsubSettings = onSnapshot(doc(db, 'platformConfig', 'global'), (snap) => {
      if (snap.exists()) setGlobalSettings((prev) => ({ ...prev, ...(snap.data() as any) }));
    });
    return () => {
      unsubClients();
      unsubUsers();
      unsubAudit();
      unsubTickets();
      unsubSettings();
    };
  }, []);

  useEffect(() => {
    const todayMs = Date.now();
    clients.forEach((client) => {
      if (client.state === 'suspended' || client.state === 'deleted_permanently') return;
      const expiryMs = toMillis(client.subscriptionExpiryDate);
      if (expiryMs && expiryMs < todayMs && client.state !== 'expired') {
        void updateDoc(doc(db, 'platformClients', client.id), {
          state: 'expired',
          updatedAt: serverTimestamp(),
        });
      }
    });
  }, [clients]);

  const logAudit = async (action: string, payload: Record<string, unknown>) => {
    await addDoc(collection(db, 'auditLogs'), {
      action,
      actorId: user.uid,
      actorName: user.name,
      ...payload,
      createdAt: serverTimestamp(),
    });
  };

  const companies = useMemo(() => {
    const q = companySearch.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((client) =>
      [client.id, client.name, client.contactPerson, client.email, client.mobileNumber].some((value) =>
        String(value || '')
          .toLowerCase()
          .includes(q)
      )
    );
  }, [clients, companySearch]);

  const sortedCompanies = useMemo(() => {
    const compareValues = (a: unknown, b: unknown) => {
      const aNum = typeof a === 'number' ? a : Number.NaN;
      const bNum = typeof b === 'number' ? b : Number.NaN;
      if (!Number.isNaN(aNum) && !Number.isNaN(bNum)) return aNum - bNum;
      return String(a ?? '').localeCompare(String(b ?? ''), undefined, { sensitivity: 'base' });
    };
    const list = [...companies];
    list.sort((a, b) => {
      const mapA: Record<string, unknown> = {
        id: a.id,
        name: a.name,
        contact: a.contactPerson,
        mobile: a.mobileNumber,
        email: a.email,
        billing: a.billingCycle,
        expiry: asDateInput(a.subscriptionExpiryDate),
        status: a.state,
        created: toMillis(a.createdAt),
      };
      const mapB: Record<string, unknown> = {
        id: b.id,
        name: b.name,
        contact: b.contactPerson,
        mobile: b.mobileNumber,
        email: b.email,
        billing: b.billingCycle,
        expiry: asDateInput(b.subscriptionExpiryDate),
        status: b.state,
        created: toMillis(b.createdAt),
      };
      const result = compareValues(mapA[companyTableSort.key], mapB[companyTableSort.key]);
      return companyTableSort.dir === 'asc' ? result : -result;
    });
    return list;
  }, [companies, companyTableSort]);

  const mappedUsers = useMemo(
    () =>
      allUsers.map((member) => {
        const companyId = (member as any).clientId || 'n/a';
        const company = clients.find((c) => c.id === companyId);
        return { ...member, companyId, companyName: company?.name || 'N/A', lastLoginAt: (member as any).lastLoginAt };
      }),
    [allUsers, clients]
  );

  const users = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    return mappedUsers.filter((member) => {
      const passRole = userRoleFilter === 'all' || member.role === userRoleFilter;
      const passCompany = userCompanyFilter === 'all' || member.companyId === userCompanyFilter;
      const passSearch =
        !q ||
        [member.name, member.email, member.phone, member.companyName]
          .join(' ')
          .toLowerCase()
          .includes(q);
      return passRole && passCompany && passSearch;
    });
  }, [mappedUsers, userSearch, userRoleFilter, userCompanyFilter]);

  const stats = useMemo(() => {
    const now = Date.now();
    const in30Days = now + 30 * 24 * 60 * 60 * 1000;
    const active = clients.filter((c) => c.state === 'active').length;
    const expired = clients.filter((c) => c.state === 'expired').length;
    const renewals = clients.filter((c) => {
      const expiry = toMillis(c.subscriptionExpiryDate);
      return expiry >= now && expiry <= in30Days;
    }).length;
    return {
      totalCompanies: clients.length,
      activeCompanies: active,
      expiredCompanies: expired,
      totalUsers: allUsers.length,
      pendingRenewals: renewals,
    };
  }, [clients, allUsers]);

  const selectedCompany = clients.find((c) => c.id === selectedCompanyId) || null;

  const confirmAndUpdateStatus = async (client: CompanyRecord, state: CompanyStatus) => {
    const actionLabel = state === 'suspended' ? 'Suspend' : state === 'active' ? 'Activate' : 'Update';
    if (!window.confirm(`${actionLabel} ${client.name}? This action may affect active users.`)) return;
    await updateDoc(doc(db, 'platformClients', client.id), { state, updatedAt: serverTimestamp() });
    await logAudit('company_status_changed', {
      targetType: 'client',
      targetId: client.id,
      newValue: { state },
    });
  };

  const handleSaveCompany = async (e: FormEvent) => {
    e.preventDefault();
    const email = companyForm.email.trim().toLowerCase();
    const phone = companyForm.mobileNumber.trim();
    if (!companyForm.companyName.trim() || !email) {
      alert('Company name and email are required.');
      return;
    }
    if (!/^\+?\d{10,15}$/.test(phone)) {
      alert('Enter a valid mobile number (10-15 digits).');
      return;
    }
    const existingCompanyEmail = clients.some((c) => String(c.email || '').toLowerCase() === email);
    const existingUserEmail = allUsers.some((u) => String(u.email || '').toLowerCase() === email);
    if (existingCompanyEmail || existingUserEmail) {
      alert('Email already exists.');
      return;
    }
    if (companyForm.subscriptionStartDate && companyForm.subscriptionExpiryDate) {
      const start = new Date(companyForm.subscriptionStartDate).getTime();
      const end = new Date(companyForm.subscriptionExpiryDate).getTime();
      if (start >= end) {
        alert('Expiry date must be greater than start date.');
        return;
      }
    }
    const trialDays = Number(companyForm.trialDays || '0');
    const hasTrial = Number.isFinite(trialDays) && trialDays > 0;
    const now = Date.now();
    let subscriptionStartDate = companyForm.subscriptionStartDate || null;
    let subscriptionExpiryDate = companyForm.subscriptionExpiryDate || null;
    if (hasTrial) {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const expiry = new Date(start);
      expiry.setDate(expiry.getDate() + trialDays);
      subscriptionStartDate = start.toISOString().slice(0, 10);
      subscriptionExpiryDate = expiry.toISOString().slice(0, 10);
    }
    const expiryMs = subscriptionExpiryDate ? new Date(subscriptionExpiryDate).getTime() : NaN;
    const state: CompanyStatus = hasTrial ? 'trial' : Number.isNaN(expiryMs) ? 'active' : expiryMs < now ? 'expired' : 'active';
    const clientRef = await addDoc(collection(db, 'platformClients'), {
      name: companyForm.companyName.trim(),
      contactPerson: companyForm.contactPerson.trim(),
      mobileNumber: phone,
      email,
      address: companyForm.address.trim(),
      billingCycle: companyForm.billingCycle,
      subscriptionStartDate,
      subscriptionExpiryDate,
      paymentStatus: companyForm.paymentStatus,
      paymentMode: companyForm.paymentMode,
      notes: companyForm.notes.trim(),
      trialDays: hasTrial ? trialDays : 0,
      state,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: user.uid,
    });

    const adminRef = doc(collection(db, 'users'));
    await updateDoc(doc(db, 'platformClients', clientRef.id), { adminUid: adminRef.id });
    await addDoc(collection(db, 'auditLogs'), {
      action: 'company_created',
      actorId: user.uid,
      actorName: user.name,
      targetType: 'client',
      targetId: clientRef.id,
      createdAt: serverTimestamp(),
    });
    await setDoc(adminRef, {
      uid: adminRef.id,
      name: companyForm.contactPerson.trim() || `${companyForm.companyName.trim()} Admin`,
      email,
      phone,
      role: 'client_admin',
      clientId: clientRef.id,
      createdAt: serverTimestamp(),
    });

    setShowAddCompany(false);
    setCompanyForm({
      companyName: '',
      contactPerson: '',
      mobileNumber: '',
      email: '',
      address: '',
      billingCycle: 'monthly',
      subscriptionStartDate: '',
      subscriptionExpiryDate: '',
      paymentStatus: 'pending',
      paymentMode: 'bank_transfer',
      notes: '',
      trialDays: '0',
    });
  };

  const resetPassword = async (member: User) => {
    if (!functions) {
      alert('Firebase Functions is not available.');
      return;
    }
    const suggested = String(member.phone || '').replace(/\D/g, '');
    const entered = window.prompt(`Enter temporary password for ${member.name}. Leave empty to use mobile number.`, suggested);
    if (entered === null) return;
    const nextPassword = entered.trim() || suggested;
    if (nextPassword.length < 8) {
      alert('Password must be at least 8 characters.');
      return;
    }

    const fn = httpsCallable(functions, 'resetUserPassword');
    await fn({ targetUid: member.uid, targetPhone: suggested, newPassword: nextPassword });
    await logAudit('user_password_reset_requested', { targetType: 'user', targetId: member.uid, meta: { by: user.uid } });
    alert(`Password reset successful.\nTemporary password: ${nextPassword}`);
  };

  const forceLogout = async (targetUid: string) => {
    if (!functions) {
      alert('Firebase Functions is not available.');
      return;
    }
    const fn = httpsCallable(functions, 'forceLogoutUser');
    await fn({ targetUid });
    await updateDoc(doc(db, 'users', targetUid), { lastForcedLogoutAt: serverTimestamp() }).catch(() => {});
    alert('User logged out.');
  };

  const toggleBlockUser = async (member: User) => {
    if (member.role === 'super_admin' || member.role === 'admin') {
      alert('Cannot block super admin/admin accounts from this panel.');
      return;
    }
    if (member.role === 'suspended') {
      const previousRole = ((member as any).previousRole as User['role'] | undefined) || 'employee';
      await updateDoc(doc(db, 'users', member.uid), {
        role: previousRole,
        previousRole: null,
        updatedAt: serverTimestamp(),
      });
      await logAudit('user_unblocked', { targetType: 'user', targetId: member.uid, newValue: { role: previousRole } });
      return;
    }

    await updateDoc(doc(db, 'users', member.uid), {
      previousRole: member.role,
      role: 'suspended',
      updatedAt: serverTimestamp(),
    });
    await logAudit('user_blocked', { targetType: 'user', targetId: member.uid, oldValue: { role: member.role }, newValue: { role: 'suspended' } });
  };

  const serializeValue = (value: any): any => {
    if (value && typeof value === 'object') {
      if (typeof value.toDate === 'function') {
        return { __type: 'date', value: value.toDate().toISOString() };
      }
      if (Array.isArray(value)) {
        return value.map(serializeValue);
      }
      const output: Record<string, any> = {};
      Object.keys(value).forEach((key) => {
        output[key] = serializeValue(value[key]);
      });
      return output;
    }
    return value;
  };

  const deserializeValue = (value: any): any => {
    if (!value || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(deserializeValue);
    if (value.__type === 'date' && value.value) return new Date(value.value);
    const output: Record<string, any> = {};
    Object.keys(value).forEach((key) => {
      output[key] = deserializeValue(value[key]);
    });
    return output;
  };

  const createBackup = async () => {
    const collectionsToBackup = ['platformClients', 'users', 'platformConfig', 'supportTickets', 'auditLogs'];
    const payload: any = {
      version: 1,
      createdAt: new Date().toISOString(),
      createdBy: user.uid,
      collections: {},
    };
    for (const collectionName of collectionsToBackup) {
      const snapshot = await getDocs(query(collection(db, collectionName)));
      payload.collections[collectionName] = snapshot.docs.map((item) => ({
        id: item.id,
        data: serializeValue(item.data()),
      }));
    }
    setBackupPayload(payload);
    await logAudit('backup_created', { targetType: 'system', targetId: 'platform_backup', meta: { collections: collectionsToBackup } });
    return payload;
  };

  const downloadBackup = async () => {
    const payload = backupPayload || await createBackup();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(blob);
    anchor.download = `platform-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
    await logAudit('backup_downloaded', { targetType: 'system', targetId: 'platform_backup' });
  };

  const restoreBackupFromFile = async (file: File) => {
    const raw = await file.text();
    const parsed = JSON.parse(raw);
    if (!parsed?.collections || typeof parsed.collections !== 'object') {
      throw new Error('Invalid backup format.');
    }
    if (!window.confirm('Restore this backup now? Existing records in included collections may be overwritten.')) return;

    const collections = Object.entries(parsed.collections) as Array<[string, Array<{ id: string; data: any }>]>;
    for (const [collectionName, records] of collections) {
      if (!Array.isArray(records)) continue;
      for (let i = 0; i < records.length; i += 400) {
        const chunk = records.slice(i, i + 400);
        const batch = writeBatch(db);
        chunk.forEach((record) => {
          if (!record?.id) return;
          batch.set(doc(db, collectionName, record.id), deserializeValue(record.data), { merge: true });
        });
        await batch.commit();
      }
    }
    await logAudit('backup_restored', { targetType: 'system', targetId: 'platform_backup', meta: { sourceFile: file.name } });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)] gap-5">
      <aside className="bg-white border border-gray-200 rounded-2xl p-3 h-fit">
        <h2 className="px-2 pb-3 text-sm font-black text-gray-800 uppercase tracking-wider">Superadmin</h2>
        <div className="space-y-1">
          {MODULES.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => setModule(item.id)}
                className={`w-full px-3 py-2 rounded-xl text-sm font-semibold border flex items-center gap-2 ${
                  module === item.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-200'
                }`}
              >
                <Icon className="w-4 h-4" /> {item.label}
              </button>
            );
          })}
        </div>
      </aside>

      <section className="space-y-4">
        {module === 'dashboard' && (
          <>
            <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
              {[
                ['Total Companies', stats.totalCompanies],
                ['Active Companies', stats.activeCompanies],
                ['Expired Companies', stats.expiredCompanies],
                ['Total Users', stats.totalUsers],
                ['Pending Renewals', stats.pendingRenewals],
              ].map(([label, value]) => (
                <div key={String(label)} className="bg-white border border-gray-200 rounded-2xl p-4">
                  <p className="text-xs text-gray-500 font-semibold">{label}</p>
                  <p className="text-2xl font-black text-gray-900 mt-1">{value}</p>
                </div>
              ))}
            </div>
            <div className="bg-white border border-gray-200 rounded-2xl p-4">
              <h3 className="text-sm font-black text-gray-800 uppercase tracking-wider mb-3">Upcoming Renewals (30 Days)</h3>
              <div className="space-y-2">
                {clients
                  .filter((c) => {
                    const expiry = toMillis(c.subscriptionExpiryDate);
                    return expiry >= Date.now() && expiry <= Date.now() + 30 * 24 * 60 * 60 * 1000;
                  })
                  .slice(0, 10)
                  .map((client) => (
                    <div key={client.id} className="border border-gray-100 rounded-xl p-3 flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-sm text-gray-900">{client.name}</p>
                        <p className="text-xs text-gray-500">Expiry: {asDateInput(client.subscriptionExpiryDate) || 'N/A'}</p>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => { setSelectedCompanyId(client.id); setModule('companies'); }} className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-xs font-semibold">View</button>
                        <button onClick={() => { setSelectedCompanyId(client.id); setModule('companies'); }} className="px-3 py-1.5 rounded-lg bg-blue-100 text-blue-700 text-xs font-semibold">Renew</button>
                        <button onClick={() => confirmAndUpdateStatus(client, 'suspended')} className="px-3 py-1.5 rounded-lg bg-amber-100 text-amber-700 text-xs font-semibold">Suspend</button>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </>
        )}

        {module === 'companies' && (
          <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <input value={companySearch} onChange={(e) => setCompanySearch(e.target.value)} placeholder="Search company" className="w-full sm:w-[320px] px-3 py-2 border border-gray-200 rounded-xl text-sm" />
              <button onClick={() => setShowAddCompany((v) => !v)} className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold">Add Company</button>
            </div>

            {showAddCompany && (
              <form onSubmit={handleSaveCompany} className="grid grid-cols-1 md:grid-cols-2 gap-2 border border-gray-100 rounded-xl p-3">
                <input required value={companyForm.companyName} onChange={(e) => setCompanyForm((p) => ({ ...p, companyName: e.target.value }))} placeholder="Company Name" className="px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                <input value={companyForm.contactPerson} onChange={(e) => setCompanyForm((p) => ({ ...p, contactPerson: e.target.value }))} placeholder="Contact Person" className="px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                <input required value={companyForm.mobileNumber} onChange={(e) => setCompanyForm((p) => ({ ...p, mobileNumber: e.target.value }))} placeholder="Mobile Number" className="px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                <input required type="email" value={companyForm.email} onChange={(e) => setCompanyForm((p) => ({ ...p, email: e.target.value }))} placeholder="Email" className="px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                <input value={companyForm.address} onChange={(e) => setCompanyForm((p) => ({ ...p, address: e.target.value }))} placeholder="Address" className="px-3 py-2 border border-gray-200 rounded-lg text-sm md:col-span-2" />
                <select value={companyForm.billingCycle} onChange={(e) => setCompanyForm((p) => ({ ...p, billingCycle: e.target.value as any }))} className="px-3 py-2 border border-gray-200 rounded-lg text-sm"><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="yearly">Yearly</option></select>
                <select value={companyForm.paymentMode} onChange={(e) => setCompanyForm((p) => ({ ...p, paymentMode: e.target.value as any }))} className="px-3 py-2 border border-gray-200 rounded-lg text-sm"><option value="bank_transfer">Bank Transfer</option><option value="upi">UPI</option><option value="cash">Cash</option><option value="cheque">Cheque</option></select>
                <select value={companyForm.paymentStatus} onChange={(e) => setCompanyForm((p) => ({ ...p, paymentStatus: e.target.value as any }))} className="px-3 py-2 border border-gray-200 rounded-lg text-sm"><option value="paid">Paid</option><option value="pending">Pending</option><option value="overdue">Overdue</option></select>
                <input type="number" min={0} value={companyForm.trialDays} onChange={(e) => setCompanyForm((p) => ({ ...p, trialDays: e.target.value }))} className="px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="Trial days (0 for none)" />
                <input type="date" value={companyForm.subscriptionStartDate} onChange={(e) => setCompanyForm((p) => ({ ...p, subscriptionStartDate: e.target.value }))} className="px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                <input type="date" value={companyForm.subscriptionExpiryDate} onChange={(e) => setCompanyForm((p) => ({ ...p, subscriptionExpiryDate: e.target.value }))} className="px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                <input value={companyForm.notes} onChange={(e) => setCompanyForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Internal Notes" className="px-3 py-2 border border-gray-200 rounded-lg text-sm md:col-span-2" />
                <button type="submit" className="md:col-span-2 px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold">Save Company</button>
              </form>
            )}

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500">
                    <th className="px-3 py-2"><button type="button" onClick={() => setCompanyTableSort((p) => ({ key: 'id', dir: p.key === 'id' && p.dir === 'asc' ? 'desc' : 'asc' }))}>Company ID</button></th><th className="px-3 py-2"><button type="button" onClick={() => setCompanyTableSort((p) => ({ key: 'name', dir: p.key === 'name' && p.dir === 'asc' ? 'desc' : 'asc' }))}>Company Name</button></th><th className="px-3 py-2"><button type="button" onClick={() => setCompanyTableSort((p) => ({ key: 'contact', dir: p.key === 'contact' && p.dir === 'asc' ? 'desc' : 'asc' }))}>Contact</button></th><th className="px-3 py-2"><button type="button" onClick={() => setCompanyTableSort((p) => ({ key: 'mobile', dir: p.key === 'mobile' && p.dir === 'asc' ? 'desc' : 'asc' }))}>Mobile</button></th><th className="px-3 py-2"><button type="button" onClick={() => setCompanyTableSort((p) => ({ key: 'email', dir: p.key === 'email' && p.dir === 'asc' ? 'desc' : 'asc' }))}>Email</button></th><th className="px-3 py-2"><button type="button" onClick={() => setCompanyTableSort((p) => ({ key: 'billing', dir: p.key === 'billing' && p.dir === 'asc' ? 'desc' : 'asc' }))}>Billing</button></th><th className="px-3 py-2"><button type="button" onClick={() => setCompanyTableSort((p) => ({ key: 'expiry', dir: p.key === 'expiry' && p.dir === 'asc' ? 'desc' : 'asc' }))}>Expiry</button></th><th className="px-3 py-2"><button type="button" onClick={() => setCompanyTableSort((p) => ({ key: 'status', dir: p.key === 'status' && p.dir === 'asc' ? 'desc' : 'asc' }))}>Status</button></th><th className="px-3 py-2"><button type="button" onClick={() => setCompanyTableSort((p) => ({ key: 'created', dir: p.key === 'created' && p.dir === 'asc' ? 'desc' : 'asc' }))}>Created</button></th><th className="px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedCompanies.map((client) => (
                    <tr key={client.id} className="border-t border-gray-100">
                      <td className="px-3 py-2 font-mono text-xs">{client.id}</td>
                      <td className="px-3 py-2 font-semibold">{client.name}</td>
                      <td className="px-3 py-2">{client.contactPerson || '-'}</td>
                      <td className="px-3 py-2">{client.mobileNumber || '-'}</td>
                      <td className="px-3 py-2">{client.email || '-'}</td>
                      <td className="px-3 py-2 capitalize">{client.billingCycle || '-'}</td>
                      <td className="px-3 py-2">{asDateInput(client.subscriptionExpiryDate) || '-'}</td>
                      <td className="px-3 py-2"><span className={`px-2 py-1 rounded-full text-xs font-bold ${statusClass[client.state || 'active'] || statusClass.active}`}>{client.state || 'active'}</span></td>
                      <td className="px-3 py-2">{asDateInput(client.createdAt) || '-'}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          <button onClick={() => setSelectedCompanyId(client.id)} className="px-2 py-1 rounded bg-slate-100 text-slate-700 text-xs font-semibold">View</button>
                          <button onClick={() => confirmAndUpdateStatus(client, 'active')} className="px-2 py-1 rounded bg-emerald-100 text-emerald-700 text-xs font-semibold">Activate</button>
                          <button onClick={() => confirmAndUpdateStatus(client, 'suspended')} className="px-2 py-1 rounded bg-amber-100 text-amber-700 text-xs font-semibold">Suspend</button>
                          <button onClick={() => onStartImpersonation({ clientId: client.id, clientName: client.name })} className="px-2 py-1 rounded bg-blue-100 text-blue-700 text-xs font-semibold">Login As Admin</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {selectedCompany && (
              <div className="border border-gray-100 rounded-xl p-3 grid grid-cols-1 lg:grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-gray-500">Overview</p>
                  <p className="font-bold text-gray-900">{selectedCompany.name}</p>
                  <p className="text-sm text-gray-600">{selectedCompany.address || '-'}</p>
                  <p className="text-sm text-gray-600">Owner: {selectedCompany.contactPerson || '-'}</p>
                  <p className="text-sm text-gray-600">Email: {selectedCompany.email || '-'}</p>
                  <p className="text-sm text-gray-600">Phone: {selectedCompany.mobileNumber || '-'}</p>
                  <p className="text-sm text-gray-600 mt-2">Notes: {selectedCompany.notes || '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Subscription</p>
                  <p className="text-sm text-gray-700 capitalize">Billing: {selectedCompany.billingCycle || '-'}</p>
                  <p className="text-sm text-gray-700">Start: {asDateInput(selectedCompany.subscriptionStartDate) || '-'}</p>
                  <p className="text-sm text-gray-700">Expiry: {asDateInput(selectedCompany.subscriptionExpiryDate) || '-'}</p>
                  <p className="text-sm text-gray-700 capitalize">Payment: {selectedCompany.paymentStatus || '-'}</p>
                  <p className="text-sm text-gray-700 capitalize">Mode: {(selectedCompany.paymentMode || '-').replace('_', ' ')}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {module === 'users' && (
          <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
              <input value={userSearch} onChange={(e) => setUserSearch(e.target.value)} placeholder="Search user" className="px-3 py-2 border border-gray-200 rounded-xl text-sm md:col-span-2" />
              <select value={userCompanyFilter} onChange={(e) => setUserCompanyFilter(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-xl text-sm">
                <option value="all">All Companies</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select value={userRoleFilter} onChange={(e) => setUserRoleFilter(e.target.value as any)} className="px-3 py-2 border border-gray-200 rounded-xl text-sm">
                <option value="all">All Roles</option><option value="super_admin">Super Admin</option><option value="admin">Admin</option><option value="client_admin">Company Admin</option><option value="manager">Manager</option><option value="employee">Employee</option><option value="suspended">Suspended</option><option value="deleted">Deleted</option>
              </select>
            </div>
            <div className="space-y-2">
              {users.map((member: any) => (
                <div key={member.uid} className="border border-gray-100 rounded-xl p-3 flex flex-col gap-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold text-sm text-gray-900">{member.name} <span className="text-xs text-gray-500">({member.role})</span></p>
                      <p className="text-xs text-gray-500">{member.email} · {member.phone || '-'} · {member.companyName}</p>
                      <p className="text-xs text-gray-400">Last Login: {asDateTime(member.lastLoginAt)}</p>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <button onClick={() => resetPassword(member)} className="px-2 py-1 rounded bg-blue-100 text-blue-700 text-xs font-semibold">Reset Password</button>
                      <button onClick={() => forceLogout(member.uid)} className="px-2 py-1 rounded bg-amber-100 text-amber-700 text-xs font-semibold">Force Logout</button>
                      <button onClick={() => toggleBlockUser(member)} className="px-2 py-1 rounded bg-rose-100 text-rose-700 text-xs font-semibold">{member.role === 'suspended' ? 'Unblock' : 'Block User'}</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {module === 'support' && (
          <div className="bg-white border border-gray-200 rounded-2xl p-4">
            <h3 className="text-sm font-black text-gray-800 uppercase tracking-wider mb-3">Support Tickets</h3>
            <div className="space-y-2">
              {tickets.length === 0 && <p className="text-sm text-gray-500">No tickets found in `supportTickets` collection.</p>}
              {tickets.map((ticket) => (
                <div key={ticket.id} className="border border-gray-100 rounded-xl p-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-sm text-gray-900">{ticket.subject || `Ticket ${ticket.id}`}</p>
                    <p className="text-xs text-gray-500">{ticket.companyName || ticket.companyId || 'N/A'} · {(ticket.priority || 'medium').toUpperCase()} · {(ticket.status || 'open').replace('_', ' ')}</p>
                  </div>
                  <div className="flex gap-2">
                    <button className="px-2 py-1 rounded bg-slate-100 text-slate-700 text-xs font-semibold">Open</button>
                    <button className="px-2 py-1 rounded bg-blue-100 text-blue-700 text-xs font-semibold">Reply</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {module === 'settings' && (
          <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
            <h3 className="text-sm font-black text-gray-800 uppercase tracking-wider">Global Settings</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <input value={globalSettings.supportEmail} onChange={(e) => setGlobalSettings((p) => ({ ...p, supportEmail: e.target.value }))} className="px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="Support Email" />
              <input value={globalSettings.loginRateLimitPerMin} onChange={(e) => setGlobalSettings((p) => ({ ...p, loginRateLimitPerMin: e.target.value }))} className="px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="Login requests/min (10)" title="Max login attempts allowed per minute per IP/user." />
              <input value={globalSettings.apiRateLimitPerMin} onChange={(e) => setGlobalSettings((p) => ({ ...p, apiRateLimitPerMin: e.target.value }))} className="px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="API requests/min (120)" title="Max API requests allowed per minute per IP/user." />
            </div>
            <p className="text-xs text-gray-500">
              `10` = login rate-limit per minute. `120` = API request rate-limit per minute.
            </p>
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  await updateDoc(doc(db, 'platformConfig', 'global'), { ...globalSettings, updatedAt: serverTimestamp(), updatedBy: user.uid });
                  await logAudit('global_settings_updated', { targetType: 'platform_config', targetId: 'global' });
                  alert('Settings saved.');
                }}
                className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold"
              >
                Save Settings
              </button>
              <button onClick={async () => { await createBackup(); alert('Backup snapshot created in memory. You can download it now.'); }} className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-sm font-semibold">Create Backup</button>
              <button onClick={downloadBackup} className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-sm font-semibold">Download Backup</button>
              <button
                onClick={() => backupRestoreInputRef.current?.click()}
                className="px-4 py-2 rounded-xl bg-amber-100 text-amber-700 text-sm font-semibold flex items-center gap-2"
              >
                <AlertCircle size={14} /> Restore Backup
              </button>
              <input
                ref={backupRestoreInputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    await restoreBackupFromFile(file);
                    alert('Backup restored successfully.');
                  } catch (error: any) {
                    alert(error?.message || 'Failed to restore backup.');
                  } finally {
                    e.target.value = '';
                  }
                }}
              />
            </div>
            <div className="border border-gray-100 rounded-xl p-3">
              <p className="text-xs text-gray-500 mb-2 flex items-center gap-2"><ShieldCheck size={14} /> Recent Activity Logs</p>
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {auditLogs.slice(0, 20).map((log) => (
                  <p key={log.id} className="text-xs text-gray-700">
                    <span className="font-semibold">{log.action}</span> · {log.actorName} · {String(log.targetType || 'system')}
                  </p>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

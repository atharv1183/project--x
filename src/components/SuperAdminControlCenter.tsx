import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  addDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp,
  onSnapshot,
  orderBy,
  updateDoc,
  doc,
  setDoc,
  deleteDoc,
  writeBatch,
} from 'firebase/firestore';
import { Attendance, Lead, User } from '../types';
import { db } from '../lib/firebase';
import { addAuditLog } from '../lib/audit';
import { createAuthUserRest, deleteAuthUserRest, signInAuthUserRest } from '../lib/provisionTeamMember';
import { AddClientForm } from './super-admin/components/AddClientForm';
import { CredentialsBanner } from './super-admin/components/CredentialsBanner';
import { EditClientPanel } from './super-admin/components/EditClientPanel';
import { Sidebar } from './super-admin/components/Sidebar';
import { StatusTable } from './super-admin/components/StatusTable';
import {
  AddClientFormState,
  EditClientFormState,
  NewClientCredentials,
  PaymentFormState,
  PaymentTransaction,
  PlatformClient,
  StatusSort,
  SuperAdminModule,
  SupportTicket,
  DemoRequest,
  TicketFormState,
} from './super-admin/types';

type Props = {
  user: User;
  onStartImpersonation: (payload: { clientId: string; clientName: string }) => Promise<void>;
};

const INITIAL_EDIT_FORM: EditClientFormState = {
  name: '',
  contactPerson: '',
  mobileNumber: '',
  email: '',
  address: '',
  gstn: '',
  state: 'trial',
  trialDays: '14',
  subscriptionExpiryDate: '',
};

const INITIAL_ADD_FORM: AddClientFormState = {
  companyLogoUrl: '',
  companyLogoFile: null,
  companyName: '',
  personName: '',
  contactNumber: '',
  email: '',
  address: '',
  gstn: '',
};

const INITIAL_PAYMENT_FORM: PaymentFormState = {
  clientId: '',
  extendedMonths: '1',
  amount: '',
};

const INITIAL_TICKET_FORM: TicketFormState = {
  clientId: '',
  issueRaisedBy: '',
  raisedPersonName: '',
  raisedPersonContact: '',
  title: '',
  message: '',
  attachments: [],
};

const BACKUP_COLLECTIONS = [
  'platformClients',
  'users',
  'leads',
  'attendance',
  'requirements',
  'inventory',
  'brokers',
  'leadTransfers',
  'paymentTransactions',
  'demoRequests',
  'supportTickets',
  'auditLogs',
  'clientBranding',
  'notifications',
] as const;

const toInputDate = (date: Date) => date.toISOString().slice(0, 10);

const addMonths = (date: Date, months: number) => {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
};

const dateFromMaybe = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const toDateValue = (value: any): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value.toDate === 'function') {
    const date = value.toDate();
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const timestampMillis = (value: any) => {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  return new Date(value).getTime() || 0;
};

const formatDateTime = (value: any) => {
  const ms = timestampMillis(value);
  return ms ? new Date(ms).toLocaleString() : '-';
};

const formatMoney = (value?: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value || 0);

const formatDuration = (hours: number) => {
  if (!Number.isFinite(hours) || hours <= 0) return '0h';
  if (hours < 24) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
};

const daysUntil = (date?: string | null) => {
  const parsed = dateFromMaybe(date);
  if (!parsed) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  parsed.setHours(0, 0, 0, 0);
  return Math.ceil((parsed.getTime() - today.getTime()) / 86400000);
};

const getLeadQueueTab = (lead: Lead): 'overdue' | 'today' | 'upcoming' | null => {
  if (lead.status === 'deal_approved' || lead.status === 'not_interested') return null;
  const followupAt = toDateValue((lead as any).nextFollowupAt);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setHours(23, 59, 59, 999);
  if (!followupAt || followupAt < todayStart) return 'overdue';
  if (followupAt <= todayEnd) return 'today';
  return 'upcoming';
};

const sanitizeForBackup = (value: unknown): unknown => {
  if (!value) return value;
  if (value instanceof Date) return { __type: 'date', iso: value.toISOString() };
  if (typeof (value as any)?.toDate === 'function') {
    return { __type: 'timestamp', iso: (value as any).toDate().toISOString() };
  }
  if (Array.isArray(value)) return value.map(sanitizeForBackup);
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, sanitizeForBackup(item)]));
  }
  return value;
};

const restoreFromBackup = (value: unknown): unknown => {
  if (!value) return value;
  if (Array.isArray(value)) return value.map(restoreFromBackup);
  if (typeof value === 'object') {
    const data = value as Record<string, unknown>;
    if ((data.__type === 'date' || data.__type === 'timestamp') && typeof data.iso === 'string') {
      return new Date(data.iso);
    }
    return Object.fromEntries(Object.entries(data).map(([key, item]) => [key, restoreFromBackup(item)]));
  }
  return value;
};

const downloadJson = (filename: string, payload: unknown) => {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const uploadToCloudinary = async (file: File, folder: string) => {
  const cloudName = String(import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || '').trim();
  const uploadPreset = String(import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || '').trim();
  if (!cloudName || !uploadPreset) {
    throw new Error('Cloudinary is not configured. Add VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET.');
  }

  const body = new FormData();
  body.append('file', file);
  body.append('upload_preset', uploadPreset);
  body.append('folder', folder);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`, {
    method: 'POST',
    body,
  });
  const result = await response.json().catch(() => null) as { secure_url?: string; error?: { message?: string } } | null;
  if (!response.ok || !result?.secure_url) {
    throw new Error(result?.error?.message || `Cloudinary upload failed with status ${response.status}.`);
  }

  return result.secure_url;
};

export default function SuperAdminControlCenter({ user }: Props) {
  const [module, setModule] = useState<SuperAdminModule>('dashboard');
  const [clients, setClients] = useState<PlatformClient[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [demoRequests, setDemoRequests] = useState<DemoRequest[]>([]);
  const [paymentTransactions, setPaymentTransactions] = useState<PaymentTransaction[]>([]);
  const [statusSearch, setStatusSearch] = useState('');
  const [statusSort, setStatusSort] = useState<StatusSort>({ key: 'name', dir: 'asc' });
  const [paymentSearch, setPaymentSearch] = useState('');
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const [editingClientForm, setEditingClientForm] = useState<EditClientFormState>(INITIAL_EDIT_FORM);
  const [selectedPaymentClientId, setSelectedPaymentClientId] = useState<string>('');
  const [paymentForm, setPaymentForm] = useState<PaymentFormState>(INITIAL_PAYMENT_FORM);
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [newClientCredentials, setNewClientCredentials] = useState<NewClientCredentials | null>(null);
  const [showTicketForm, setShowTicketForm] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [selectedDemoRequest, setSelectedDemoRequest] = useState<DemoRequest | null>(null);
  const [ticketForm, setTicketForm] = useState<TicketFormState>(INITIAL_TICKET_FORM);
  const [savingClient, setSavingClient] = useState(false);
  const [savingPayment, setSavingPayment] = useState(false);
  const [savingTicket, setSavingTicket] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [addClientForm, setAddClientForm] = useState<AddClientFormState>(INITIAL_ADD_FORM);

  useEffect(() => {
    const unsubClients = onSnapshot(query(collection(db, 'platformClients'), orderBy('name', 'asc')), (snapshot) => {
      setClients(snapshot.docs.map((snapshotDoc) => ({ id: snapshotDoc.id, ...snapshotDoc.data() } as PlatformClient)));
    });
    const unsubUsers = onSnapshot(query(collection(db, 'users')), (snapshot) => {
      setUsers(snapshot.docs.map((snapshotDoc) => ({ uid: snapshotDoc.id, ...snapshotDoc.data() } as User)));
    });
    const unsubTransactions = onSnapshot(query(collection(db, 'paymentTransactions'), orderBy('createdAt', 'desc')), (snapshot) => {
      setPaymentTransactions(snapshot.docs.map((snapshotDoc) => ({ id: snapshotDoc.id, ...snapshotDoc.data() } as PaymentTransaction)));
    });
    const unsubLeads = onSnapshot(query(collection(db, 'leads')), (snapshot) => {
      setLeads(
        snapshot.docs
          .map((snapshotDoc) => ({ id: snapshotDoc.id, ...snapshotDoc.data() } as Lead))
          .filter((lead) => !lead.deletedAt)
      );
    });
    const unsubAttendance = onSnapshot(query(collection(db, 'attendance')), (snapshot) => {
      setAttendance(snapshot.docs.map((snapshotDoc) => ({ id: snapshotDoc.id, ...snapshotDoc.data() } as Attendance)));
    });
    const unsubTickets = onSnapshot(query(collection(db, 'supportTickets'), orderBy('createdAt', 'desc')), (snapshot) => {
      setTickets(snapshot.docs.map((snapshotDoc) => ({ id: snapshotDoc.id, ...snapshotDoc.data() } as SupportTicket)));
    });
    const unsubDemoRequests = onSnapshot(query(collection(db, 'demoRequests'), orderBy('submittedAt', 'desc')), (snapshot) => {
      setDemoRequests(snapshot.docs.map((snapshotDoc) => ({ id: snapshotDoc.id, ...snapshotDoc.data() } as DemoRequest)));
    });
    return () => {
      unsubClients();
      unsubUsers();
      unsubTransactions();
      unsubLeads();
      unsubAttendance();
      unsubTickets();
      unsubDemoRequests();
    };
  }, []);

  useEffect(() => {
    setPaymentForm((prev) => ({ ...prev, clientId: selectedPaymentClientId }));
  }, [selectedPaymentClientId]);

  const statusRows = useMemo(() => {
    const q = statusSearch.trim().toLowerCase();
    const filtered = clients.filter((client) => {
      if (!q) return true;
      return [client.name, client.contactPerson, client.mobileNumber, client.email, client.state]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q);
    });

    const compare = (a: unknown, b: unknown) =>
      String(a ?? '').localeCompare(String(b ?? ''), undefined, { sensitivity: 'base' });

    const rows = [...filtered];
    rows.sort((a, b) => {
      const aUsers = users.filter((u) => (u as any).clientId === a.id && u.role !== 'suspended' && u.role !== 'deleted').length;
      const bUsers = users.filter((u) => (u as any).clientId === b.id && u.role !== 'suspended' && u.role !== 'deleted').length;
      const aDays = a.subscriptionExpiryDate
        ? Math.ceil((new Date(a.subscriptionExpiryDate).getTime() - Date.now()) / 86400000)
        : Number.MAX_SAFE_INTEGER;
      const bDays = b.subscriptionExpiryDate
        ? Math.ceil((new Date(b.subscriptionExpiryDate).getTime() - Date.now()) / 86400000)
        : Number.MAX_SAFE_INTEGER;

      const mapA: Record<string, unknown> = {
        name: a.name,
        person: a.contactPerson,
        contact: a.mobileNumber,
        users: aUsers,
        payment: a.billingCycle || '-',
        status: a.state || 'trial',
        expiry: a.subscriptionExpiryDate || '',
        days: aDays,
      };
      const mapB: Record<string, unknown> = {
        name: b.name,
        person: b.contactPerson,
        contact: b.mobileNumber,
        users: bUsers,
        payment: b.billingCycle || '-',
        status: b.state || 'trial',
        expiry: b.subscriptionExpiryDate || '',
        days: bDays,
      };

      const left = mapA[statusSort.key];
      const right = mapB[statusSort.key];
      const result = typeof left === 'number' && typeof right === 'number' ? left - right : compare(left, right);
      return statusSort.dir === 'asc' ? result : -result;
    });
    return rows;
  }, [clients, statusSearch, statusSort, users]);

  const selectedPaymentClient = useMemo(
    () => clients.find((client) => client.id === paymentForm.clientId) || null,
    [clients, paymentForm.clientId]
  );

  const clientStats = useMemo(() => {
    const stats = new Map<string, {
      activeUsers: number;
      totalLeads: number;
      siteVisits: number;
      deals: number;
      nextFollowup: Date | null;
      usageHours: number;
      usageDays: number;
    }>();

    clients.forEach((client) => {
      stats.set(client.id, {
        activeUsers: 0,
        totalLeads: 0,
        siteVisits: 0,
        deals: 0,
        nextFollowup: null,
        usageHours: 0,
        usageDays: 0,
      });
    });

    users.forEach((member) => {
      const clientId = String((member as any).clientId || '');
      const entry = stats.get(clientId);
      if (entry && member.role !== 'suspended' && member.role !== 'deleted') {
        entry.activeUsers += 1;
      }
    });

    leads.forEach((lead) => {
      const clientId = String((lead as any).clientId || '');
      const entry = stats.get(clientId);
      if (!entry) return;
      entry.totalLeads += 1;
      if (lead.siteVisitAt || lead.siteVisitPhoto || lead.status === 'deal_pending' || lead.status === 'deal_approved') entry.siteVisits += 1;
      if (lead.status === 'deal_approved') entry.deals += 1;
      const followup = toDateValue((lead as any).nextFollowupAt);
      if (followup && followup >= new Date() && (!entry.nextFollowup || followup < entry.nextFollowup)) {
        entry.nextFollowup = followup;
      }
    });

    const byUser = new Map<string, Array<{ at: Date; type: Attendance['type']; clientId: string }>>();
    attendance.forEach((record) => {
      const at = toDateValue(record.timestamp);
      const clientId = String((record as any).clientId || users.find((member) => member.uid === record.uid)?.clientId || '');
      if (!at || !clientId) return;
      byUser.set(record.uid, [...(byUser.get(record.uid) || []), { at, type: record.type, clientId }]);
    });
    byUser.forEach((items) => {
      const sorted = [...items].sort((a, b) => a.at.getTime() - b.at.getTime());
      const daysByClient = new Map<string, Set<string>>();
      let open: { at: Date; clientId: string } | null = null;
      sorted.forEach((item) => {
        if (!daysByClient.has(item.clientId)) daysByClient.set(item.clientId, new Set());
        daysByClient.get(item.clientId)?.add(item.at.toISOString().slice(0, 10));
        if (item.type === 'clock_in') {
          open = { at: item.at, clientId: item.clientId };
        } else if (open && open.clientId === item.clientId && item.at > open.at) {
          const entry = stats.get(item.clientId);
          if (entry) entry.usageHours += (item.at.getTime() - open.at.getTime()) / 3600000;
          open = null;
        }
      });
      daysByClient.forEach((days, clientId) => {
        const entry = stats.get(clientId);
        if (entry) entry.usageDays += days.size;
      });
    });

    return stats;
  }, [attendance, clients, leads, users]);

  const dashboardMetrics = useMemo(() => {
    const activeUsers = users.filter((member) => member.role !== 'suspended' && member.role !== 'deleted').length;
    const trialCompanies = clients.filter((client) => (client.state || 'trial') === 'trial').length;
    const activeCompanies = clients.filter((client) => (client.state || '') === 'active').length;
    const graceCompanies = clients.filter((client) => ['grace', 'grace_period'].includes(String(client.state || ''))).length;
    const expiredCompanies = clients.filter((client) => {
      const state = String(client.state || '');
      const left = daysUntil(client.subscriptionExpiryDate);
      return state === 'expired' || (left !== null && left < 0 && state !== 'active');
    }).length;
    const closedTickets = tickets.filter((ticket) => ticket.status === 'closed');
    const openTickets = tickets.filter((ticket) => ticket.status !== 'closed');
    const closeDurations = closedTickets
      .map((ticket) => {
        const start = toDateValue(ticket.createdAt);
        const end = toDateValue(ticket.closedAt || ticket.updatedAt);
        return start && end && end > start ? (end.getTime() - start.getTime()) / 3600000 : 0;
      })
      .filter((hours) => hours > 0);
    const avgCloseHours = closeDurations.length ? closeDurations.reduce((sum, hours) => sum + hours, 0) / closeDurations.length : 0;
    const avgSubscriptionMonths = paymentTransactions.length
      ? paymentTransactions.reduce((sum, item) => sum + Number(item.extendedMonths || 0), 0) / paymentTransactions.length
      : 0;
    const totalUsageHours = [...clientStats.values()].reduce((sum, item) => sum + item.usageHours, 0);
    const totalUsageDays = [...clientStats.values()].reduce((sum, item) => sum + item.usageDays, 0);

    return {
      totalCompanies: clients.length,
      activeUsers,
      trialCompanies,
      activeCompanies,
      graceCompanies,
      expiredCompanies,
      totalTickets: tickets.length,
      totalDemoRequests: demoRequests.length,
      closedTickets: closedTickets.length,
      openTickets: openTickets.length,
      avgCloseHours,
      avgSubscriptionMonths,
      avgUsersPerCompany: clients.length ? activeUsers / clients.length : 0,
      avgUsageHoursPerDay: totalUsageDays ? totalUsageHours / totalUsageDays : 0,
    };
  }, [clientStats, clients, demoRequests.length, paymentTransactions, tickets, users]);

  const upcomingRenewals = useMemo(() => {
    return clients
      .filter((client) => {
        const state = String(client.state || 'trial');
        const left = daysUntil(client.subscriptionExpiryDate);
        return left !== null && left <= 30 && left >= -7 && (state === 'trial' || state === 'grace' || state === 'grace_period' || state === 'active');
      })
      .sort((a, b) => (daysUntil(a.subscriptionExpiryDate) ?? 999) - (daysUntil(b.subscriptionExpiryDate) ?? 999));
  }, [clients]);

  const followupRows = useMemo(() => {
    return leads
      .map((lead) => {
        const tab = getLeadQueueTab(lead);
        const client = clients.find((item) => item.id === (lead as any).clientId);
        const assignee = users.find((member) => member.uid === lead.assignedTo);
        return { lead, tab, client, assignee };
      })
      .filter((row) => row.tab)
      .sort((a, b) => timestampMillis((a.lead as any).nextFollowupAt) - timestampMillis((b.lead as any).nextFollowupAt));
  }, [clients, leads, users]);

  const filteredPaymentTransactions = useMemo(() => {
    const q = paymentSearch.trim().toLowerCase();
    if (!q) return paymentTransactions;
    return paymentTransactions.filter((item) =>
      [
        item.companyName,
        item.personName,
        item.contactNo,
        item.newStatus,
        String(item.amount || ''),
        String(item.extendedMonths || ''),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [paymentSearch, paymentTransactions]);

  const setDemoRequestStatus = async (request: DemoRequest, status: 'new' | 'contacted' | 'closed') => {
    await updateDoc(doc(db, 'demoRequests', request.id), {
      status,
      updatedAt: serverTimestamp(),
      updatedBy: user.uid,
    });
    setSelectedDemoRequest((prev) => (prev && prev.id === request.id ? { ...prev, status } : prev));
  };

  const openEditClient = (client: PlatformClient) => {
    setEditingClientId(client.id);
    setEditingClientForm({
      name: client.name || '',
      contactPerson: client.contactPerson || '',
      mobileNumber: client.mobileNumber || '',
      email: client.email || '',
      address: client.address || '',
      gstn: client.gstn || '',
      state: client.state || 'trial',
      trialDays: String(client.trialDays || 14),
      subscriptionExpiryDate: client.subscriptionExpiryDate || '',
    });
  };

  const saveEditedClient = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingClientId) return;

    await updateDoc(doc(db, 'platformClients', editingClientId), {
      name: editingClientForm.name.trim(),
      contactPerson: editingClientForm.contactPerson.trim(),
      mobileNumber: editingClientForm.mobileNumber.trim(),
      email: editingClientForm.email.trim().toLowerCase(),
      address: editingClientForm.address.trim(),
      gstn: editingClientForm.gstn.trim(),
      state: editingClientForm.state,
      trialDays: Number(editingClientForm.trialDays || '14'),
      subscriptionExpiryDate: editingClientForm.subscriptionExpiryDate || null,
      updatedAt: serverTimestamp(),
    });

    setEditingClientId(null);
    setEditingClientForm(INITIAL_EDIT_FORM);
  };

  const handleDeleteCompany = async () => {
    if (!editingClientId) return;
    const target = clients.find((item) => item.id === editingClientId);
    if (!target) return;
    if (!window.confirm(`Delete company "${target.name}"? This will remove the company profile and permanently delete its user records.`)) {
      return;
    }

    try {
      const relatedUsers = users.filter((member) => (member as any).clientId === editingClientId);
      const batch = writeBatch(db);
      relatedUsers.forEach((member) => {
        // Delete user doc entirely so the phone/email won't be found by duplicate checks
        batch.delete(doc(db, 'users', member.uid));
        // Also clean up clientAdmins and employeeDirectory entries
        batch.delete(doc(db, 'clientAdmins', member.uid));
        batch.delete(doc(db, 'employeeDirectory', member.uid));
      });

      await batch.commit();
      await deleteDoc(doc(db, 'platformClients', editingClientId));
      setEditingClientId(null);
      setEditingClientForm(INITIAL_EDIT_FORM);
      alert('Company and all related user records deleted successfully.');
    } catch (error) {
      console.error('Failed to delete company', error);
      alert('Could not fully delete the company. Please try again or contact support.');
    }
  };

  const handleSaveClient = async (e: FormEvent) => {
    e.preventDefault();
    const companyName = addClientForm.companyName.trim();
    const personName = addClientForm.personName.trim();
    const contactNumber = addClientForm.contactNumber.replace(/\D/g, '');
    const email = addClientForm.email.trim().toLowerCase();
    const loginEmail = `${contactNumber}@estatepulse.com`;

    if (!companyName) return alert('Company Name is required.');
    if (!personName) return alert('Person Name is required.');
    if (contactNumber.length < 10 || contactNumber.length > 15) return alert('Contact number must be 10 to 15 digits.');
    if (!email) return alert('Email is required.');

    setSavingClient(true);
    let provisionedUid: string | null = null;
    let provisionedIdToken: string | null = null;
    let platformClientSaved = false;

    try {
      const existingCompanyByEmail = await getDocs(query(collection(db, 'platformClients'), where('email', '==', email)));
      if (!existingCompanyByEmail.empty) {
        alert('A client with this email already exists.');
        return;
      }

      const existingUserByEmail = await getDocs(query(collection(db, 'users'), where('email', '==', loginEmail)));
      if (!existingUserByEmail.empty) {
        alert('A user with this contact number already exists.');
        return;
      }

      const trialDays = 14;
      const trialStart = new Date();
      trialStart.setHours(0, 0, 0, 0);
      const trialEnd = new Date(trialStart);
      trialEnd.setDate(trialEnd.getDate() + trialDays);

      const tempPassword = `${contactNumber}${Math.floor(100 + Math.random() * 900)}`;

      // Use REST API to create auth user — avoids session switching that causes permission errors
      try {
        const { uid, idToken } = await createAuthUserRest(loginEmail, tempPassword);
        provisionedUid = uid;
        provisionedIdToken = idToken;
      } catch (authError: any) {
        // If the Auth account already exists (e.g. from a previous incomplete deletion),
        // sign in to reuse the existing UID
        if (authError?.code === 'auth/email-already-in-use') {
          try {
            const { uid, idToken } = await signInAuthUserRest(loginEmail, tempPassword);
            provisionedUid = uid;
            provisionedIdToken = idToken;
          } catch {
            // Sign-in failed (password changed?), inform the user
            throw new Error(
              'An auth account already exists for this phone number but could not be recovered. ' +
              'Please contact support or use a different phone number.'
            );
          }
        } else {
          throw authError;
        }
      }

      const logoUrl = addClientForm.companyLogoFile
        ? await uploadToCloudinary(addClientForm.companyLogoFile, 'company-logos')
        : addClientForm.companyLogoUrl.trim();

      console.log('DEBUG: Writing platformClients...');
      const clientRef = await addDoc(collection(db, 'platformClients'), {
        name: companyName,
        contactPerson: personName,
        mobileNumber: contactNumber,
        email,
        address: addClientForm.address.trim(),
        gstn: addClientForm.gstn.trim(),
        logoUrl,
        state: 'trial',
        trialDays,
        subscriptionStartDate: trialStart.toISOString().slice(0, 10),
        subscriptionExpiryDate: trialEnd.toISOString().slice(0, 10),
        paymentStatus: 'pending',
        adminUid: provisionedUid,
        adminEmail: loginEmail,
        tempPassword,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      platformClientSaved = true;
      console.log('DEBUG: platformClients write success:', clientRef.id);

      console.log('DEBUG: Writing users for UID:', provisionedUid);
      try {
        await setDoc(doc(db, 'users', provisionedUid), {
          uid: provisionedUid,
          name: `${companyName} Admin`,
          email: loginEmail,
          phone: contactNumber,
          role: 'client_admin',
          clientId: clientRef.id,
          clientName: companyName,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        console.log('DEBUG: users write success');
      } catch (err) {
        console.error('DEBUG: users write failed:', err);
        throw err;
      }

      console.log('DEBUG: Writing clientAdmins...');
      try {
        await setDoc(doc(db, 'clientAdmins', provisionedUid), { clientId: clientRef.id }, { merge: true });
        console.log('DEBUG: clientAdmins write success');
      } catch (err) {
        console.error('DEBUG: clientAdmins write failed:', err);
        throw err;
      }

      setModule('status');
      setAddClientForm(INITIAL_ADD_FORM);
      setNewClientCredentials({
        companyName,
        email: loginEmail,
        tempPassword,
      });
      alert('Client created successfully and started in Trial phase.');
    } catch (error) {
      // If Firestore writes failed but Auth user was created, clean it up ONLY if platformClients was not saved
      if (provisionedIdToken && !platformClientSaved) {
        await deleteAuthUserRest(provisionedIdToken).catch(() => {});
      }
      console.error('Failed to save client', error);
      alert(error instanceof Error ? error.message : 'Could not save client. Please try again.');
    } finally {
      setSavingClient(false);
    }
  };

  const handleStatusSort = (key: string) => {
    setStatusSort((prev) => ({ key, dir: prev.key === key && prev.dir === 'asc' ? 'desc' : 'asc' }));
  };

  const resetPaymentForm = () => {
    setEditingPaymentId(null);
    setPaymentForm({
      ...INITIAL_PAYMENT_FORM,
      clientId: selectedPaymentClientId,
    });
  };

  const savePayment = async (e: FormEvent) => {
    e.preventDefault();
    const client = selectedPaymentClient;
    if (!client) return alert('Please select a company.');

    const extendedMonths = Number(paymentForm.extendedMonths);
    const amount = Number(paymentForm.amount);
    if (!Number.isInteger(extendedMonths) || extendedMonths <= 0) return alert('Extend months must be a positive whole number.');
    if (!Number.isFinite(amount) || amount < 0) return alert('Amount must be a valid number.');

    const existingTransaction = editingPaymentId
      ? paymentTransactions.find((item) => item.id === editingPaymentId)
      : null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const previousExpiry = existingTransaction?.previousExpiryDate ?? client.subscriptionExpiryDate ?? null;
    const parsedExpiry = dateFromMaybe(previousExpiry);
    const baseDate = parsedExpiry && parsedExpiry > today ? parsedExpiry : today;
    const newExpiryDate = toInputDate(addMonths(baseDate, extendedMonths));
    const previousStatus = existingTransaction?.previousStatus || client.state || 'trial';
    const nextStatus = 'active';
    const txRef = editingPaymentId
      ? doc(db, 'paymentTransactions', editingPaymentId)
      : doc(collection(db, 'paymentTransactions'));

    setSavingPayment(true);
    let saveStage = 'prepare payment';
    try {
      const transactionPayload = {
        clientId: client.id,
        companyName: client.name || '',
        personName: client.contactPerson || '',
        contactNo: client.mobileNumber || '',
        previousStatus,
        newStatus: nextStatus,
        previousExpiryDate: previousExpiry,
        subscriptionExpiryDate: newExpiryDate,
        extendedMonths,
        amount,
        createdBy: user.uid,
        createdByName: user.name,
        ...(editingPaymentId ? { updatedAt: serverTimestamp() } : { createdAt: serverTimestamp() }),
      };

      const latestForClient = paymentTransactions
        .filter((item) => item.clientId === client.id)
        .sort((a, b) => timestampMillis(b.createdAt) - timestampMillis(a.createdAt))[0];
      const shouldUpdateClient = !editingPaymentId || latestForClient?.id === editingPaymentId;

      saveStage = 'save payment transaction';
      await setDoc(txRef, transactionPayload, { merge: true });
      if (shouldUpdateClient) {
        saveStage = 'update company subscription';
        await updateDoc(doc(db, 'platformClients', client.id), {
          state: nextStatus,
          paymentStatus: 'paid',
          billingCycle: `${extendedMonths} month${extendedMonths === 1 ? '' : 's'}`,
          lastPaymentAmount: amount,
          lastPaymentAt: serverTimestamp(),
          subscriptionExpiryDate: newExpiryDate,
          updatedAt: serverTimestamp(),
        });
      }
      await addAuditLog(db, {
        action: editingPaymentId ? 'payment_transaction_updated' : 'payment_recorded',
        actorId: user.uid,
        actorName: user.name,
        actorRole: user.role,
        targetType: 'platformClient',
        targetId: client.id,
        clientId: client.id,
        description: `${editingPaymentId ? 'Updated' : 'Recorded'} payment for ${client.name || 'company'}`,
        oldValue: editingPaymentId ? existingTransaction : { state: client.state, subscriptionExpiryDate: client.subscriptionExpiryDate },
        newValue: transactionPayload,
      });

      alert(
        editingPaymentId
          ? shouldUpdateClient
            ? 'Payment updated and company subscription refreshed.'
            : 'Older payment updated. Current company status was not changed.'
          : 'Payment saved and company subscription extended.'
      );
      resetPaymentForm();
    } catch (error) {
      console.error(`Failed to save payment at stage: ${saveStage}`, {
        error,
        user: {
          uid: user.uid,
          role: user.role,
          clientId: (user as any).clientId || null,
          email: user.email,
        },
        targetClient: {
          id: client.id,
          name: client.name || '',
        },
      });
      const code = typeof error === 'object' && error && 'code' in error ? String((error as any).code) : '';
      const message = error instanceof Error ? error.message : 'Unknown error';
      alert(`Could not save payment.\nStage: ${saveStage}${code ? `\n${code}` : ''}\n${message}`);
    } finally {
      setSavingPayment(false);
    }
  };

  const editPayment = (transaction: PaymentTransaction) => {
    setSelectedPaymentClientId(transaction.clientId);
    setPaymentForm({
      clientId: transaction.clientId,
      extendedMonths: String(transaction.extendedMonths || 1),
      amount: String(transaction.amount || 0),
    });
    setEditingPaymentId(transaction.id);
    setModule('payments');
  };

  const deletePayment = async (transaction: PaymentTransaction) => {
    if (!window.confirm(`Delete payment transaction for ${transaction.companyName}?`)) return;
    try {
      const client = clients.find((item) => item.id === transaction.clientId);
      const remaining = paymentTransactions
        .filter((item) => item.clientId === transaction.clientId && item.id !== transaction.id)
        .sort((a, b) => timestampMillis(b.createdAt) - timestampMillis(a.createdAt));
      const latest = remaining[0];
      const batch = writeBatch(db);
      batch.delete(doc(db, 'paymentTransactions', transaction.id));
      if (client) {
        batch.update(doc(db, 'platformClients', client.id), {
          state: latest?.newStatus || 'trial',
          paymentStatus: latest ? 'paid' : 'pending',
          billingCycle: latest ? `${latest.extendedMonths} month${latest.extendedMonths === 1 ? '' : 's'}` : null,
          lastPaymentAmount: latest?.amount ?? null,
          lastPaymentAt: latest?.createdAt ?? null,
          subscriptionExpiryDate: latest?.subscriptionExpiryDate || transaction.previousExpiryDate || client.subscriptionExpiryDate || null,
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
      await addAuditLog(db, {
        action: 'payment_transaction_deleted',
        actorId: user.uid,
        actorName: user.name,
        actorRole: user.role,
        targetType: 'paymentTransaction',
        targetId: transaction.id,
        clientId: transaction.clientId,
        description: `Deleted payment transaction for ${transaction.companyName}`,
        oldValue: transaction,
      });
      if (editingPaymentId === transaction.id) resetPaymentForm();
      alert('Payment transaction deleted.');
    } catch (error) {
      console.error('Failed to delete payment', error);
      alert('Could not delete payment. Please try again.');
    }
  };

  const handleTicketFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const readers = Array.from(files).map((file) => new Promise<TicketFormState['attachments'][number]>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve({
        name: file.name,
        dataUrl: String(reader.result || ''),
        type: file.type || 'application/octet-stream',
        size: file.size,
      });
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    }));
    try {
      const attachments = await Promise.all(readers);
      setTicketForm((prev) => ({ ...prev, attachments: [...prev.attachments, ...attachments] }));
    } catch {
      alert('Could not read one of the selected files.');
    }
  };

  const saveTicket = async (event: FormEvent) => {
    event.preventDefault();
    const client = clients.find((item) => item.id === ticketForm.clientId);
    if (!client) return alert('Please select a company.');
    if (!ticketForm.issueRaisedBy.trim()) return alert('Issue Raised By is required.');
    if (!ticketForm.title.trim()) return alert('Issue is required.');
    if (!ticketForm.message.trim()) return alert('Issue Description is required.');

    setSavingTicket(true);
    try {
      await addDoc(collection(db, 'supportTickets'), {
        clientId: client.id,
        companyName: client.name || '',
        contactPerson: client.contactPerson || '',
        issueRaisedBy: ticketForm.issueRaisedBy.trim(),
        raisedPersonName: ticketForm.raisedPersonName.trim(),
        raisedPersonContact: ticketForm.raisedPersonContact.trim(),
        title: ticketForm.title.trim(),
        message: ticketForm.message.trim(),
        attachments: ticketForm.attachments,
        status: 'open',
        userId: user.uid,
        userName: user.name,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setTicketForm(INITIAL_TICKET_FORM);
      setShowTicketForm(false);
      alert('Ticket raised successfully.');
    } catch (error) {
      console.error('Failed to raise ticket', error);
      alert('Could not raise ticket. Please try again.');
    } finally {
      setSavingTicket(false);
    }
  };

  const setTicketStatus = async (ticket: SupportTicket, status: 'open' | 'closed') => {
    await updateDoc(doc(db, 'supportTickets', ticket.id), {
      status,
      ...(status === 'closed' ? { closedAt: serverTimestamp() } : { closedAt: null }),
      updatedAt: serverTimestamp(),
    });
    setSelectedTicket((prev) => (prev?.id === ticket.id ? { ...prev, status } : prev));
  };

  const exportFullBackup = async () => {
    setBackupBusy(true);
    try {
      const collections: Record<string, Array<{ id: string; data: unknown }>> = {};
      for (const name of BACKUP_COLLECTIONS) {
        const snapshot = await getDocs(collection(db, name));
        collections[name] = snapshot.docs.map((item) => ({ id: item.id, data: sanitizeForBackup(item.data()) }));
      }
      downloadJson(`estatepulse-full-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`, {
        app: 'EstatePulse',
        exportedAt: new Date().toISOString(),
        collections,
      });
    } catch (error) {
      console.error('Failed to export backup', error);
      alert('Could not export full backup.');
    } finally {
      setBackupBusy(false);
    }
  };

  const importFullBackup = async (file: File | null) => {
    if (!file) return;
    if (!window.confirm('Restore will merge documents from this backup into Firestore. Existing documents with the same ID will be overwritten. Continue?')) {
      return;
    }
    setBackupBusy(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as { collections?: Record<string, Array<{ id: string; data: unknown }>> };
      if (!parsed.collections || typeof parsed.collections !== 'object') {
        alert('Invalid backup file.');
        return;
      }

      let restored = 0;
      for (const [collectionName, records] of Object.entries(parsed.collections)) {
        if (!BACKUP_COLLECTIONS.includes(collectionName as any) || !Array.isArray(records)) continue;
        for (let index = 0; index < records.length; index += 450) {
          const batch = writeBatch(db);
          records.slice(index, index + 450).forEach((record) => {
            if (!record?.id || !record.data) return;
            batch.set(doc(db, collectionName, record.id), restoreFromBackup(record.data) as Record<string, unknown>, { merge: true });
            restored += 1;
          });
          await batch.commit();
        }
      }
      await addAuditLog(db, {
        action: 'full_backup_restored',
        actorId: user.uid,
        actorName: user.name,
        actorRole: user.role,
        targetType: 'system',
        description: `Restored ${restored} documents from full backup`,
      });
      alert(`Restored ${restored} documents from backup.`);
    } catch (error) {
      console.error('Failed to restore backup', error);
      alert('Could not restore backup. Please check the file and try again.');
    } finally {
      setBackupBusy(false);
    }
  };

  const renderTransactionsTable = (rows: PaymentTransaction[]) => (
    <div className="mt-4 overflow-x-auto border border-gray-200 rounded-xl">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50">
          <tr className="text-left text-gray-500">
            <th className="px-3 py-2">Date</th>
            <th className="px-3 py-2">Co. Name</th>
            <th className="px-3 py-2">Person</th>
            <th className="px-3 py-2">Extended</th>
            <th className="px-3 py-2">Transaction</th>
            <th className="px-3 py-2">Period</th>
            <th className="px-3 py-2">Amount</th>
            <th className="px-3 py-2">Edit, delete</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((transaction) => (
            <tr key={transaction.id} className="border-t border-gray-100">
              <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(transaction.createdAt)}</td>
              <td className="px-3 py-2 font-semibold text-gray-900">{transaction.companyName || '-'}</td>
              <td className="px-3 py-2">{transaction.personName || '-'}</td>
              <td className="px-3 py-2">{transaction.extendedMonths} month{transaction.extendedMonths === 1 ? '' : 's'}</td>
              <td className="px-3 py-2 capitalize">{transaction.previousStatus} to {transaction.newStatus}</td>
              <td className="px-3 py-2 whitespace-nowrap">{transaction.subscriptionExpiryDate || '-'}</td>
              <td className="px-3 py-2 font-semibold">{formatMoney(transaction.amount)}</td>
              <td className="px-3 py-2">
                <div className="flex gap-2">
                  <button type="button" onClick={() => editPayment(transaction)} className="px-2 py-1 rounded bg-amber-100 text-amber-700 text-xs font-semibold">Edit</button>
                  <button type="button" onClick={() => deletePayment(transaction)} className="px-2 py-1 rounded bg-rose-100 text-rose-700 text-xs font-semibold">Delete</button>
                </div>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={8} className="px-3 py-8 text-center text-sm text-gray-500">No transactions found.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );

  const renderDashboard = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-black text-gray-900">Dashboard</h3>
        <p className="text-sm text-gray-500 mt-2">Platform health, company renewal pressure, support load, and usage summary.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        {[
          ['Total Companies', dashboardMetrics.totalCompanies],
          ['Total Active Users', dashboardMetrics.activeUsers],
          ['Trial Companies', dashboardMetrics.trialCompanies],
          ['Active Companies', dashboardMetrics.activeCompanies],
          ['Grace Period Companies', dashboardMetrics.graceCompanies],
          ['Expired Companies', dashboardMetrics.expiredCompanies],
          ['Tickets Raised', dashboardMetrics.totalTickets],
          ['Demo Requests', dashboardMetrics.totalDemoRequests],
          ['Tickets Closed', dashboardMetrics.closedTickets],
          ['Tickets Open', dashboardMetrics.openTickets],
          ['Avg Ticket Close Time', formatDuration(dashboardMetrics.avgCloseHours)],
          ['Avg Subscription Period / Co.', `${dashboardMetrics.avgSubscriptionMonths.toFixed(1)} mo`],
          ['Average Users / Co.', dashboardMetrics.avgUsersPerCompany.toFixed(1)],
          ['Avg Usage Hrs / Day', dashboardMetrics.avgUsageHoursPerDay.toFixed(1)],
        ].map(([label, value]) => (
          <div key={label as string} className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{label as string}</p>
            <p className="mt-2 text-2xl font-black text-gray-900">{value as string | number}</p>
          </div>
        ))}
      </div>

      <section className="rounded-2xl border border-gray-200 overflow-hidden">
        <div className="border-b border-gray-100 bg-gray-50 px-4 py-3">
          <h4 className="text-sm font-black uppercase tracking-widest text-gray-700">Upcoming Renewals (30 Days)</h4>
          <p className="text-xs text-gray-500 mt-1">Companies whose trial is ending or subscription is in grace/renewal window.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-white text-left text-xs uppercase tracking-wider text-gray-400">
              <tr>
                {['Co. Name', 'Contact Name', 'Number', 'Active Users', 'Total Leads', 'Site Visits', 'Deals', 'Next Followup Date'].map((header) => (
                  <th key={header} className="px-3 py-3">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {upcomingRenewals.map((client) => {
                const stats = clientStats.get(client.id);
                const total = stats?.totalLeads || 0;
                return (
                  <tr key={client.id} className="border-t border-gray-100">
                    <td className="px-3 py-3 font-black text-gray-900">{client.name || '-'}</td>
                    <td className="px-3 py-3">{client.contactPerson || '-'}</td>
                    <td className="px-3 py-3">{client.mobileNumber || '-'}</td>
                    <td className="px-3 py-3">{stats?.activeUsers || 0}</td>
                    <td className="px-3 py-3">{total}</td>
                    <td className="px-3 py-3">{stats?.siteVisits || 0} ({total ? (((stats?.siteVisits || 0) / total) * 100).toFixed(0) : 0}%)</td>
                    <td className="px-3 py-3">{stats?.deals || 0} ({total ? (((stats?.deals || 0) / total) * 100).toFixed(0) : 0}%)</td>
                    <td className="px-3 py-3 whitespace-nowrap">{stats?.nextFollowup ? stats.nextFollowup.toLocaleString() : '-'}</td>
                  </tr>
                );
              })}
              {upcomingRenewals.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-gray-500">No upcoming renewals in the next 30 days.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );

  const renderFollowups = () => {
    const tabs: Array<'overdue' | 'today' | 'upcoming'> = ['overdue', 'today', 'upcoming'];
    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-xl font-black text-gray-900">Followups</h3>
          <p className="text-sm text-gray-500 mt-2">Company-wide overdue, today, and upcoming follow-up queues.</p>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {tabs.map((tab) => {
            const rows = followupRows.filter((row) => row.tab === tab);
            return (
              <section key={tab} className="rounded-2xl border border-gray-200 overflow-hidden">
                <div className="bg-gray-50 px-4 py-3 border-b border-gray-100">
                  <h4 className="text-sm font-black uppercase tracking-widest text-gray-800">{tab}</h4>
                  <p className="text-xs text-gray-500">{rows.length} leads</p>
                </div>
                <div className="divide-y divide-gray-100">
                  {rows.slice(0, 25).map(({ lead, client, assignee }) => (
                    <div key={lead.id} className="p-4">
                      <p className="text-sm font-black text-gray-900">{lead.name}</p>
                      <p className="mt-1 text-xs font-medium text-gray-500">{client?.name || (lead as any).clientName || 'Unknown company'}</p>
                      <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-widest text-gray-500">
                        <span>{assignee?.name || 'Unassigned'}</span>
                        <span>{toDateValue((lead as any).nextFollowupAt)?.toLocaleString() || 'No date'}</span>
                      </div>
                    </div>
                  ))}
                  {rows.length === 0 && <p className="p-6 text-center text-sm text-gray-500">No {tab} followups.</p>}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    );
  };

  const renderTickets = () => (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
        <div>
          <h3 className="text-xl font-black text-gray-900">Tickets</h3>
          <p className="text-sm text-gray-500 mt-2">Raise support issues, track open/closed counts, and open ticket details.</p>
        </div>
        <button type="button" onClick={() => setShowTicketForm(true)} className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-black">
          Raise a Ticket
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {[
          ['Total', tickets.length],
          ['Closed', dashboardMetrics.closedTickets],
          ['Open', dashboardMetrics.openTickets],
        ].map(([label, value]) => (
          <div key={label as string} className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{label as string}</p>
            <p className="mt-2 text-3xl font-black text-gray-900">{value as number}</p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-gray-200">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-500">
            <tr>
              {['S.no', 'Co. Name', 'Date and Time Raised', 'Hours Since Opened', 'Status', 'Details'].map((header) => (
                <th key={header} className="px-3 py-3">{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tickets.map((ticket, index) => {
              const created = toDateValue(ticket.createdAt);
              const hours = created ? (Date.now() - created.getTime()) / 3600000 : 0;
              return (
                <tr key={ticket.id} className="border-t border-gray-100">
                  <td className="px-3 py-3">{index + 1}</td>
                  <td className="px-3 py-3 font-bold text-gray-900">{ticket.companyName || '-'}</td>
                  <td className="px-3 py-3 whitespace-nowrap">{created?.toLocaleString() || '-'}</td>
                  <td className="px-3 py-3">{ticket.status === 'closed' ? '-' : hours.toFixed(1)}</td>
                  <td className="px-3 py-3 capitalize">{ticket.status}</td>
                  <td className="px-3 py-3">
                    <button type="button" onClick={() => setSelectedTicket(ticket)} className="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 text-xs font-black">
                      Open Details
                    </button>
                  </td>
                </tr>
              );
            })}
            {tickets.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-gray-500">No tickets raised yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderDemoRequests = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-black text-gray-900">Demo Requests</h3>
        <p className="text-sm text-gray-500 mt-2">Review all submissions from the Book Demo page and open full contact details.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {[
          ['Total', demoRequests.length],
          ['New', demoRequests.filter((item) => (item.status || 'new') === 'new').length],
          ['Contacted', demoRequests.filter((item) => item.status === 'contacted').length],
        ].map(([label, value]) => (
          <div key={label as string} className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{label as string}</p>
            <p className="mt-2 text-3xl font-black text-gray-900">{value as number}</p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-gray-200">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-500">
            <tr>
              {['S.no', 'Name', 'Company', 'Phone', 'Email', 'Submitted', 'Status', 'Details'].map((header) => (
                <th key={header} className="px-3 py-3">{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {demoRequests.map((request, index) => (
              <tr key={request.id} className="border-t border-gray-100">
                <td className="px-3 py-3">{index + 1}</td>
                <td className="px-3 py-3 font-bold text-gray-900">{request.name || '-'}</td>
                <td className="px-3 py-3">{request.company || '-'}</td>
                <td className="px-3 py-3 whitespace-nowrap">{request.phone || '-'}</td>
                <td className="px-3 py-3">{request.email || '-'}</td>
                <td className="px-3 py-3 whitespace-nowrap">{formatDateTime(request.submittedAt)}</td>
                <td className="px-3 py-3 capitalize">{request.status || 'new'}</td>
                <td className="px-3 py-3">
                  <button type="button" onClick={() => setSelectedDemoRequest(request)} className="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 text-xs font-black">
                    Open Details
                  </button>
                </td>
              </tr>
            ))}
            {demoRequests.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-gray-500">No demo requests submitted yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderBackupRestore = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-black text-gray-900">Backup & Restore (Full Data)</h3>
        <p className="text-sm text-gray-500 mt-2">Export or restore the main platform collections as a JSON backup.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="rounded-2xl border border-gray-200 p-5">
          <h4 className="text-base font-black text-gray-900">Export Full Backup</h4>
          <p className="mt-2 text-sm text-gray-500">Includes companies, users, leads, attendance, requirements, inventory, payments, tickets, logs, branding, and notifications.</p>
          <button type="button" disabled={backupBusy} onClick={exportFullBackup} className="mt-4 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-black disabled:opacity-60">
            {backupBusy ? 'Working...' : 'Download Backup'}
          </button>
        </section>

        <section className="rounded-2xl border border-amber-200 bg-amber-50/50 p-5">
          <h4 className="text-base font-black text-amber-900">Restore Backup</h4>
          <p className="mt-2 text-sm text-amber-800">Restore merges documents by ID and overwrites matching fields. Use only with a trusted backup file.</p>
          <label className="mt-4 inline-flex cursor-pointer items-center rounded-xl bg-amber-600 px-4 py-2 text-sm font-black text-white">
            {backupBusy ? 'Working...' : 'Select Backup File'}
            <input
              type="file"
              accept="application/json,.json"
              disabled={backupBusy}
              onChange={(event) => {
                importFullBackup(event.target.files?.[0] || null);
                event.currentTarget.value = '';
              }}
              className="hidden"
            />
          </label>
        </section>
      </div>

      <section className="rounded-2xl border border-gray-200 overflow-hidden">
        <div className="bg-gray-50 px-4 py-3 text-sm font-black text-gray-700">Included Collections</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 p-4">
          {BACKUP_COLLECTIONS.map((name) => (
            <span key={name} className="rounded-xl bg-gray-50 px-3 py-2 text-sm font-bold text-gray-700">{name}</span>
          ))}
        </div>
      </section>
    </div>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-5">
      <Sidebar module={module} onSelect={setModule} />

      <section className="bg-white border border-gray-200 rounded-2xl p-6">
        {newClientCredentials && <CredentialsBanner credentials={newClientCredentials} onClose={() => setNewClientCredentials(null)} />}

        {module === 'dashboard' && (
          renderDashboard()
        )}

        {module === 'add_client' && (
          <AddClientForm
            form={addClientForm}
            saving={savingClient}
            onChange={(patch) => setAddClientForm((prev) => ({ ...prev, ...patch }))}
            onSubmit={handleSaveClient}
          />
        )}

        {module === 'status' && (
          <div>
            <h3 className="text-xl font-black text-gray-900">Status</h3>
            <p className="text-sm text-gray-500 mt-2">Search + click company name to edit. Use Add Payments to redirect.</p>
            <div className="mt-4">
              <input
                value={statusSearch}
                onChange={(e) => setStatusSearch(e.target.value)}
                placeholder="Search company / person / contact / status"
                className="w-full md:w-[420px] px-3 py-2 border border-gray-200 rounded-xl text-sm"
              />
            </div>

            <StatusTable
              rows={statusRows}
              users={users}
              statusSort={statusSort}
              onSort={handleStatusSort}
              onEdit={openEditClient}
              onAddPayments={(clientId) => {
                setSelectedPaymentClientId(clientId);
                setModule('payments');
              }}
            />

            {editingClientId && (
              <EditClientPanel
                form={editingClientForm}
                onChange={(patch) => setEditingClientForm((prev) => ({ ...prev, ...patch }))}
                onSave={saveEditedClient}
                onCancel={() => {
                  setEditingClientId(null);
                  setEditingClientForm(INITIAL_EDIT_FORM);
                }}
                onDelete={handleDeleteCompany}
              />
            )}
          </div>
        )}

        {module === 'payments' && (
          <div>
            <h3 className="text-xl font-black text-gray-900">Payments</h3>
            <p className="text-sm text-gray-500 mt-2">Record a company payment, extend the subscription, and update the Status table in one save.</p>

            <form onSubmit={savePayment} className="mt-5 border border-gray-200 rounded-xl overflow-hidden">
              <div className="grid grid-cols-1 md:grid-cols-[240px_minmax(0,1fr)] border-b border-gray-100">
                <label className="px-4 py-3 bg-gray-50 text-sm font-bold text-gray-600">Company Name</label>
                <select
                  required
                  value={paymentForm.clientId}
                  onChange={(e) => {
                    setSelectedPaymentClientId(e.target.value);
                    setPaymentForm((prev) => ({ ...prev, clientId: e.target.value }));
                    setEditingPaymentId(null);
                  }}
                  className="px-4 py-3 outline-none text-sm"
                >
                  <option value="">Select company</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>{client.name || client.id}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-[240px_minmax(0,1fr)] border-b border-gray-100">
                <div className="px-4 py-3 bg-gray-50 text-sm font-bold text-gray-600">Person Name</div>
                <div className="px-4 py-3 text-sm">{selectedPaymentClient?.contactPerson || '-'}</div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-[240px_minmax(0,1fr)] border-b border-gray-100">
                <div className="px-4 py-3 bg-gray-50 text-sm font-bold text-gray-600">Contact No.</div>
                <div className="px-4 py-3 text-sm">{selectedPaymentClient?.mobileNumber || '-'}</div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-[240px_minmax(0,1fr)] border-b border-gray-100">
                <div className="px-4 py-3 bg-gray-50 text-sm font-bold text-gray-600">Current Status</div>
                <div className="px-4 py-3 text-sm capitalize">
                  {selectedPaymentClient?.state || '-'}
                  {selectedPaymentClient?.subscriptionExpiryDate ? `, expires ${selectedPaymentClient.subscriptionExpiryDate}` : ''}
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-[240px_minmax(0,1fr)] border-b border-gray-100">
                <label className="px-4 py-3 bg-gray-50 text-sm font-bold text-gray-600">Extend (no. of Months)</label>
                <input
                  required
                  min="1"
                  step="1"
                  type="number"
                  value={paymentForm.extendedMonths}
                  onChange={(e) => setPaymentForm((prev) => ({ ...prev, extendedMonths: e.target.value }))}
                  className="px-4 py-3 outline-none text-sm"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-[240px_minmax(0,1fr)] border-b border-gray-100">
                <label className="px-4 py-3 bg-gray-50 text-sm font-bold text-gray-600">Amount</label>
                <input
                  required
                  min="0"
                  step="1"
                  type="number"
                  value={paymentForm.amount}
                  onChange={(e) => setPaymentForm((prev) => ({ ...prev, amount: e.target.value }))}
                  className="px-4 py-3 outline-none text-sm"
                  placeholder="Enter amount"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-[240px_minmax(0,1fr)]">
                <div className="hidden md:block" />
                <div className="px-4 py-3 flex flex-wrap gap-2">
                  <button disabled={savingPayment} className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-bold disabled:opacity-60">
                    {savingPayment ? 'Saving...' : editingPaymentId ? 'Update Payment' : 'Save'}
                  </button>
                  {editingPaymentId && (
                    <button type="button" onClick={resetPaymentForm} className="px-4 py-2 rounded-xl bg-gray-100 text-gray-700 text-sm font-bold">Cancel edit</button>
                  )}
                </div>
              </div>
            </form>

            <div className="mt-8">
              <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
                <div>
                  <h4 className="text-base font-black text-gray-900">Transactions</h4>
                  <p className="text-sm text-gray-500">Latest payment activity across existing companies.</p>
                </div>
                <input
                  value={paymentSearch}
                  onChange={(e) => setPaymentSearch(e.target.value)}
                  placeholder="Search transaction"
                  className="w-full md:w-[320px] px-3 py-2 border border-gray-200 rounded-xl text-sm"
                />
              </div>
              {renderTransactionsTable(filteredPaymentTransactions)}
            </div>
          </div>
        )}

        {module === 'transactions' && (
          <div>
            <h3 className="text-xl font-black text-gray-900">Transactions</h3>
            <p className="text-sm text-gray-500 mt-2">All recorded payment transactions.</p>
            <div className="mt-4">
              <input
                value={paymentSearch}
                onChange={(e) => setPaymentSearch(e.target.value)}
                placeholder="Search date / company / person / amount"
                className="w-full md:w-[420px] px-3 py-2 border border-gray-200 rounded-xl text-sm"
              />
            </div>
            {renderTransactionsTable(filteredPaymentTransactions)}
          </div>
        )}

        {module === 'followups' && (
          renderFollowups()
        )}

        {module === 'tickets' && (
          renderTickets()
        )}

        {module === 'demo_requests' && (
          renderDemoRequests()
        )}

        {module === 'backup_restore' && (
          renderBackupRestore()
        )}

        {showTicketForm && (
          <div className="fixed inset-0 z-[160] bg-black/50 p-4 flex items-center justify-center">
            <form onSubmit={saveTicket} className="w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-2xl bg-white shadow-2xl">
              <div className="border-b border-gray-100 p-5 flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-black text-gray-900">Raise a Ticket</h3>
                  <p className="text-sm text-gray-500">Create a support ticket for any company.</p>
                </div>
                <button type="button" onClick={() => setShowTicketForm(false)} className="rounded-full bg-gray-100 px-3 py-1 text-sm font-bold text-gray-600">Close</button>
              </div>
              <div className="p-5 grid grid-cols-1 md:grid-cols-[240px_minmax(0,1fr)] border-b border-gray-100">
                <label className="bg-gray-50 px-4 py-3 text-sm font-bold text-gray-600">Select Company</label>
                <select required value={ticketForm.clientId} onChange={(e) => setTicketForm((prev) => ({ ...prev, clientId: e.target.value }))} className="px-4 py-3 text-sm outline-none border border-gray-100 rounded-xl md:rounded-none">
                  <option value="">Select company</option>
                  {clients.map((client) => <option key={client.id} value={client.id}>{client.name || client.id}</option>)}
                </select>
              </div>
              {[
                ['Issue Raised By', 'issueRaisedBy', 'Who reported this issue?'],
                ['Raised Person Name', 'raisedPersonName', 'Person name'],
                ['Raised Person Contact', 'raisedPersonContact', 'Contact number'],
                ['Issue', 'title', 'Short issue title'],
              ].map(([label, key, placeholder]) => (
                <div key={key} className="px-5 grid grid-cols-1 md:grid-cols-[240px_minmax(0,1fr)] border-b border-gray-100">
                  <label className="bg-gray-50 px-4 py-3 text-sm font-bold text-gray-600">{label}</label>
                  <input
                    required={key === 'issueRaisedBy' || key === 'title'}
                    value={String((ticketForm as any)[key] || '')}
                    onChange={(e) => setTicketForm((prev) => ({ ...prev, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className="px-4 py-3 text-sm outline-none"
                  />
                </div>
              ))}
              <div className="px-5 grid grid-cols-1 md:grid-cols-[240px_minmax(0,1fr)] border-b border-gray-100">
                <label className="bg-gray-50 px-4 py-3 text-sm font-bold text-gray-600">Issue Description</label>
                <textarea required value={ticketForm.message} onChange={(e) => setTicketForm((prev) => ({ ...prev, message: e.target.value }))} className="min-h-28 px-4 py-3 text-sm outline-none" />
              </div>
              <div className="px-5 grid grid-cols-1 md:grid-cols-[240px_minmax(0,1fr)] border-b border-gray-100">
                <label className="bg-gray-50 px-4 py-3 text-sm font-bold text-gray-600">Attach</label>
                <div className="px-4 py-3">
                  <input type="file" multiple onChange={(e) => handleTicketFiles(e.target.files)} className="text-sm" />
                  {ticketForm.attachments.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {ticketForm.attachments.map((file, index) => (
                        <button
                          type="button"
                          key={`${file.name}-${index}`}
                          onClick={() => setTicketForm((prev) => ({ ...prev, attachments: prev.attachments.filter((_, itemIndex) => itemIndex !== index) }))}
                          className="rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-600"
                          title="Remove attachment"
                        >
                          {file.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="p-5 flex justify-end gap-2">
                <button type="button" onClick={() => setShowTicketForm(false)} className="px-4 py-2 rounded-xl bg-gray-100 text-gray-700 text-sm font-bold">Cancel</button>
                <button disabled={savingTicket} className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-bold disabled:opacity-60">{savingTicket ? 'Saving...' : 'Save'}</button>
              </div>
            </form>
          </div>
        )}

        {selectedTicket && (
          <div className="fixed inset-0 z-[160] bg-black/50 p-4 flex items-center justify-center">
            <div className="w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-2xl bg-white shadow-2xl">
              <div className="border-b border-gray-100 p-5 flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-black text-gray-900">Ticket Details</h3>
                  <p className="text-sm text-gray-500">{selectedTicket.title}</p>
                </div>
                <button type="button" onClick={() => setSelectedTicket(null)} className="rounded-full bg-gray-100 px-3 py-1 text-sm font-bold text-gray-600">Close</button>
              </div>
              <div className="p-5 divide-y divide-gray-100">
                {[
                  ['Co. Name', selectedTicket.companyName || '-'],
                  ['Contact Person Name', selectedTicket.contactPerson || '-'],
                  ['Issue Raised By', selectedTicket.issueRaisedBy || '-'],
                  ['Raised Person Name', selectedTicket.raisedPersonName || '-'],
                  ['Raised Person Contact', selectedTicket.raisedPersonContact || '-'],
                  ['Issue', selectedTicket.title || '-'],
                  ['Description', selectedTicket.message || '-'],
                  ['Status', selectedTicket.status || 'open'],
                ].map(([label, value]) => (
                  <div key={label} className="grid grid-cols-1 md:grid-cols-[240px_minmax(0,1fr)]">
                    <div className="bg-gray-50 px-4 py-3 text-sm font-bold text-gray-600">{label}</div>
                    <div className="px-4 py-3 text-sm whitespace-pre-wrap">{value}</div>
                  </div>
                ))}
                <div className="grid grid-cols-1 md:grid-cols-[240px_minmax(0,1fr)]">
                  <div className="bg-gray-50 px-4 py-3 text-sm font-bold text-gray-600">Attachment</div>
                  <div className="px-4 py-3 text-sm">
                    {(selectedTicket.attachments || []).length ? (
                      <div className="flex flex-wrap gap-2">
                        {(selectedTicket.attachments || []).map((file, index) => (
                          <a key={`${file.name}-${index}`} href={file.dataUrl} download={file.name} className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
                            {file.name}
                          </a>
                        ))}
                      </div>
                    ) : '-'}
                  </div>
                </div>
              </div>
              <div className="border-t border-gray-100 p-5 flex justify-end gap-2">
                {selectedTicket.status === 'closed' ? (
                  <button type="button" onClick={() => setTicketStatus(selectedTicket, 'open')} className="px-4 py-2 rounded-xl bg-amber-100 text-amber-700 text-sm font-black">Reopen</button>
                ) : (
                  <button type="button" onClick={() => setTicketStatus(selectedTicket, 'closed')} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-black">Mark Closed</button>
                )}
              </div>
            </div>
          </div>
        )}

        {selectedDemoRequest && (
          <div className="fixed inset-0 z-[160] bg-black/50 p-4 flex items-center justify-center">
            <div className="w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-2xl bg-white shadow-2xl">
              <div className="border-b border-gray-100 p-5 flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-black text-gray-900">Demo Request Details</h3>
                  <p className="text-sm text-gray-500">{selectedDemoRequest.name} submitted from {selectedDemoRequest.pagePath || '/book-demo'}</p>
                </div>
                <button type="button" onClick={() => setSelectedDemoRequest(null)} className="rounded-full bg-gray-100 px-3 py-1 text-sm font-bold text-gray-600">Close</button>
              </div>
              <div className="p-5 divide-y divide-gray-100">
                {[
                  ['Submitted At', formatDateTime(selectedDemoRequest.submittedAt)],
                  ['Full Name', selectedDemoRequest.name || '-'],
                  ['Email', selectedDemoRequest.email || '-'],
                  ['Phone', selectedDemoRequest.phone || '-'],
                  ['Company', selectedDemoRequest.company || '-'],
                  ['Role', selectedDemoRequest.role || '-'],
                  ['Message', selectedDemoRequest.message || '-'],
                  ['Status', selectedDemoRequest.status || 'new'],
                  ['Source', selectedDemoRequest.source || '-'],
                ].map(([label, value]) => (
                  <div key={label} className="grid grid-cols-1 md:grid-cols-[240px_minmax(0,1fr)]">
                    <div className="bg-gray-50 px-4 py-3 text-sm font-bold text-gray-600">{label}</div>
                    <div className="px-4 py-3 text-sm whitespace-pre-wrap">{value}</div>
                  </div>
                ))}
              </div>
              <div className="border-t border-gray-100 p-5 flex flex-wrap justify-end gap-2">
                <button type="button" onClick={() => setDemoRequestStatus(selectedDemoRequest, 'new')} className="px-4 py-2 rounded-xl bg-gray-100 text-gray-700 text-sm font-black">Mark New</button>
                <button type="button" onClick={() => setDemoRequestStatus(selectedDemoRequest, 'contacted')} className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-black">Mark Contacted</button>
                <button type="button" onClick={() => setDemoRequestStatus(selectedDemoRequest, 'closed')} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-black">Mark Closed</button>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

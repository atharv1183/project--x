import { useState, useEffect, useRef, FormEvent, useMemo } from 'react';
import { db, auth } from '../lib/firebase';
import { 
  collection, 
  query, 
  where, 
  getDocs,
  limit,
  onSnapshot, 
  doc, 
  updateDoc, 
  addDoc, 
  deleteDoc,
  serverTimestamp,
  orderBy,
  Timestamp,
  deleteField
} from 'firebase/firestore';
import { Lead, User, Followup, Attendance, AttendanceCorrectionRequest, Notification, OperationType, Location, Requirement, LeadTransfer, AuditLogEntry } from '../types';
import { handleFirestoreError } from '../lib/utils';
import { addAuditLog } from '../lib/audit';
import InventoryManagement from './InventoryManagement';
import SalesPerformanceDashboard from './SalesPerformanceDashboard';
import MonthlyAttendanceReport from './MonthlyAttendanceReport';
import ActivityLogsTable from './ActivityLogsTable';
import { 
  BarChart3,
  Calendar, 
  MessageSquare, 
  Phone, 
  User as UserIcon, 
  Camera, 
  MapPin, 
  TrendingUp, 
  CheckCircle2, 
  XSquare,
  XCircle,
  ClipboardList,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  Clock,
  History,
  Send,
  Search,
  Loader2,
  Users,
  ArrowLeftRight,
  Bell,
  Trash2,
  PlusCircle,
  Edit2,
  FileText,
  LayoutGrid,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, isToday, isPast, isFuture, startOfDay, endOfDay } from 'date-fns';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function toDateValue(value: unknown): Date | null {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === 'object' && value !== null) {
    const maybeTimestamp = value as { toDate?: () => Date; seconds?: number };

    if (typeof maybeTimestamp.toDate === 'function') {
      const parsed = maybeTimestamp.toDate();
      return parsed instanceof Date && !Number.isNaN(parsed.getTime()) ? parsed : null;
    }

    if (typeof maybeTimestamp.seconds === 'number') {
      const parsed = new Date(maybeTimestamp.seconds * 1000);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
}

function formatDateValue(value: unknown, pattern: string, fallback = '--'): string {
  const parsed = toDateValue(value);
  return parsed ? format(parsed, pattern) : fallback;
}

function toMillis(value: unknown): number {
  return toDateValue(value)?.getTime() ?? 0;
}

function normalizePhone(value: string): string {
  return value.replace(/\D/g, '');
}

function getWhatsAppUrl(phone?: string | null): string {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '#';
  return `https://wa.me/${digits.length === 10 ? `91${digits}` : digits}`;
}

const LOCATION_MAP: Record<string, string[]> = {
  "Madhya Pradesh": ["Bhopal", "Indore", "Jabalpur", "Gwalior", "Ujjain"],
  Maharashtra: ["Mumbai", "Pune", "Nagpur", "Nashik"],
  Gujarat: ["Ahmedabad", "Surat", "Vadodara", "Rajkot"],
  Rajasthan: ["Jaipur", "Jodhpur", "Udaipur", "Kota"],
  "Uttar Pradesh": ["Lucknow", "Kanpur", "Noida", "Varanasi"],
  Other: ["Other"],
};
const DEFAULT_SPECIALIZATIONS = ["Residential", "Commercial", "Industrial", "Agriculture"];

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeoutId: number | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
    }
  }
}

type LeadQueueTab = 'overdue' | 'today' | 'upcoming';
type EmployeeView = LeadQueueTab | 'followups' | 'performance' | 'leads' | 'attendance' | 'requirements' | 'inventory' | 'transfer_register' | 'activity_logs' | 'pending';

type EmployeeDashboardProps = {
  user: User;
  brand?: { logoUrl?: string; companyName?: string; tagline?: string };
  backSignal?: number;
  initialView?: EmployeeView;
  initialViewSignal?: number;
};

function getLeadQueueTab(lead: Lead): LeadQueueTab | null {
  if (lead.status === 'deal_approved' || lead.status === 'not_interested') return null;

  const nextDateObj = toDateValue(lead.nextFollowupAt);
  if (nextDateObj && isToday(nextDateObj)) return 'today';
  if (!nextDateObj || (isPast(nextDateObj) && !isToday(nextDateObj))) return 'overdue';
  if (nextDateObj && isFuture(nextDateObj) && !isToday(nextDateObj)) return 'upcoming';
  return null;
}

export default function EmployeeDashboard({
  user,
  brand,
  backSignal = 0,
  initialView,
  initialViewSignal = 0,
}: EmployeeDashboardProps) {
  const [brandLogoFailed, setBrandLogoFailed] = useState(false);
  const tenantClientId = String((user as any).clientId || '');
  const [activeTab, setActiveTab] = useState<EmployeeView>(initialView ?? 'today');
  const [transferTableSort, setTransferTableSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: 'when', dir: 'desc' });
  const [followupSubTab, setFollowupSubTab] = useState<LeadQueueTab>('today');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [leadTransfers, setLeadTransfers] = useState<LeadTransfer[]>([]);
  const [selectedLeadIndex, setSelectedLeadIndex] = useState<number | null>(null);
  const [followups, setFollowups] = useState<Followup[]>([]);
  const [selectedAssignedLead, setSelectedAssignedLead] = useState<Lead | null>(null);
  const [selectedAssignedLeadFollowups, setSelectedAssignedLeadFollowups] = useState<Followup[]>([]);
  const [assignedLeadEditName, setAssignedLeadEditName] = useState('');
  const [assignedLeadEditStatus, setAssignedLeadEditStatus] = useState<Lead['status']>('pending');
  const [loading, setLoading] = useState(false);

  // New Requirement Form State
  const [showAddLead, setShowAddLead] = useState(false);
  const [leadForm, setLeadForm] = useState({ name: '', phone: '', source: 'Employee Added' });
  const [showReqModal, setShowReqModal] = useState(false);
  const [editingRequirementId, setEditingRequirementId] = useState<string | null>(null);
  const [reqForm, setReqForm] = useState({
    name: '',
    phone: '',
    type: 'zeemen',
    area: '',
    budget: '',
    location: '',
    remark: '',
    brokerState: '',
    brokerCity: '',
    brokerLocality: '',
    specializations: [] as string[],
  });
  const [reqSearch, setReqSearch] = useState('');
  const [reqStateFilter, setReqStateFilter] = useState('');
  const [reqCityFilter, setReqCityFilter] = useState('');
  const [reqSpecializationFilter, setReqSpecializationFilter] = useState('');
  const [specializationOptions, setSpecializationOptions] = useState<string[]>(DEFAULT_SPECIALIZATIONS);
  const [newSpecialization, setNewSpecialization] = useState('');
  const [remark, setRemark] = useState('');
  const [nextDate, setNextDate] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<Lead['status'] | null>(null);
  const [kycFiles, setKycFiles] = useState<{ aadhaar: File | null; pan: File | null }>({ aadhaar: null, pan: null });
  const videoRef = useRef<HTMLVideoElement>(null);
  const [visitStep, setVisitStep] = useState<'idle' | 'capture' | 'confirm' | 'verifying' | 'verified'>('idle');
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [location, setLocation] = useState<{ latitude: number, longitude: number } | null>(null);
  const [cameraFacingMode, setCameraFacingMode] = useState<'environment' | 'user'>('environment');

  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [lastAttendance, setLastAttendance] = useState<Attendance | null>(null);
  const [attendanceRecords, setAttendanceRecords] = useState<Attendance[]>([]);
  const [attendanceCorrections, setAttendanceCorrections] = useState<AttendanceCorrectionRequest[]>([]);
  const [employees, setEmployees] = useState<User[]>([]);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferSearch, setTransferSearch] = useState('');
  const [transferRegisterSearch, setTransferRegisterSearch] = useState('');
  const [leadSearchQuery, setLeadSearchQuery] = useState('');
  const [notInterestedOnly, setNotInterestedOnly] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [notificationSettings, setNotificationSettings] = useState<{
    officeStart: string;
    officeEnd: string;
    reminderIntervalValue: number;
    reminderIntervalUnit: 'minutes' | 'hours';
  }>({
    officeStart: '09:00',
    officeEnd: '20:00',
    reminderIntervalValue: 1,
    reminderIntervalUnit: 'hours',
  });
  const processedBackSignalRef = useRef(0);
  const tabsScrollRef = useRef<HTMLDivElement | null>(null);
  const [canScrollTabsLeft, setCanScrollTabsLeft] = useState(false);
  const [canScrollTabsRight, setCanScrollTabsRight] = useState(false);
  const cloudinaryCloudName = String(import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || '').trim();
  const cloudinaryUploadPreset = String(import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || '').trim();
  const hasCloudinaryConfig = cloudinaryCloudName.length > 0 && cloudinaryUploadPreset.length > 0;

  useEffect(() => {
    if (!backSignal || backSignal === processedBackSignalRef.current) {
      return;
    }
    processedBackSignalRef.current = backSignal;

    if (showAddLead) {
      setShowAddLead(false);
      return;
    }

    if (showReqModal) {
      setShowReqModal(false);
      return;
    }

    if (showNotifications) {
      setShowNotifications(false);
      return;
    }

    if (showTransferModal) {
      setShowTransferModal(false);
      return;
    }

    if (showHistory) {
      setShowHistory(false);
      return;
    }

    if (selectedAssignedLead) {
      setSelectedAssignedLead(null);
      return;
    }

    if (selectedLeadIndex !== null) {
      setSelectedLeadIndex(null);
      return;
    }

    if (activeTab !== 'today') {
      setActiveTab('today');
    }
  }, [backSignal, showAddLead, showReqModal, showNotifications, showTransferModal, showHistory, selectedAssignedLead, selectedLeadIndex, activeTab]);

  useEffect(() => {
    if (!initialView) return;
    if (initialView === 'pending') {
      setActiveTab('followups');
      setFollowupSubTab('overdue');
    } else if (initialView === 'today' || initialView === 'upcoming' || initialView === 'overdue') {
      setActiveTab('followups');
      setFollowupSubTab(initialView as LeadQueueTab);
    } else {
      setActiveTab(initialView);
    }
    setSelectedLeadIndex(null);
  }, [initialView, initialViewSignal]);

  useEffect(() => {
    setBrandLogoFailed(false);
  }, [brand?.logoUrl]);

  useEffect(() => {
    const el = tabsScrollRef.current;
    if (!el) return;

    const updateScrollState = () => {
      setCanScrollTabsLeft(el.scrollLeft > 4);
      setCanScrollTabsRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
    };

    updateScrollState();
    el.addEventListener('scroll', updateScrollState, { passive: true });
    window.addEventListener('resize', updateScrollState);
    return () => {
      el.removeEventListener('scroll', updateScrollState);
      window.removeEventListener('resize', updateScrollState);
    };
  }, []);

  const scrollTabs = (direction: 'left' | 'right') => {
    const el = tabsScrollRef.current;
    if (!el) return;
    el.scrollBy({ left: direction === 'left' ? -170 : 170, behavior: 'smooth' });
  };

  useEffect(() => {
    if (!auth.currentUser) return;
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', auth.currentUser.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const sortedNotifications = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as Notification))
        .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt))
        .slice(0, 20);
      setNotifications(sortedNotifications);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'notifications'));

    return () => unsubscribe();
  }, []);

  const markNotificationAsRead = async (notificationId: string, leadId?: string) => {
    try {
      await updateDoc(doc(db, 'notifications', notificationId), { read: true });
      
      if (leadId) {
        const targetLead = leads.find(l => l.id === leadId);
        if (!targetLead) {
          alert('Lead not found in your current list. It might have been reassigned.');
          return;
        }

        const targetTab = getLeadQueueTab(targetLead);
        if (!targetTab) {
          alert('This lead is no longer in your active queue.');
          return;
        }

        const targetQueue = leads.filter((l) => l.assignedTo === user.uid && getLeadQueueTab(l) === targetTab);
        const leadIndex = targetQueue.findIndex(l => l.id === leadId);
        if (leadIndex === -1) {
          alert('Lead could not be opened right now. Please refresh and try again.');
          return;
        }

        setActiveTab('followups');
        setFollowupSubTab(targetTab);
        setLeadSearchQuery('');
        setSelectedLeadIndex(leadIndex);
        setShowNotifications(false);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `notifications/${notificationId}`);
    }
  };

  const deleteNotification = async (notificationId: string) => {
    try {
      await deleteDoc(doc(db, 'notifications', notificationId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `notifications/${notificationId}`);
    }
  };

  useEffect(() => {
    const tenantClientId = String((user as any).clientId || '');
    if (!tenantClientId) {
      setEmployees([]);
      return;
    }
    const q = query(collection(db, 'employeeDirectory'), where('role', '==', 'employee'), where('clientId', '==', tenantClientId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setEmployees(snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as User)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'employeeDirectory'));
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!auth.currentUser) return;
    const qAttendance = query(
      collection(db, 'attendance'),
      where('uid', '==', auth.currentUser.uid)
    );

    const unsubscribe = onSnapshot(qAttendance, (snapshot) => {
      if (snapshot.empty) {
        setLastAttendance(null);
        setAttendanceRecords([]);
        return;
      }

      const records = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as Attendance))
        .sort((a, b) => toMillis(b.timestamp) - toMillis(a.timestamp));
      const latestAttendance = records[0];

      setAttendanceRecords(records);
      setLastAttendance(latestAttendance ?? null);
    }, (error) => handleFirestoreError(error, OperationType.GET, 'attendance'));

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!auth.currentUser) return;
    const qCorrections = query(
      collection(db, 'attendanceCorrections'),
      where('uid', '==', auth.currentUser.uid)
    );

    const unsubscribe = onSnapshot(qCorrections, (snapshot) => {
      const records = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as AttendanceCorrectionRequest))
        .sort((a, b) => toMillis(b.requestedAt) - toMillis(a.requestedAt));
      setAttendanceCorrections(records);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'attendanceCorrections'));

    return () => unsubscribe();
  }, []);

  const handleAttendance = async (type: 'clock_in' | 'clock_out') => {
    if (!auth.currentUser) return;
    setAttendanceLoading(true);

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject);
      });

      const { latitude, longitude } = position.coords;

      await addDoc(collection(db, 'attendance'), {
        clientId: (user as any).clientId || null,
        uid: auth.currentUser.uid,
        employeeName: user.name,
        timestamp: serverTimestamp(),
        type,
        location: { latitude, longitude }
      });
      await addAuditLog(db, {
        action: 'attendance_marked',
        actorId: user.uid,
        actorName: user.name,
        actorRole: user.role,
        targetType: 'attendance',
        targetId: user.uid,
        description: `Attendance ${type} marked`,
        newValue: { type, latitude, longitude },
      });
    } catch (error) {
      alert('Error fetching location or saving record. Please ensure GPS is enabled.');
    } finally {
      setAttendanceLoading(false);
    }
  };

  const isClockedIn = lastAttendance?.type === 'clock_in';

  const stats = {
    total: leads.length,
    interested: leads.filter(l => l.status === 'interest' || l.status === 'interested').length,
    notInterested: leads.filter(l => l.status === 'not_interested').length,
    pending: leads.filter(l => l.status === 'pending').length,
    dealPending: leads.filter(l => l.status === 'deal_pending').length,
    dealsApproved: leads.filter(l => l.status === 'deal_approved').length
  };

  const employeeTabs: Array<{ id: EmployeeView | 'followups'; icon: any; label: string }> = [
    { id: 'performance', icon: BarChart3, label: 'Dashboard' },
    { id: 'leads', icon: Users, label: 'Leads' },
    { id: 'followups', icon: Clock, label: 'Followups' },
    { id: 'requirements', icon: FileText, label: 'Needs' },
    { id: 'inventory', icon: LayoutGrid, label: 'Inventory' },
    { id: 'attendance', icon: History, label: 'Attendance' },
    { id: 'transfer_register', icon: ArrowLeftRight, label: 'Transfers' },
    { id: 'activity_logs', icon: ClipboardList, label: 'Activity Logs' },
  ];

  useEffect(() => {
    if (!tenantClientId) {
      setLeads([]);
      return;
    }

    const qAssigned = query(collection(db, 'leads'), where('assignedTo', '==', user.uid), where('clientId', '==', tenantClientId));
    const qAddedBy = query(collection(db, 'leads'), where('addedById', '==', user.uid), where('clientId', '==', tenantClientId));

    const assignedLeads: Lead[] = [];
    const addedByLeads: Lead[] = [];

    const syncLeads = () => {
      const merged = [...assignedLeads, ...addedByLeads];
      const deduped = merged
        .filter((lead, index, arr) => index === arr.findIndex(item => item.id === lead.id))
        .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
      setLeads(deduped);
    };

    const unsubscribeAssigned = onSnapshot(qAssigned, (snapshot) => {
      assignedLeads.length = 0;
      snapshot.docs.forEach(item => assignedLeads.push({ id: item.id, ...item.data() } as Lead));
      syncLeads();
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'leads'));

    const unsubscribeAddedBy = onSnapshot(qAddedBy, (snapshot) => {
      addedByLeads.length = 0;
      snapshot.docs.forEach(item => addedByLeads.push({ id: item.id, ...item.data() } as Lead));
      syncLeads();
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'leads'));

    return () => {
      unsubscribeAssigned();
      unsubscribeAddedBy();
    };
  }, [user.uid, tenantClientId]);

  useEffect(() => {
    const ownerId = user.managerId || user.uid;
    const settingsRef = doc(db, 'notificationSettings', ownerId);
    const unsubscribe = onSnapshot(settingsRef, (snapshot) => {
      const data = snapshot.data() as Partial<typeof notificationSettings> | undefined;
      if (!data) return;
      setNotificationSettings((prev) => ({
        officeStart: data.officeStart || prev.officeStart,
        officeEnd: data.officeEnd || prev.officeEnd,
        reminderIntervalValue: typeof data.reminderIntervalValue === 'number' ? data.reminderIntervalValue : prev.reminderIntervalValue,
        reminderIntervalUnit: data.reminderIntervalUnit === 'minutes' ? 'minutes' : (data.reminderIntervalUnit === 'hours' ? 'hours' : prev.reminderIntervalUnit),
      }));
    });
    return () => unsubscribe();
  }, [user.managerId, user.uid]);

  useEffect(() => {
    const parseMinutes = (hhmm: string) => {
      const [h, m] = hhmm.split(':').map(Number);
      if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
      return h * 60 + m;
    };
    const isWithinOfficeHours = (now: Date) => {
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      const start = parseMinutes(notificationSettings.officeStart || '09:00');
      const end = parseMinutes(notificationSettings.officeEnd || '20:00');
      if (start <= end) return nowMinutes >= start && nowMinutes <= end;
      return nowMinutes >= start || nowMinutes <= end;
    };
    const intervalMs = Math.max(1, notificationSettings.reminderIntervalValue || 1) * (notificationSettings.reminderIntervalUnit === 'minutes' ? 60_000 : 3_600_000);

    const run = async () => {
      const now = new Date();
      if (!isWithinOfficeHours(now)) return;

      const dueLeads = leads.filter((lead) => lead.assignedTo === user.uid && lead.status !== 'deal_approved' && lead.status !== 'not_interested');
      for (const lead of dueLeads) {
        const queueTab = getLeadQueueTab(lead);
        if (queueTab !== 'overdue' && queueTab !== 'today') continue;
        const key = `estatepulse_notif_ping_${user.uid}_${lead.id}_${queueTab}`;
        const lastAt = Number(localStorage.getItem(key) || 0);
        if (Date.now() - lastAt < intervalMs) continue;

        try {
          await addDoc(collection(db, 'notifications'), {
            userId: user.uid,
            title: queueTab === 'overdue' ? 'Overdue Lead Reminder' : 'Today Lead Reminder',
            message: queueTab === 'overdue'
              ? `Lead "${lead.name}" is overdue for follow-up.`
              : `Lead "${lead.name}" needs follow-up today.`,
            leadId: lead.id,
            read: false,
            createdAt: serverTimestamp(),
          });
        } catch {
          // Employee roles may not have create access to notifications; keep UI flow uninterrupted.
        }
        localStorage.setItem(key, String(Date.now()));
      }
    };

    void run();
    const timerId = window.setInterval(() => { void run(); }, 60_000);
    return () => window.clearInterval(timerId);
  }, [leads, notificationSettings, user.uid]);

  useEffect(() => {
    if (!tenantClientId) {
      setLeadTransfers([]);
      return;
    }

    const qFrom = query(collection(db, 'leadTransfers'), where('fromUid', '==', user.uid), where('clientId', '==', tenantClientId));
    const qTo = query(collection(db, 'leadTransfers'), where('toUid', '==', user.uid), where('clientId', '==', tenantClientId));
    const fromTransfers: LeadTransfer[] = [];
    const toTransfers: LeadTransfer[] = [];

    const syncTransfers = () => {
      const merged = [...fromTransfers, ...toTransfers]
        .filter((item, index, arr) => index === arr.findIndex((candidate) => candidate.id === item.id))
        .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
      setLeadTransfers(merged);
    };

    const unsubFrom = onSnapshot(qFrom, (snapshot) => {
      fromTransfers.length = 0;
      snapshot.docs.forEach((item) => fromTransfers.push({ id: item.id, ...item.data() } as LeadTransfer));
      syncTransfers();
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'leadTransfers'));

    const unsubTo = onSnapshot(qTo, (snapshot) => {
      toTransfers.length = 0;
      snapshot.docs.forEach((item) => toTransfers.push({ id: item.id, ...item.data() } as LeadTransfer));
      syncTransfers();
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'leadTransfers'));

    return () => {
      unsubFrom();
      unsubTo();
    };
  }, [user.uid, tenantClientId]);

  useEffect(() => {
    const qLogs = query(collection(db, 'auditLogs'), where('actorId', '==', user.uid));
    const unsubscribe = onSnapshot(qLogs, (snapshot) => {
      const logs = snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() } as AuditLogEntry))
        .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
      setAuditLogs(logs);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'auditLogs'));
    return () => unsubscribe();
  }, [user.uid]);

  useEffect(() => {
    if (!auth.currentUser) return;
    const qReqs = query(
      collection(db, 'requirements'),
      where('employeeId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(qReqs, (snapshot) => {
      const sortedRequirements = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as Requirement))
        .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
      setRequirements(sortedRequirements);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'requirements'));

    return () => unsubscribe();
  }, [user.uid]);

  const handleSaveRequirement = async (e: FormEvent) => {
    e.preventDefault();
    if (!reqForm.name || !reqForm.phone || !reqForm.type) return alert('Name, Phone and Type are mandatory');
    const normalizedPhone = reqForm.phone.replace(/\D/g, '');
    if (normalizedPhone.length !== 10) return alert('Phone number must be exactly 10 digits.');
    setLoading(true);

    try {
      if (editingRequirementId) {
        await updateDoc(doc(db, 'requirements', editingRequirementId), {
          ...reqForm,
          phone: normalizedPhone,
          updatedAt: serverTimestamp(),
        });
        await addAuditLog(db, {
          action: 'requirement_updated',
          actorId: user.uid,
          actorName: user.name,
          actorRole: user.role,
          targetType: 'requirement',
          targetId: editingRequirementId,
          description: `Requirement updated for ${reqForm.name}`,
          newValue: { ...reqForm, phone: normalizedPhone },
        });
      } else {
        const reqRef = await addDoc(collection(db, 'requirements'), {
          clientId: (user as any).clientId || null,
          ...reqForm,
          phone: normalizedPhone,
          employeeId: user.uid,
          employeeName: user.name,
          createdAt: serverTimestamp()
        });
        await addAuditLog(db, {
          action: 'requirement_added',
          actorId: user.uid,
          actorName: user.name,
          actorRole: user.role,
          targetType: 'requirement',
          targetId: reqRef.id,
          description: `Requirement added for ${reqForm.name}`,
          newValue: { ...reqForm, phone: normalizedPhone },
        });
      }
      setShowReqModal(false);
      setEditingRequirementId(null);
      setReqForm({
        name: '',
        phone: '',
        type: 'zeemen',
        area: '',
        budget: '',
        location: '',
        remark: '',
        brokerState: '',
        brokerCity: '',
        brokerLocality: '',
        specializations: [],
      });
      alert(editingRequirementId ? 'Requirement updated successfully!' : 'Requirement added successfully!');
    } catch (error) {
      handleFirestoreError(error, editingRequirementId ? OperationType.UPDATE : OperationType.CREATE, 'requirements');
    } finally {
      setLoading(false);
    }
  };

  const startEditRequirement = (req: Requirement) => {
    setReqForm({
      name: req.name || '',
      phone: (req.phone || '').replace(/\D/g, '').slice(0, 10),
      type: req.type || 'zeemen',
      area: req.area || '',
      budget: req.budget || '',
      location: req.location || '',
      remark: req.remark || '',
      brokerState: req.brokerState || '',
      brokerCity: req.brokerCity || '',
      brokerLocality: req.brokerLocality || '',
      specializations: req.specializations || [],
    });
    setEditingRequirementId(req.id);
    setShowReqModal(true);
  };

  const filteredRequirements = useMemo(() => {
    const q = reqSearch.trim().toLowerCase();
    return requirements.filter((req) => {
      const matchesSearch = !q || [
        req.name, req.phone, req.type, req.location, req.brokerState, req.brokerCity, req.brokerLocality, ...(req.specializations || [])
      ].filter(Boolean).join(' ').toLowerCase().includes(q);
      const matchesState = !reqStateFilter || req.brokerState === reqStateFilter;
      const matchesCity = !reqCityFilter || req.brokerCity === reqCityFilter;
      const matchesSpec = !reqSpecializationFilter || (req.specializations || []).includes(reqSpecializationFilter);
      return matchesSearch && matchesState && matchesCity && matchesSpec;
    });
  }, [requirements, reqSearch, reqStateFilter, reqCityFilter, reqSpecializationFilter]);

  useEffect(() => {
    const ownerId = user.managerId || user.uid;
    const raw = localStorage.getItem(`estatepulse_requirement_specializations_${ownerId}`);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) setSpecializationOptions(Array.from(new Set([...DEFAULT_SPECIALIZATIONS, ...parsed.map(String)])));
    } catch {}
  }, [user.managerId, user.uid]);

  useEffect(() => {
    const ownerId = user.managerId || user.uid;
    localStorage.setItem(`estatepulse_requirement_specializations_${ownerId}`, JSON.stringify(specializationOptions));
  }, [specializationOptions, user.managerId, user.uid]);

  const handleAddLead = async (e: FormEvent) => {
    e.preventDefault();
    if (!tenantClientId) {
      alert('Your account is missing company mapping. Please contact admin.');
      return;
    }
    const normalizedPhone = normalizePhone(leadForm.phone);

    if (!normalizedPhone) return alert('Mobile number is mandatory.');
    if (normalizedPhone.length !== 10) return alert('Mobile number must be exactly 10 digits.');
    // Employee can only query leads visible to themselves per Firestore rules.
    // So duplicate checks must be scoped to employee-owned/added leads.
    const [duplicateAssignedSnapshot, duplicateAddedSnapshot] = await Promise.all([
      getDocs(query(collection(db, 'leads'), where('assignedTo', '==', user.uid), where('phone', '==', normalizedPhone), where('clientId', '==', tenantClientId), limit(1))),
      getDocs(query(collection(db, 'leads'), where('addedById', '==', user.uid), where('phone', '==', normalizedPhone), where('clientId', '==', tenantClientId), limit(1))),
    ]);
    const duplicateDoc = duplicateAssignedSnapshot.docs[0] || duplicateAddedSnapshot.docs[0];
    if (duplicateDoc) {
      const existingLead = duplicateDoc.data() as Lead;
      return alert(`Lead with mobile ${normalizedPhone} already exists in your records (${existingLead.name || 'Unknown'}).`);
    }

    setLoading(true);
    try {
      const leadRef = await addDoc(collection(db, 'leads'), {
        clientId: tenantClientId,
        clientName: (user as any).clientName || null,
        name: leadForm.name || 'Anonymous',
        phone: normalizedPhone,
        source: 'Employee Added',
        status: 'pending',
        assignedTo: user.uid,
        addedById: user.uid,
        addedByName: user.name,
        addedByRole: 'employee',
        assignedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      try {
        await addAuditLog(db, {
          action: 'lead_added',
          actorId: user.uid,
          actorName: user.name,
          actorRole: user.role,
          targetType: 'lead',
          targetId: leadRef.id,
          description: `Lead added by executive: ${leadForm.name || 'Anonymous'}`,
          newValue: { name: leadForm.name || 'Anonymous', phone: normalizedPhone, assignedTo: user.uid },
        });
      } catch {
        // Non-blocking: lead creation succeeded even if audit log write is denied by rules.
      }

      setLeadForm({ name: '', phone: '', source: 'Employee Added' });
      setShowAddLead(false);
      alert('Lead added successfully!');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'leads');
    } finally {
      setLoading(false);
    }
  };

  const effectiveQueueTab: LeadQueueTab =
    activeTab === 'today' || activeTab === 'upcoming' || activeTab === 'overdue'
      ? activeTab
      : followupSubTab;
  const queueLeads = leads.filter((l) => l.assignedTo === user.uid && getLeadQueueTab(l) === effectiveQueueTab);
  const employeeAssignedLeads = useMemo(
    () => leads.filter((lead) => lead.assignedTo === user.uid).sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt)),
    [leads, user.uid]
  );
  const employeeAssignedLeadsFiltered = useMemo(() => {
    const term = leadSearchQuery.trim().toLowerCase();
    const base = notInterestedOnly
      ? employeeAssignedLeads.filter((lead) => lead.status === 'not_interested')
      : employeeAssignedLeads;
    if (!term) return base;
    return base.filter((lead) =>
      [lead.name, lead.phone, lead.source, lead.status, lead.lastRemark]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(term)
    );
  }, [employeeAssignedLeads, leadSearchQuery, notInterestedOnly]);
  const searchTerm = leadSearchQuery.trim().toLowerCase();
  const filteredLeads = queueLeads.filter(l => {
    if (!searchTerm) return true;
    const searchableText = [
      l.name,
      l.phone,
      l.source,
      l.status?.replace('_', ' '),
      l.addedByName,
      l.lastRemark
    ].filter(Boolean).join(' ').toLowerCase();
    return searchableText.includes(searchTerm);
  });

  const currentLead = selectedLeadIndex !== null ? filteredLeads[selectedLeadIndex] : null;
  const canManageCurrentLead = Boolean(currentLead && currentLead.assignedTo === user.uid);

  useEffect(() => {
    setSelectedLeadIndex(null);
  }, [leadSearchQuery]);

  useEffect(() => {
    if (currentLead) {
      const qFollowups = query(
        collection(db, 'leads', currentLead.id, 'followups'),
        orderBy('date', 'desc')
      );
      const unsubscribe = onSnapshot(qFollowups, (snapshot) => {
        setFollowups(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Followup)));
      });
      return () => unsubscribe();
    }
  }, [currentLead?.id]);

  useEffect(() => {
    if (!selectedAssignedLead) {
      setSelectedAssignedLeadFollowups([]);
      return;
    }
    setAssignedLeadEditName(selectedAssignedLead.name || '');
    setAssignedLeadEditStatus(selectedAssignedLead.status || 'pending');
    const qFollowups = query(
      collection(db, 'leads', selectedAssignedLead.id, 'followups'),
      orderBy('date', 'desc')
    );
    const unsubscribe = onSnapshot(qFollowups, (snapshot) => {
      setSelectedAssignedLeadFollowups(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Followup)));
    });
    return () => unsubscribe();
  }, [selectedAssignedLead?.id, selectedAssignedLead?.name, selectedAssignedLead?.status]);

  useEffect(() => {
    setSelectedStatus(null);
    setShowHistory(false);
    setKycFiles({ aadhaar: null, pan: null });
  }, [currentLead?.id]);

  const uploadKycDocument = async (file: File, leadId: string, docType: 'aadhaar' | 'pan') => {
    if (!hasCloudinaryConfig) {
      throw new Error('Cloudinary is not configured. Add VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET.');
    }

    const endpoint = `https://api.cloudinary.com/v1_1/${cloudinaryCloudName}/auto/upload`;
    const body = new FormData();
    body.append('file', file);
    body.append('upload_preset', cloudinaryUploadPreset);
    body.append('folder', `leads/${leadId}/kyc/${docType}`);

    const response = await withTimeout(
      fetch(endpoint, { method: 'POST', body }),
      12000,
      `Upload timed out for ${file.name}.`
    );

    const result = await withTimeout(
      response.json() as Promise<{ secure_url?: string; error?: { message?: string } }>,
      8000,
      `Could not parse upload response for ${file.name}.`
    );

    if (!response.ok || !result.secure_url) {
      const reason = result?.error?.message || 'Unknown upload error';
      throw new Error(`KYC upload failed for ${file.name}: ${reason}`);
    }

    return result.secure_url;
  };

  const handleAttendanceCorrectionRequest = async ({
    row,
    loginTime,
    logoutTime,
    remark,
  }: {
    row: { uid: string; employeeName: string; date: Date };
    loginTime: Date | null;
    logoutTime: Date | null;
    remark: string;
  }) => {
    if (!auth.currentUser || row.uid !== user.uid) return;
    const key = `${row.date.getFullYear()}-${String(row.date.getMonth() + 1).padStart(2, '0')}-${String(row.date.getDate()).padStart(2, '0')}`;
    try {
      await addDoc(collection(db, 'attendanceCorrections'), {
        clientId: (user as any).clientId || null,
        uid: user.uid,
        employeeName: user.name,
        dateKey: key,
        date: Timestamp.fromDate(row.date),
        requestedLoginTime: loginTime ? Timestamp.fromDate(loginTime) : null,
        requestedLogoutTime: logoutTime ? Timestamp.fromDate(logoutTime) : null,
        remark,
        status: 'pending',
        requestedBy: user.uid,
        requestedByName: user.name,
        requestedAt: serverTimestamp(),
      });
      alert('Attendance correction request sent to admin for approval.');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'attendanceCorrections');
    }
  };

  const handleUpdateLead = async (status: Lead['status']) => {
    if (!currentLead) return;
    if (currentLead.assignedTo !== user.uid) return alert('This lead is not assigned to you. You can only view it.');
    if (!remark) return alert('Remark is mandatory for call made');
    if (status === 'deal_pending') {
      const hasAadhaar = Boolean(currentLead.kycAadhaarUrl || kycFiles.aadhaar);
      const hasPan = Boolean(currentLead.kycPanUrl || kycFiles.pan);
      if (!hasAadhaar || !hasPan) return alert('Aadhaar card and PAN card are mandatory for deal review.');
      if ((kycFiles.aadhaar || kycFiles.pan) && !hasCloudinaryConfig) {
        return alert('Cloudinary is not configured. Please set VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET in .env.local.');
      }
    }
    setLoading(true);

    try {
      const leadRef = doc(db, 'leads', currentLead.id);
      const updateData: any = {
        status,
        lastRemark: remark,
        updatedAt: serverTimestamp(),
        lastInteractionAt: serverTimestamp(),
      };

      if (status === 'deal_pending') {
        if (kycFiles.aadhaar) {
          updateData.kycAadhaarUrl = await uploadKycDocument(kycFiles.aadhaar, currentLead.id, 'aadhaar');
          updateData.kycAadhaarName = kycFiles.aadhaar.name;
        }
        if (kycFiles.pan) {
          updateData.kycPanUrl = await uploadKycDocument(kycFiles.pan, currentLead.id, 'pan');
          updateData.kycPanName = kycFiles.pan.name;
        }
        updateData.kycUploadedAt = serverTimestamp();
      }

      if (nextDate && !isNaN(new Date(nextDate).getTime())) {
        updateData.nextFollowupAt = Timestamp.fromDate(new Date(nextDate));
      } else if (status === 'not_interested' || status === 'deal_approved') {
        updateData.nextFollowupAt = deleteField();
      }

      await updateDoc(leadRef, updateData);
      await addAuditLog(db, {
        action: status === 'deal_pending' ? 'lead_sent_for_approval' : 'lead_followup_updated',
        actorId: user.uid,
        actorName: user.name,
        actorRole: user.role,
        targetType: 'lead',
        targetId: currentLead.id,
        description: `Lead "${currentLead.name}" updated to ${status}`,
        oldValue: { status: currentLead.status, lastRemark: currentLead.lastRemark || null },
        newValue: { status, remark, nextDate: nextDate || null },
      });

      await addDoc(collection(db, 'leads', currentLead.id, 'followups'), {
        date: serverTimestamp(),
        remark,
        employeeId: user.uid
      });

      setRemark('');
      setNextDate('');
      setSelectedStatus(null);
      setKycFiles({ aadhaar: null, pan: null });
      setCapturedImage(null);
      // Move to next lead if exists
      if (selectedLeadIndex !== null && selectedLeadIndex < filteredLeads.length - 1) {
        setSelectedLeadIndex(selectedLeadIndex + 1);
      } else {
        setSelectedLeadIndex(null);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `leads/${currentLead.id}`);
    } finally {
      setLoading(false);
    }
  };

  const stopCameraStream = () => {
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
  };

  const startCamera = async (mode?: 'environment' | 'user') => {
    const targetMode = mode ?? cameraFacingMode;
    setVisitStep('capture');
    try {
      stopCameraStream();
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: { ideal: targetMode } }
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCameraFacingMode(targetMode);
    } catch (err) {
      alert('Camera access denied');
      setVisitStep('idle');
    }
  };

  const capturePhoto = () => {
    if (videoRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      canvas.getContext('2d')?.drawImage(videoRef.current, 0, 0);
      const dataUrl = canvas.toDataURL('image/jpeg');
      setCapturedImage(dataUrl);

      stopCameraStream();
      setVisitStep('confirm');
    }
  };

  const handleVerifyLocation = async () => {
    setVisitStep('verifying');
    try {
      const pos = await new Promise<GeolocationPosition>((res, rej) => {
        navigator.geolocation.getCurrentPosition(res, rej, { 
          enableHighAccuracy: true, 
          timeout: 10000 
        });
      });
      setLocation({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude
      });
      setVisitStep('verified');
    } catch (error) {
      alert('Could not verify location. Please ensure GPS is enabled.');
      setVisitStep('confirm');
    }
  };

  const handleUpdateAssignedLeadDetails = async () => {
    if (!selectedAssignedLead) return;
    if (selectedAssignedLead.assignedTo !== user.uid) return alert('This lead is not assigned to you.');

    const nextName = assignedLeadEditName.trim();
    const nextStatus = assignedLeadEditStatus;
    if (!nextName) return alert('Lead name is required.');

    const statusChanged = nextStatus !== selectedAssignedLead.status;
    const nameChanged = nextName !== selectedAssignedLead.name;
    if (!statusChanged && !nameChanged) return alert('No changes to save.');

    setLoading(true);
    try {
      const leadRef = doc(db, 'leads', selectedAssignedLead.id);
      const updateData: any = {
        name: nextName,
        status: nextStatus,
        updatedAt: serverTimestamp(),
      };
      if (statusChanged) {
        updateData.lastInteractionAt = serverTimestamp();
        updateData.lastRemark = `Status changed to ${nextStatus.replace('_', ' ')}`;
        if (nextStatus === 'not_interested') {
          updateData.nextFollowupAt = deleteField();
        }
      }

      await updateDoc(leadRef, updateData);

      if (statusChanged || nameChanged) {
        const changes: string[] = [];
        if (nameChanged) changes.push(`name changed from "${selectedAssignedLead.name}" to "${nextName}"`);
        if (statusChanged) changes.push(`status changed from ${(selectedAssignedLead.status || 'pending').replace('_', ' ')} to ${nextStatus.replace('_', ' ')}`);
        await addDoc(collection(db, 'leads', selectedAssignedLead.id, 'followups'), {
          date: serverTimestamp(),
          remark: changes.join('; '),
          employeeId: user.uid,
        });
      }

      await addAuditLog(db, {
        action: 'assigned_lead_modified',
        actorId: user.uid,
        actorName: user.name,
        actorRole: user.role,
        targetType: 'lead',
        targetId: selectedAssignedLead.id,
        description: `Assigned lead updated: ${nextName}`,
        oldValue: { name: selectedAssignedLead.name, status: selectedAssignedLead.status },
        newValue: { name: nextName, status: nextStatus },
      });

      const localUpdate = {
        ...selectedAssignedLead,
        name: nextName,
        status: nextStatus,
        lastRemark: statusChanged ? `Status changed to ${nextStatus.replace('_', ' ')}` : selectedAssignedLead.lastRemark,
        nextFollowupAt: nextStatus === 'not_interested' ? undefined : selectedAssignedLead.nextFollowupAt,
      } as Lead;
      setSelectedAssignedLead(localUpdate);
      setLeads((prev) => prev.map((lead) => (lead.id === selectedAssignedLead.id ? { ...lead, ...localUpdate } : lead)));
      alert('Lead updated successfully.');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `leads/${selectedAssignedLead.id}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSiteVisit = async () => {
    if (!capturedImage || !location) return alert('Photo and Location are mandatory');
    if (!currentLead || currentLead.assignedTo !== user.uid) return alert('This lead is not assigned to you. You can only view it.');
    setLoading(true);

    try {
      const leadRef = doc(db, 'leads', currentLead!.id);
      await updateDoc(leadRef, {
        siteVisitPhoto: capturedImage,
        siteVisitLocation: location,
        siteVisitAt: serverTimestamp(),
        status: 'interested'
      });

      await addDoc(collection(db, 'leads', currentLead!.id, 'followups'), {
        date: serverTimestamp(),
        remark: 'Site visit completed with verified location and photo.',
        employeeId: user.uid
      });

      setCapturedImage(null);
      setLocation(null);
      setVisitStep('idle');
      alert('Site visit recorded successfully!');
    } catch (error) {
       handleFirestoreError(error, OperationType.UPDATE, `leads/${currentLead?.id}`);
    } finally {
      setLoading(false);
    }
  };

  const handleTransfer = async (targetEmployee: User) => {
    if (!currentLead) return;
    if (currentLead.assignedTo !== user.uid) return alert('This lead is not assigned to you. You can only view it.');
    if (!tenantClientId || (targetEmployee as any).clientId !== tenantClientId) return alert('You can transfer leads only within your company.');
    if (!confirm(`Transfer lead to ${targetEmployee.name}?`)) return;
    setLoading(true);

    try {
      const leadRef = doc(db, 'leads', currentLead.id);
      await updateDoc(leadRef, {
        assignedTo: targetEmployee.uid,
        updatedAt: serverTimestamp()
      });

      await addDoc(collection(db, 'leads', currentLead.id, 'followups'), {
        date: serverTimestamp(),
        remark: `Lead transferred from ${user.name} to ${targetEmployee.name}`,
        employeeId: user.uid
      });
      await addDoc(collection(db, 'leadTransfers'), {
        clientId: (currentLead as any).clientId || (user as any).clientId || null,
        leadId: currentLead.id,
        leadName: currentLead.name,
        fromUid: user.uid,
        fromName: user.name,
        toUid: targetEmployee.uid,
        toName: targetEmployee.name,
        transferredByUid: user.uid,
        transferredByName: user.name,
        transferredByRole: user.role,
        createdAt: serverTimestamp(),
      });

      await addDoc(collection(db, 'notifications'), {
        userId: targetEmployee.uid,
        title: 'New Lead Assigned',
        message: `${user.name} re-assigned lead "${currentLead.name}" to you.`,
        leadId: currentLead.id,
        read: false,
        createdAt: serverTimestamp(),
      });
      await addAuditLog(db, {
        action: 'lead_transferred',
        actorId: user.uid,
        actorName: user.name,
        actorRole: user.role,
        targetType: 'lead',
        targetId: currentLead.id,
        description: `Lead transferred to ${targetEmployee.name}`,
        oldValue: { assignedTo: currentLead.assignedTo },
        newValue: { assignedTo: targetEmployee.uid },
      });

      setShowTransferModal(false);
      setSelectedLeadIndex(null);
      alert(`Lead successfully transferred to ${targetEmployee.name}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `leads/${currentLead.id}`);
    } finally {
      setLoading(false);
    }
  };

  const sortedLeadTransfers = useMemo(() => {
    const compareValues = (a: unknown, b: unknown) => {
      const aNum = typeof a === 'number' ? a : Number.NaN;
      const bNum = typeof b === 'number' ? b : Number.NaN;
      if (!Number.isNaN(aNum) && !Number.isNaN(bNum)) return aNum - bNum;
      return String(a ?? '').localeCompare(String(b ?? ''), undefined, { sensitivity: 'base' });
    };
    const list = [...leadTransfers];
    list.sort((a, b) => {
      const mapA: Record<string, unknown> = {
        when: toDateValue(a.createdAt)?.getTime() || 0,
        lead: a.leadName || a.leadId,
        from: a.fromName,
        to: a.toName,
        by: a.transferredByName,
      };
      const mapB: Record<string, unknown> = {
        when: toDateValue(b.createdAt)?.getTime() || 0,
        lead: b.leadName || b.leadId,
        from: b.fromName,
        to: b.toName,
        by: b.transferredByName,
      };
      const result = compareValues(mapA[transferTableSort.key], mapB[transferTableSort.key]);
      return transferTableSort.dir === 'asc' ? result : -result;
    });
    return list;
  }, [leadTransfers, transferTableSort]);

  const filteredLeadTransfers = useMemo(() => {
    const q = transferRegisterSearch.trim().toLowerCase();
    if (!q) return sortedLeadTransfers;
    return sortedLeadTransfers.filter((entry) => [
      entry.leadName, entry.leadId, entry.fromName, entry.toName, entry.transferredByName
    ].filter(Boolean).join(' ').toLowerCase().includes(q));
  }, [sortedLeadTransfers, transferRegisterSearch]);

  return (
    <div className="lg:h-full lg:overflow-hidden">
      <div className="grid gap-0 lg:grid-cols-[236px_minmax(0,1fr)] lg:h-full">
        <aside className="hidden lg:sticky lg:top-0 lg:h-screen lg:flex lg:flex-col bg-gradient-to-b from-[#03143d] to-[#010f30] text-white p-3">
          <div className="px-3 py-2 border-b border-white/10">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-7 w-7 items-center justify-center overflow-hidden rounded-lg bg-blue-600 text-white">
                {brand?.logoUrl?.trim() && !brandLogoFailed ? (
                  <img
                    src={brand.logoUrl.trim()}
                    alt="Brand"
                    className="h-full w-full object-cover"
                    onError={() => setBrandLogoFailed(true)}
                  />
                ) : (
                  <UserIcon size={16} />
                )}
              </span>
              <p className="text-lg font-black tracking-tight">{brand?.companyName || 'EstatePulse'}</p>
            </div>
            <p className="text-[10px] uppercase tracking-widest text-white/70">Executive</p>
            {brand?.tagline ? <p className="mt-1 text-[10px] text-white/70">{brand.tagline}</p> : null}
          </div>
          <nav className="mt-3 flex-1 space-y-1">
            {employeeTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id as EmployeeView); setSelectedLeadIndex(null); }}
                className={cn(
                  "w-full flex items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold transition-all",
                  activeTab === tab.id || (tab.id === 'followups' && (activeTab === 'today' || activeTab === 'upcoming' || activeTab === 'overdue'))
                    ? "bg-blue-600/30 text-white border border-blue-300/30"
                    : "text-white/80 hover:text-white hover:bg-white/10"
                )}
              >
                <tab.icon size={16} />
                {tab.label}
              </button>
            ))}
          </nav>
          <div className="rounded-xl bg-white/10 px-3 py-2 text-xs">
            <p className="font-black">{user.name}</p>
            <p className="text-white/70">{user.phone}</p>
          </div>
        </aside>

        <div
          className="min-w-0 lg:h-full lg:overflow-auto space-y-6 px-4 py-3"
          style={{ paddingBottom: 'calc(var(--bottom-nav-height, 64px) + env(safe-area-inset-bottom, 0px) + 24px)' }}
        >
      {/* Professional Header & Attendance */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 sm:gap-6 bg-white/40 backdrop-blur-2xl p-4 sm:p-8 rounded-[32px] sm:rounded-[48px] border border-white/40 shadow-2xl shadow-blue-900/5 ring-1 ring-black/[0.02]">
        <div className="flex items-center gap-4 sm:gap-6 px-1">
          <div className="w-14 h-14 sm:w-20 sm:h-20 rounded-2xl sm:rounded-[32px] bg-gradient-to-tr from-blue-600 to-blue-500 flex items-center justify-center text-white shadow-2xl shadow-blue-600/40 transform hover:rotate-3 transition-transform overflow-hidden">
            {user.profileImageUrl ? (
              <img
                src={user.profileImageUrl}
                alt={user.name}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <>
                <UserIcon size={26} className="sm:hidden" />
                <UserIcon size={40} className="hidden sm:block" />
              </>
            )}
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight leading-none mb-1.5 sm:mb-2">Hey, {user.name.split(' ')[0]}</h1>
            <div className="flex items-center gap-2.5 sm:gap-3">
              <div className={cn(
                "w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full ring-4",
                isClockedIn ? "bg-green-500 ring-green-100 animate-pulse" : "bg-red-400 ring-red-100"
              )} />
              <p className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] font-mono">
                {isClockedIn ? "Live Tracker Active" : "Offline Mode"}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-4">
          <button
            onClick={() => handleAttendance(isClockedIn ? 'clock_out' : 'clock_in')}
            disabled={attendanceLoading}
            className={cn(
              "px-6 sm:px-10 py-3 sm:py-4 rounded-2xl sm:rounded-[24px] font-black text-xs sm:text-sm tracking-widest uppercase transition-all active:scale-95 flex items-center gap-2.5 sm:gap-3 border shadow-xl",
              isClockedIn 
                ? "bg-red-50 text-red-600 border-red-100 hover:bg-red-100/50" 
                : "bg-blue-600 text-white border-transparent hover:bg-blue-700 shadow-blue-300/40"
            )}
          >
            {attendanceLoading ? (
              <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
            ) : (
              <MapPin size={18} className="sm:hidden" />
            )}
            {!attendanceLoading && <MapPin size={22} className="hidden sm:block" />}
            {isClockedIn ? "Check Out" : "Check In"}
          </button>
          
          <button 
            onClick={() => setShowNotifications(true)}
            className="p-2.5 sm:p-4 relative bg-white border border-slate-100 rounded-2xl sm:rounded-[24px] hover:border-blue-200 transition-all shadow-lg shadow-slate-200/50 active:scale-95 group"
          >
            <Bell size={20} className="sm:hidden text-slate-400 group-hover:text-blue-500 transition-colors relative z-10" />
            <Bell size={28} className="hidden sm:block text-slate-400 group-hover:text-blue-500 transition-colors relative z-10" />
            {notifications.filter(n => !n.read).length > 0 && (
              <span className="absolute top-0.5 right-0.5 sm:top-3 sm:right-3 w-5 h-5 sm:w-7 sm:h-7 bg-blue-600 text-white text-[9px] sm:text-[11px] font-black rounded-full flex items-center justify-center border-2 sm:border-4 border-white shadow-lg z-20">
                {notifications.filter(n => !n.read).length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="relative mb-6 md:mb-8 md:sticky md:top-20 z-30 lg:hidden">
        <div
          ref={tabsScrollRef}
          className="flex bg-white/90 backdrop-blur p-1.5 rounded-[24px] border border-slate-100 overflow-x-auto no-scrollbar whitespace-nowrap"
        >
        {employeeTabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => { setActiveTab(tab.id as any); setSelectedLeadIndex(null); }}
            className={cn(
              "min-w-[130px] md:min-w-0 md:flex-1 flex items-center justify-center gap-3 py-3.5 px-6 rounded-2xl text-xs font-black uppercase tracking-widest transition-all",
              activeTab === tab.id || (tab.id === 'followups' && (activeTab === 'today' || activeTab === 'upcoming' || activeTab === 'overdue'))
                ? "bg-slate-900 text-white shadow-xl shadow-slate-200" 
                : "text-slate-400 hover:text-slate-600 hover:bg-white"
            )}
          >
            <tab.icon size={16} /> {tab.label}
          </button>
        ))}
        </div>
        <button
          type="button"
          onClick={() => scrollTabs('left')}
          className={cn(
            "md:hidden absolute left-1 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-white/95 border border-slate-200 shadow-sm flex items-center justify-center text-slate-500 transition-all",
            canScrollTabsLeft ? "opacity-100" : "opacity-30 pointer-events-none"
          )}
          aria-label="Scroll tabs left"
          title="Scroll tabs left"
        >
          <ChevronLeft size={14} />
        </button>
        <button
          type="button"
          onClick={() => scrollTabs('right')}
          className={cn(
            "md:hidden absolute right-1 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-white/95 border border-slate-200 shadow-sm flex items-center justify-center text-slate-500 transition-all",
            canScrollTabsRight ? "opacity-100" : "opacity-30 pointer-events-none"
          )}
          aria-label="Scroll tabs right"
          title="Scroll tabs right"
        >
          <ChevronRight size={14} />
        </button>
      </div>

      {activeTab === 'attendance' ? (
        <MonthlyAttendanceReport
          user={user}
          members={[user]}
          attendance={attendanceRecords}
          isManager={false}
          attendanceLoading={attendanceLoading}
          isManagerClockedIn={isClockedIn}
          onManagerAttendance={handleAttendance}
          scope="employee"
          correctionRequests={attendanceCorrections}
          onRequestCorrection={handleAttendanceCorrectionRequest}
        />
      ) : activeTab === 'performance' ? (
        <SalesPerformanceDashboard
          user={user}
          leads={leads}
          employees={employees}
          attendance={attendanceRecords}
          scope="employee"
        />
      ) : activeTab === 'leads' ? (
        <div className="space-y-6 pt-3 sm:pt-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight">My Assigned Leads</h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowAddLead(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white shadow-lg shadow-blue-100 hover:bg-blue-700"
              >
                <PlusCircle size={14} /> Add Lead
              </button>
              {notInterestedOnly && (
                <button
                  type="button"
                  onClick={() => setNotInterestedOnly(false)}
                  className="text-[10px] font-black uppercase tracking-wider text-rose-700 bg-rose-100 px-2.5 py-1 rounded-full"
                >
                  Not Interested Filter ON
                </button>
              )}
              <span className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
                {employeeAssignedLeadsFiltered.length}
              </span>
            </div>
          </div>
          <div className="relative">
            <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={leadSearchQuery}
              onChange={e => setLeadSearchQuery(e.target.value)}
              placeholder="Search my assigned leads..."
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-700 placeholder:text-slate-400 focus:ring-4 focus:ring-blue-100 focus:border-blue-300 outline-none"
            />
          </div>
          <div className="bg-white rounded-3xl border border-slate-100 shadow-xl shadow-slate-200/20 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Client</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Phone</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Source</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Status</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">
                      <button
                        type="button"
                        onClick={() => setNotInterestedOnly((prev) => !prev)}
                        className={cn(
                          "inline-flex items-center gap-1",
                          notInterestedOnly ? "text-rose-600" : "text-slate-400"
                        )}
                        title="Toggle only not interested leads"
                      >
                        Not Interested {notInterestedOnly ? '(ON)' : ''}
                      </button>
                    </th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {employeeAssignedLeadsFiltered.map((lead) => (
                    <tr
                      key={lead.id}
                      className="hover:bg-slate-50/50 transition-colors cursor-pointer"
                      onClick={() => setSelectedAssignedLead(lead)}
                    >
                      <td className="px-6 py-4 text-sm font-black text-slate-800">{lead.name}</td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-bold text-slate-600">{lead.phone}</span>
                          <a
                            href={getWhatsAppUrl(lead.phone)}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(event) => event.stopPropagation()}
                            className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-emerald-700 hover:bg-emerald-100"
                            title="Chat on WhatsApp"
                          >
                            <MessageSquare size={10} /> WhatsApp
                          </a>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm font-bold text-slate-600">{lead.source || '-'}</td>
                      <td className="px-6 py-4 text-xs font-black text-slate-700 uppercase">{(lead.status || 'pending').replace('_', ' ')}</td>
                      <td className="px-6 py-4">
                        <span className={cn(
                          "px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-wider",
                          lead.status === 'not_interested' ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-500"
                        )}>
                          {lead.status === 'not_interested' ? 'Yes' : 'No'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs font-bold text-slate-500">{formatDateValue(lead.createdAt, 'MMM dd, yyyy hh:mm a', 'N/A')}</td>
                    </tr>
                  ))}
                  {employeeAssignedLeadsFiltered.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-16 text-center text-sm font-bold text-slate-400">No assigned leads found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : activeTab === 'requirements' ? (
        <div className="space-y-7 pt-3 sm:pt-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <h2 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight">Requirement List</h2>
            <button 
              onClick={() => setShowReqModal(true)}
              className="w-full sm:w-auto px-5 py-3 bg-blue-600 text-white font-black text-[10px] sm:text-xs uppercase tracking-widest rounded-2xl shadow-xl shadow-blue-200 hover:bg-blue-700 transition-all flex items-center justify-center gap-2"
            >
              <PlusCircle size={18} /> Add New Requirement
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <input value={reqSearch} onChange={(e) => setReqSearch(e.target.value)} placeholder="Search by name, phone, location, specialization..." className="px-3 py-2 rounded-xl border border-slate-200 text-sm" />
            <select value={reqStateFilter} onChange={(e) => { setReqStateFilter(e.target.value); setReqCityFilter(''); }} className="px-3 py-2 rounded-xl border border-slate-200 text-sm">
              <option value="">All States</option>
              {Object.keys(LOCATION_MAP).map((state) => <option key={state} value={state}>{state}</option>)}
            </select>
            <select value={reqCityFilter} onChange={(e) => setReqCityFilter(e.target.value)} className="px-3 py-2 rounded-xl border border-slate-200 text-sm">
              <option value="">All Cities</option>
              {(reqStateFilter ? LOCATION_MAP[reqStateFilter] || [] : Array.from(new Set(Object.values(LOCATION_MAP).flat()))).map((city) => <option key={city} value={city}>{city}</option>)}
            </select>
            <select value={reqSpecializationFilter} onChange={(e) => setReqSpecializationFilter(e.target.value)} className="px-3 py-2 rounded-xl border border-slate-200 text-sm">
              <option value="">All Specializations</option>
              {specializationOptions.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredRequirements.map(req => (
              <motion.div 
                key={req.id}
                layout
                className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-xl shadow-slate-200/20 space-y-4 group hover:border-blue-200 transition-all"
              >
                <div className="flex items-start justify-between">
                  <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-black text-xl group-hover:bg-blue-600 group-hover:text-white transition-all transform group-hover:rotate-6">
                    {req.name[0]}
                  </div>
                  <div className="bg-slate-900 text-white px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-[0.2em]">
                    {req.type}
                  </div>
                </div>
                {(req.specializations || []).length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {(req.specializations || []).map((s) => <span key={s} className="px-2 py-0.5 bg-blue-50 text-blue-700 text-[9px] font-black rounded-full uppercase">{s}</span>)}
                  </div>
                )}

                <div>
                  <h3 className="font-black text-slate-900 text-lg tracking-tight">{req.name}</h3>
                  <div className="flex flex-wrap items-center gap-2 text-slate-400 font-bold text-xs mt-1">
                    <span className="inline-flex items-center gap-2">
                      <Phone size={14} /> {req.phone}
                    </span>
                    <a
                      href={getWhatsAppUrl(req.phone)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-emerald-700 hover:bg-emerald-100"
                      title="Chat on WhatsApp"
                    >
                      <MessageSquare size={10} /> WhatsApp
                    </a>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 py-4 border-t border-slate-50">
                  <div className="space-y-1">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Budget</p>
                    <p className="text-xs font-black text-slate-700">₹ {req.budget || 'N/A'}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Area</p>
                    <p className="text-xs font-black text-slate-700">{req.area || 'N/A'}</p>
                  </div>
                  <div className="space-y-1 col-span-2">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Location</p>
                    <p className="text-xs font-black text-slate-700 flex items-center gap-1">
                      <MapPin size={10} className="text-blue-500" /> {req.brokerState && req.brokerCity ? `${req.brokerState}, ${req.brokerCity}${req.brokerLocality ? `, ${req.brokerLocality}` : ''}` : (req.location || 'N/A')}
                    </p>
                  </div>
                </div>

                {req.remark && (
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Remark / Requirement</p>
                    <p className="text-xs text-slate-600 leading-relaxed font-medium line-clamp-2">{req.remark}</p>
                  </div>
                )}
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => startEditRequirement(req)}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-blue-700 hover:bg-blue-100 transition-colors"
                  >
                    <Edit2 size={14} /> Edit Requirement
                  </button>
                </div>
              </motion.div>
            ))}
            {requirements.length === 0 && (
              <div className="col-span-full py-20 bg-white/50 rounded-[48px] border-4 border-dashed border-slate-100 text-center">
                <div className="w-20 h-20 bg-slate-50 text-slate-200 rounded-full flex items-center justify-center mx-auto mb-4">
                  <FileText size={40} />
                </div>
                <p className="text-slate-400 font-black text-xs uppercase tracking-[0.2em]">No Requirements Listed</p>
              </div>
            )}
          </div>
        </div>
      ) : activeTab === 'activity_logs' ? (
        <div className="space-y-6 pt-3 sm:pt-4">
          <h2 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight">My Activity Logs</h2>
          <ActivityLogsTable
            logs={auditLogs}
            showActor={false}
            className="border-slate-100 shadow-xl shadow-slate-200/20"
            formatWhen={(value) => formatDateValue(value, 'MMM dd, yyyy hh:mm a', 'N/A')}
          />
        </div>
      ) : activeTab === 'transfer_register' ? (
        <div className="space-y-6 pt-3 sm:pt-4">
          <h2 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight">Lead Transfer Register</h2>
          <input
            value={transferRegisterSearch}
            onChange={(e) => setTransferRegisterSearch(e.target.value)}
            placeholder="Search by lead, from, to, transferred by..."
            className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
          />
          <div className="bg-white rounded-3xl border border-slate-100 shadow-xl shadow-slate-200/20 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest"><button type="button" onClick={() => setTransferTableSort((p) => ({ key: 'when', dir: p.key === 'when' && p.dir === 'asc' ? 'desc' : 'asc' }))}>When</button></th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest"><button type="button" onClick={() => setTransferTableSort((p) => ({ key: 'lead', dir: p.key === 'lead' && p.dir === 'asc' ? 'desc' : 'asc' }))}>Lead</button></th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest"><button type="button" onClick={() => setTransferTableSort((p) => ({ key: 'from', dir: p.key === 'from' && p.dir === 'asc' ? 'desc' : 'asc' }))}>From</button></th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest"><button type="button" onClick={() => setTransferTableSort((p) => ({ key: 'to', dir: p.key === 'to' && p.dir === 'asc' ? 'desc' : 'asc' }))}>To</button></th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest"><button type="button" onClick={() => setTransferTableSort((p) => ({ key: 'by', dir: p.key === 'by' && p.dir === 'asc' ? 'desc' : 'asc' }))}>Transferred By</button></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredLeadTransfers.map((entry) => (
                    <tr key={entry.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4 text-xs font-bold text-slate-500">{formatDateValue(entry.createdAt, 'MMM dd, yyyy hh:mm a', 'N/A')}</td>
                      <td className="px-6 py-4 text-sm font-black text-slate-800">{entry.leadName || entry.leadId}</td>
                      <td className="px-6 py-4 text-sm font-bold text-slate-600">{entry.fromName || '-'}</td>
                      <td className="px-6 py-4 text-sm font-bold text-slate-600">{entry.toName || '-'}</td>
                      <td className="px-6 py-4 text-sm font-bold text-slate-600">{entry.transferredByName || '-'}</td>
                    </tr>
                  ))}
                  {leadTransfers.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-16 text-center text-sm font-bold text-slate-400">No lead transfer records found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : activeTab === 'inventory' ? (
        <InventoryManagement user={user} />
      ) : (
        <div className="flex flex-col lg:flex-row gap-5 md:gap-6">
        {/* Leads List Side */}
        <div className={cn("w-full lg:w-[400px] space-y-4", selectedLeadIndex !== null && "hidden lg:block")}>
          <div className="px-4">
            <div className="inline-flex items-center rounded-2xl bg-white border border-slate-100 p-1.5 gap-1.5 shadow-sm">
              {[
                { id: 'overdue', label: 'Overdue' },
                { id: 'today', label: 'Today' },
                { id: 'upcoming', label: 'Upcoming' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => { setActiveTab('followups'); setFollowupSubTab(tab.id as LeadQueueTab); setSelectedLeadIndex(null); }}
                  className={cn(
                    "px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                    effectiveQueueTab === tab.id ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-50"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between px-4">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] font-mono">
              {effectiveQueueTab} Queue ({filteredLeads.length})
            </h3>
            <button
              onClick={() => setShowAddLead(true)}
              className="px-3 py-2 bg-blue-600 text-white font-black text-[10px] uppercase tracking-widest rounded-xl shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all flex items-center gap-1.5"
            >
              <PlusCircle size={14} /> Add Lead
            </button>
          </div>
          <div className="px-4">
            <div className="relative">
              <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={leadSearchQuery}
                onChange={e => setLeadSearchQuery(e.target.value)}
                placeholder="Search by name, number, source..."
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-700 placeholder:text-slate-400 focus:ring-4 focus:ring-blue-100 focus:border-blue-300 outline-none"
              />
            </div>
          </div>
          <div className="space-y-3 max-h-none lg:max-h-[calc(100vh-450px)] overflow-visible lg:overflow-y-auto pr-0 lg:pr-2 pb-2 custom-scrollbar">
            {filteredLeads.map((lead, idx) => (
              <motion.button
                key={lead.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.03 }}
                whileHover={{ x: 4 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setSelectedLeadIndex(idx)}
                className={cn(
                  "w-full text-left p-4 sm:p-5 rounded-[28px] sm:rounded-[32px] border transition-all duration-300 flex items-center gap-3 sm:gap-4 group",
                  selectedLeadIndex === idx 
                    ? "bg-white border-blue-500 shadow-2xl shadow-blue-900/10 ring-4 ring-blue-50/50" 
                    : "bg-white border-slate-100 shadow-xl shadow-slate-200/10 hover:border-blue-200"
                )}
              >
                <div className={cn(
                  "w-10 h-10 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center font-black text-base sm:text-lg transition-all duration-500 shrink-0",
                  selectedLeadIndex === idx 
                    ? "bg-blue-600 text-white rotate-3 scale-110 shadow-lg shadow-blue-200" 
                    : "bg-slate-50 text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-600 group-hover:rotate-6"
                )}>
                  {lead.name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-black text-slate-800 truncate tracking-tight text-sm sm:text-base">{lead.name}</p>
                  <div className="flex flex-wrap items-center gap-2 mt-0.5">
                    <Phone size={10} className="text-slate-300" />
                    <p className="text-[10px] text-slate-400 font-bold tracking-tight">
                      {lead.phone}
                    </p>
                    <a
                      href={getWhatsAppUrl(lead.phone)}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(event) => event.stopPropagation()}
                      className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[8px] font-black uppercase tracking-widest text-emerald-700 hover:bg-emerald-100"
                      title="Chat on WhatsApp"
                    >
                      WA
                    </a>
                  </div>
                  {lead.lastInteractionAt && (
                    <div className="flex items-center gap-1 mt-1">
                      <History size={10} className="text-blue-400" />
                      <p className="text-[9px] text-blue-500 font-black uppercase tracking-tighter">
                        Last: {formatDateValue(lead.lastInteractionAt, 'MMM dd, HH:mm')}
                      </p>
                    </div>
                  )}
                  {lead.nextFollowupAt && (
                    <div className="flex items-center gap-1 mt-1">
                      <Clock size={10} className="text-indigo-400" />
                      <p className="text-[9px] text-indigo-500 font-black uppercase tracking-tighter">
                        Next: {formatDateValue(lead.nextFollowupAt, 'MMM dd')}
                      </p>
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  {effectiveQueueTab === 'overdue' && (
                    <span className="px-2 py-1 rounded-lg bg-rose-50 text-rose-600 text-[9px] font-black uppercase tracking-wider whitespace-nowrap">
                      {(() => {
                        const nextDateValue = toDateValue(lead.nextFollowupAt);
                        if (!nextDateValue) return 'No date';
                        const delayDays = Math.max(1, Math.floor((startOfDay(new Date()).getTime() - startOfDay(nextDateValue).getTime()) / (24 * 60 * 60 * 1000)));
                        return `${delayDays}d overdue`;
                      })()}
                    </span>
                  )}
                  {effectiveQueueTab === 'today' && (
                    <span className={cn(
                      "px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider whitespace-nowrap",
                      toDateValue(lead.createdAt) && isToday(toDateValue(lead.createdAt) as Date)
                        ? "bg-emerald-50 text-emerald-600"
                        : "bg-indigo-50 text-indigo-600"
                    )}>
                      {toDateValue(lead.createdAt) && isToday(toDateValue(lead.createdAt) as Date) ? 'New' : 'Today'}
                    </span>
                  )}
                  {effectiveQueueTab === 'upcoming' && lead.nextFollowupAt && (
                    <span className="px-2 py-1 rounded-lg bg-indigo-50 text-indigo-600 text-[9px] font-black uppercase tracking-wider whitespace-nowrap">
                      {formatDateValue(lead.nextFollowupAt, 'dd MMM')}
                    </span>
                  )}
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center transition-all",
                    selectedLeadIndex === idx ? "bg-blue-100 text-blue-600" : "bg-slate-50 text-slate-300 group-hover:bg-blue-50 group-hover:text-blue-400"
                  )}>
                    <ChevronRight size={16} className={cn("transition-transform", selectedLeadIndex === idx && "translate-x-0.5")} />
                  </div>
                </div>
              </motion.button>
            ))}
            {filteredLeads.length === 0 && (
              <div className="text-center py-20 bg-white/50 rounded-[48px] border-4 border-dashed border-slate-100">
                <div className="w-20 h-20 bg-slate-50 text-slate-200 rounded-full flex items-center justify-center mx-auto mb-4">
                  <ClipboardList size={40} />
                </div>
                <p className="text-slate-400 font-black text-xs uppercase tracking-[0.2em]">Queue is Clear</p>
              </div>
            )}
          </div>
        </div>

        {/* Lead Detail / Focused View */}
        <div className="flex-1">
          <AnimatePresence mode="wait">
            {currentLead ? (
              <motion.div
                key={currentLead.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="bg-white rounded-3xl border border-gray-100 shadow-xl overflow-hidden flex flex-col"
              >
                {/* Enhanced Detail View */}
                <div className="p-4 sm:p-8 md:p-10 bg-slate-50/50 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4 sm:gap-6">
                  <div className="flex items-start sm:items-center gap-4 sm:gap-6 min-w-0">
                    <div className="w-14 h-14 sm:w-20 sm:h-20 rounded-2xl sm:rounded-[32px] bg-blue-600 flex items-center justify-center text-white text-2xl sm:text-3xl font-black shadow-2xl shadow-blue-200 ring-4 sm:ring-8 ring-blue-50 shrink-0">
                      {currentLead.name[0]}
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight break-words leading-tight">{currentLead.name}</h2>
                      <div className="flex flex-wrap items-center gap-2 sm:gap-4 mt-2">
                        <a href={`tel:${currentLead.phone}`} className="bg-white px-3 py-1.5 rounded-full shadow-sm border border-slate-100 text-blue-600 font-black text-[10px] sm:text-[11px] uppercase tracking-widest hover:bg-blue-50 transition-all flex items-center gap-2">
                          <Phone size={12} /> {currentLead.phone}
                        </a>
                        <a
                          href={getWhatsAppUrl(currentLead.phone)}
                          target="_blank"
                          rel="noreferrer"
                          className="bg-emerald-50 px-3 py-1.5 rounded-full shadow-sm border border-emerald-100 text-emerald-700 font-black text-[10px] sm:text-[11px] uppercase tracking-widest hover:bg-emerald-100 transition-all flex items-center gap-2"
                          title="Chat on WhatsApp"
                        >
                          <MessageSquare size={12} /> WhatsApp
                        </a>
                        <div className="flex items-center gap-2 text-slate-400 font-bold text-[9px] sm:text-[10px] uppercase tracking-widest">
                          <Clock size={12} /> Added {formatDateValue(currentLead.createdAt, 'MMM dd', 'Unknown')}
                        </div>
                        {currentLead.lastInteractionAt && (
                          <div className="flex items-center gap-2 text-blue-500 font-black text-[9px] sm:text-[10px] uppercase tracking-widest bg-blue-50 px-3 py-1 rounded-full border border-blue-100">
                            <History size={12} /> Last Follow-up: {formatDateValue(currentLead.lastInteractionAt, 'MMM dd, hh:mm a', 'N/A')}
                          </div>
                        )}
                        <div className="bg-slate-900 text-white px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-[0.2em]">
                          {currentLead.source}
                        </div>
                        {currentLead.addedByName && (
                          <div className="bg-blue-50 text-blue-600 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-[0.2em] border border-blue-100">
                            Added By: {currentLead.addedByName}
                          </div>
                        )}
                        {!canManageCurrentLead && (
                          <div className="bg-amber-50 text-amber-600 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-[0.2em] border border-amber-100">
                            View Only
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap md:flex-nowrap gap-2 sm:gap-3 w-full md:w-auto">
                    <button
                      onClick={() => setShowTransferModal(true)}
                      disabled={!canManageCurrentLead}
                      className="flex-1 md:flex-none px-4 sm:px-5 py-2.5 bg-white border border-slate-200 rounded-2xl text-orange-600 hover:bg-orange-50 transition-all shadow-sm flex items-center justify-center gap-2 font-black text-[10px] sm:text-[11px] uppercase tracking-widest disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <ArrowLeftRight size={16} /> Transfer
                    </button>
                    <button
                      onClick={() => setShowHistory(prev => !prev)}
                      className={cn(
                        "flex-1 md:flex-none px-4 sm:px-5 py-2.5 border rounded-2xl transition-all shadow-sm flex items-center justify-center gap-2 font-black text-[10px] sm:text-[11px] uppercase tracking-widest",
                        showHistory
                          ? "bg-blue-50 border-blue-200 text-blue-700"
                          : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                      )}
                    >
                      <History size={16} /> History
                    </button>
                    <button 
                      onClick={() => {
                        const nextIdx = filteredLeads.indexOf(currentLead) + 1;
                        if (nextIdx < filteredLeads.length) setSelectedLeadIndex(nextIdx);
                        else setSelectedLeadIndex(null);
                      }}
                      className="flex-1 md:flex-none px-4 sm:px-5 py-2.5 bg-blue-600 text-white rounded-2xl shadow-xl shadow-blue-100 hover:bg-blue-700 transition-all flex items-center justify-center gap-2 font-black text-[10px] sm:text-[11px] uppercase tracking-widest"
                    >
                      Next <ChevronRight size={16} />
                    </button>
                  </div>
                </div>

                <div className="flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-slate-100">
                  {/* Action Panel */}
                  <div className="flex-1 p-8 md:p-10 space-y-10">
                    {!canManageCurrentLead && (
                      <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl">
                        <p className="text-xs font-black text-amber-600 uppercase tracking-widest">View Only Lead</p>
                        <p className="text-sm font-medium text-amber-700 mt-1">
                          This lead is no longer assigned to you. You can view it because you added it.
                        </p>
                      </div>
                    )}
                    <div className="space-y-6">
                      <div className="flex items-center justify-between">
                        <h4 className="font-black text-slate-900 flex items-center gap-2 uppercase text-xs tracking-[0.2em]">
                          <MessageSquare className="text-blue-500" size={18} /> Record Interaction
                        </h4>
                        <span className={cn(
                          "text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest transition-colors",
                          remark.length === 0 ? "bg-slate-100 text-slate-400" : 
                          remark.length > 400 ? "bg-rose-100 text-rose-600" : "bg-blue-50 text-blue-600"
                        )}>
                          {remark.length} / 400
                        </span>
                      </div>
                      <div className="relative group">
                        <textarea
                          placeholder="Log call details, client requirements, or specific notes..."
                          required
                          maxLength={400}
                          value={remark}
                          onChange={e => setRemark(e.target.value)}
                          className="w-full h-44 px-6 py-5 bg-slate-50 border border-slate-200 rounded-[32px] focus:ring-4 focus:ring-blue-100 focus:bg-white focus:border-blue-300 outline-none transition-all resize-none font-medium text-slate-600 leading-relaxed shadow-inner"
                        />
                        {remark.length > 0 && (
                          <button 
                            onClick={() => setRemark('')}
                            className="absolute top-4 right-4 text-slate-300 hover:text-slate-500"
                          >
                            <XSquare size={20} />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Next Followup Date</label>
                        <input
                          type="date"
                          value={nextDate}
                          onChange={e => setNextDate(e.target.value)}
                          className="w-full px-6 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-blue-100 outline-none font-bold text-slate-700"
                        />
                      </div>
                      <div className="flex items-end gap-2">
                        <button 
                          onClick={() => handleUpdateLead(selectedStatus || currentLead.status)}
                          disabled={!canManageCurrentLead || loading || !remark.trim() || !nextDate}
                          className="flex-1 h-[56px] bg-blue-600 text-white font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-blue-700 shadow-2xl shadow-blue-200 disabled:opacity-30 disabled:grayscale transition-all active:scale-95"
                        >
                          Save & Schedule
                        </button>
                      </div>
                    </div>

                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => setSelectedStatus('interested')}
                          disabled={!canManageCurrentLead || loading || !remark.trim()}
                          className={cn(
                            "flex-1 py-3 font-black text-[10px] uppercase tracking-[0.2em] rounded-xl transition-colors disabled:opacity-30",
                            selectedStatus === 'interested'
                              ? "bg-green-600 text-white shadow-md shadow-green-200"
                              : "bg-green-50 text-green-600 hover:bg-green-100"
                          )}
                        >
                          Interested
                        </button>
                        <button 
                          onClick={() => handleUpdateLead('not_interested')}
                          disabled={!canManageCurrentLead || loading || !remark.trim()}
                          className="flex-1 py-3 bg-rose-50 text-rose-600 font-black text-[10px] uppercase tracking-[0.2em] rounded-xl hover:bg-rose-100 transition-colors disabled:opacity-30"
                        >
                          Not Interested
                        </button>
                      </div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        Choose <span className="text-green-600">Interested</span>, then tap <span className="text-blue-600">Save &amp; Schedule</span> to submit.
                      </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-slate-100">
                      <button 
                        onClick={startCamera}
                        disabled={!canManageCurrentLead}
                        className="p-6 border-2 border-dashed border-slate-200 rounded-[32px] flex flex-col items-center justify-center gap-3 text-blue-600 hover:bg-blue-50 transition-all hover:border-blue-300 group disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <Camera className="w-8 h-8 group-hover:scale-110 transition-transform text-blue-500" />
                        <span className="font-black text-xs uppercase tracking-widest">Real-time Site Visit</span>
                      </button>
                      <button 
                        onClick={() => handleUpdateLead('deal_pending')}
                        disabled={!canManageCurrentLead}
                        className="p-6 bg-slate-900 border border-slate-800 rounded-[32px] flex flex-col items-center justify-center gap-3 text-white hover:bg-black shadow-2xl shadow-slate-200 transition-all active:scale-95 group disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <ShieldCheck className="w-8 h-8 group-hover:scale-110 transition-transform text-indigo-400" />
                        <span className="font-black text-xs uppercase tracking-widest">Submit for Review</span>
                      </button>
                    </div>

                    <div className="space-y-4 p-6 bg-indigo-50/40 rounded-[32px] border border-indigo-100">
                      <h4 className="font-black text-slate-900 flex items-center gap-2 uppercase text-xs tracking-[0.2em]">
                        <FileText className="text-indigo-500" size={18} /> KYC Documents
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {([
                          { key: 'aadhaar' as const, label: 'Aadhaar Card', existingUrl: currentLead.kycAadhaarUrl, existingName: currentLead.kycAadhaarName },
                          { key: 'pan' as const, label: 'PAN Card', existingUrl: currentLead.kycPanUrl, existingName: currentLead.kycPanName },
                        ]).map((docItem) => {
                          const selectedFile = kycFiles[docItem.key];
                          return (
                            <label key={docItem.key} className="block rounded-2xl border-2 border-dashed border-indigo-200 bg-white p-4 cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition-all">
                              <span className="block text-[10px] font-black text-indigo-600 uppercase tracking-widest">
                                {docItem.label} <span className="text-rose-500">*</span>
                              </span>
                              <span className="mt-2 block text-xs font-bold text-slate-600 truncate">
                                {selectedFile?.name || docItem.existingName || (docItem.existingUrl ? 'Uploaded document' : 'Upload image or PDF')}
                              </span>
                              {docItem.existingUrl && !selectedFile && (
                                <a
                                  href={docItem.existingUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={(event) => event.stopPropagation()}
                                  className="mt-2 inline-flex text-[10px] font-black uppercase tracking-widest text-blue-600 hover:underline"
                                >
                                  View Current
                                </a>
                              )}
                              <input
                                type="file"
                                accept="image/*,.pdf"
                                className="hidden"
                                onChange={(event) => {
                                  const file = event.target.files?.[0] || null;
                                  setKycFiles((prev) => ({ ...prev, [docItem.key]: file }));
                                }}
                              />
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    {currentLead.siteVisitPhoto && (
                      <div className="space-y-4 p-6 bg-violet-50/40 rounded-[32px] border border-violet-100">
                        <h4 className="font-black text-slate-900 flex items-center gap-2 uppercase text-xs tracking-[0.2em]">
                          <MapPin className="text-violet-500" size={18} /> Site Visit Evidence
                        </h4>
                        <a
                          href={currentLead.siteVisitPhoto}
                          target="_blank"
                          rel="noreferrer"
                          className="block rounded-2xl overflow-hidden border border-violet-100 bg-white shadow-sm"
                          title="Open full image"
                        >
                          <img
                            src={currentLead.siteVisitPhoto}
                            alt="Site visit capture"
                            className="w-full h-52 object-cover"
                            referrerPolicy="no-referrer"
                          />
                        </a>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="p-3 bg-white rounded-xl border border-violet-100">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Captured At</p>
                            <p className="text-sm font-bold text-slate-800">
                              {currentLead.siteVisitAt ? formatDateValue(currentLead.siteVisitAt, 'MMM dd, yyyy hh:mm a', 'Not available') : 'Not available'}
                            </p>
                          </div>
                          <div className="p-3 bg-white rounded-xl border border-violet-100">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">GPS Coordinates</p>
                            <p className="text-sm font-bold text-slate-800 break-all">
                              {currentLead.siteVisitLocation
                                ? `${currentLead.siteVisitLocation.latitude.toFixed(6)}, ${currentLead.siteVisitLocation.longitude.toFixed(6)}`
                                : 'Not available'}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Sidebar Info/History */}
                  {showHistory && (
                    <div className="hidden md:block w-full md:w-80 bg-gray-50/50 p-6 md:p-8">
                      <h4 className="font-bold text-gray-900 mb-6 flex items-center gap-2">
                        <History size={20} className="text-gray-400" /> Timeline
                      </h4>
                      <div className="relative space-y-6 before:absolute before:left-3 before:top-2 before:bottom-2 before:w-0.5 before:bg-gray-200">
                        {followups.map(f => (
                          <div key={f.id} className="relative pl-8">
                            <div className="absolute left-1.5 top-1.5 w-3 h-3 rounded-full bg-blue-500 border-4 border-white shadow-sm" />
                            <p className="text-xs font-bold text-gray-400 mb-1">{formatDateValue(f.date, 'MMM dd, hh:mm a')}</p>
                            <p className="text-sm text-gray-700 leading-relaxed font-medium bg-white p-3 rounded-xl border border-gray-100 shadow-sm">{f.remark}</p>
                          </div>
                        ))}
                        {followups.length === 0 && (
                          <p className="text-center py-12 text-gray-400 text-sm italic">New lead. No interaction yet.</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            ) : (
              <div className="flex-1 bg-white rounded-3xl border border-dashed border-gray-200 py-16 sm:py-32 flex flex-col items-center justify-center text-center px-6 sm:px-8">
                <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center text-blue-600 mb-4 animate-pulse">
                  <UserIcon size={40} />
                </div>
                <h3 className="text-xl font-bold text-gray-900">Wait for next lead...</h3>
                <p className="text-gray-500 mt-2 max-w-xs">Select a client from the queue to start follow-up process.</p>
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>
    )}

      <AnimatePresence>
        {showHistory && currentLead && (
          <div className="fixed inset-0 z-[132] bg-black/60 backdrop-blur-sm md:hidden flex items-end">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 24 }}
              className="w-full max-h-[78vh] bg-white rounded-t-[28px] shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="p-5 border-b border-gray-100 flex items-center justify-between">
                <h4 className="font-bold text-gray-900 flex items-center gap-2">
                  <History size={18} className="text-gray-400" /> Timeline
                </h4>
                <button
                  onClick={() => setShowHistory(false)}
                  className="p-2 hover:bg-gray-100 rounded-full text-gray-500"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="overflow-y-auto p-5 space-y-5">
                <div className="relative space-y-5 before:absolute before:left-3 before:top-2 before:bottom-2 before:w-0.5 before:bg-gray-200">
                  {followups.map(f => (
                    <div key={f.id} className="relative pl-8">
                      <div className="absolute left-1.5 top-1.5 w-3 h-3 rounded-full bg-blue-500 border-4 border-white shadow-sm" />
                      <p className="text-xs font-bold text-gray-400 mb-1">{formatDateValue(f.date, 'MMM dd, hh:mm a')}</p>
                      <p className="text-sm text-gray-700 leading-relaxed font-medium bg-white p-3 rounded-xl border border-gray-100 shadow-sm">{f.remark}</p>
                    </div>
                  ))}
                  {followups.length === 0 && (
                    <p className="text-center py-12 text-gray-400 text-sm italic">New lead. No interaction yet.</p>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Site Visit Workflows */}
      <AnimatePresence>
        {selectedAssignedLead && (
          <div className="fixed inset-0 z-[132] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 16 }}
              className="w-full max-w-3xl bg-white rounded-[28px] shadow-2xl overflow-hidden max-h-[92vh] flex flex-col"
            >
              <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-black text-slate-900">{selectedAssignedLead.name}</h3>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <p className="text-xs font-bold text-slate-500">{selectedAssignedLead.phone}</p>
                    <a
                      href={getWhatsAppUrl(selectedAssignedLead.phone)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-emerald-700 hover:bg-emerald-100"
                      title="Chat on WhatsApp"
                    >
                      <MessageSquare size={10} /> WhatsApp
                    </a>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedAssignedLead(null)}
                  className="p-2 rounded-full hover:bg-slate-100 text-slate-500"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="p-5 overflow-y-auto space-y-5">
                <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_220px_auto] sm:items-end">
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-widest text-blue-500 mb-1">Lead Name</label>
                      <input
                        type="text"
                        value={assignedLeadEditName}
                        onChange={(event) => setAssignedLeadEditName(event.target.value)}
                        className="w-full rounded-xl border border-blue-100 bg-white px-3 py-2.5 text-sm font-bold text-slate-800 outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-widest text-blue-500 mb-1">Status</label>
                      <select
                        value={assignedLeadEditStatus}
                        onChange={(event) => setAssignedLeadEditStatus(event.target.value as Lead['status'])}
                        className="w-full rounded-xl border border-blue-100 bg-white px-3 py-2.5 text-sm font-bold text-slate-800 outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                      >
                        <option value="pending">Pending</option>
                        <option value="interested">Interested</option>
                        <option value="not_interested">Not Interested</option>
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={handleUpdateAssignedLeadDetails}
                      disabled={loading || selectedAssignedLead.assignedTo !== user.uid}
                      className="rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-blue-100 hover:bg-blue-700 disabled:opacity-50"
                    >
                      {loading ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Source</p>
                    <p className="mt-1 text-sm font-bold text-slate-800">{selectedAssignedLead.source || '-'}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Status</p>
                    <p className="mt-1 text-sm font-bold text-slate-800 uppercase">{(selectedAssignedLead.status || 'pending').replace('_', ' ')}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Created</p>
                    <p className="mt-1 text-sm font-bold text-slate-800">{formatDateValue(selectedAssignedLead.createdAt, 'MMM dd, yyyy hh:mm a', 'N/A')}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Last Follow-up</p>
                    <p className="mt-1 text-sm font-bold text-slate-800">{formatDateValue(selectedAssignedLead.lastInteractionAt, 'MMM dd, yyyy hh:mm a', 'N/A')}</p>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-100 bg-white p-4">
                  <h4 className="font-black text-slate-900 text-xs uppercase tracking-widest flex items-center gap-2">
                    <History size={14} className="text-slate-500" /> Interaction Timeline
                  </h4>
                  <div className="mt-4 relative space-y-4 before:absolute before:left-2.5 before:top-1 before:bottom-1 before:w-0.5 before:bg-slate-200">
                    {selectedAssignedLeadFollowups.map((f) => (
                      <div key={f.id} className="relative pl-7">
                        <div className="absolute left-0.5 top-1.5 w-2.5 h-2.5 rounded-full bg-blue-500 border-2 border-white shadow-sm" />
                        <p className="text-[11px] font-black text-slate-400">{formatDateValue(f.date, 'MMM dd, hh:mm a')}</p>
                        <p className="mt-1 text-sm font-medium text-slate-700 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2">{f.remark}</p>
                      </div>
                    ))}
                    {selectedAssignedLeadFollowups.length === 0 && (
                      <p className="text-sm text-slate-400 italic py-4">No follow-up activity yet.</p>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showTransferModal && (
          <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-white rounded-[32px] overflow-hidden shadow-2xl flex flex-col"
            >
              <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                <h3 className="text-xl font-bold text-gray-900">Transfer Lead</h3>
                <button onClick={() => setShowTransferModal(false)} className="p-2 hover:bg-gray-100 rounded-full text-gray-400">
                  <XSquare size={20} />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search executive by name..."
                    value={transferSearch}
                    onChange={e => setTransferSearch(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none transition-all h-12 text-sm"
                  />
                </div>
                <div className="max-h-64 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                  {employees
                    .filter(emp => emp.uid !== user.uid && emp.name.toLowerCase().includes(transferSearch.toLowerCase()))
                    .map(emp => (
                      <button
                        key={emp.uid}
                        onClick={() => handleTransfer(emp)}
                        className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-blue-50 hover:border-blue-200 border border-transparent rounded-2xl transition-all group"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center font-bold">
                            {emp.name[0]}
                          </div>
                          <div className="text-left">
                            <p className="font-bold text-gray-900">{emp.name}</p>
                            <p className="text-[10px] text-gray-500 font-bold uppercase">{emp.phone}</p>
                          </div>
                        </div>
                        <ArrowLeftRight size={18} className="text-gray-300 group-hover:text-blue-500 transition-colors" />
                      </button>
                    ))}
                  {employees.length <= 1 && (
                    <div className="text-center py-8 text-gray-400 font-medium">No other executives found.</div>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {visitStep !== 'idle' && (
          <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-xl flex flex-col items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="w-full max-w-lg bg-white rounded-[40px] overflow-hidden shadow-2xl flex flex-col max-h-[92dvh]"
            >
              {/* Camera Step */}
              {visitStep === 'capture' && (
                <div className="relative aspect-square bg-gray-900">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    className={cn("w-full h-full object-cover", cameraFacingMode === 'user' && "scale-x-[-1]")}
                  />
                  <div className="absolute inset-x-0 bottom-8 flex justify-center gap-8 items-center">
                    <button 
                      onClick={() => { setVisitStep('idle'); stopCameraStream(); }}
                      className="w-14 h-14 rounded-full bg-white/20 text-white flex items-center justify-center hover:bg-white/30 backdrop-blur-md"
                    >
                      <XSquare size={28} />
                    </button>
                    <button onClick={capturePhoto} className="w-24 h-24 rounded-full border-8 border-white/20 bg-white shadow-xl flex items-center justify-center group active:scale-95 transition-all">
                      <div className="w-16 h-16 rounded-full bg-red-600 group-hover:bg-red-500" />
                    </button>
                    <button
                      onClick={() => startCamera(cameraFacingMode === 'environment' ? 'user' : 'environment')}
                      className="w-14 h-14 rounded-full bg-white/20 text-white flex items-center justify-center hover:bg-white/30 backdrop-blur-md text-[10px] font-black uppercase"
                      title="Switch camera"
                    >
                      Flip
                    </button>
                  </div>
                  <div className="absolute top-6 left-6 right-6">
                    <div className="bg-black/40 backdrop-blur-md px-4 py-2 rounded-full inline-flex items-center gap-2">
                       <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                       <span className="text-[10px] font-black text-white uppercase tracking-[0.2em]">Live Camera</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Confirm / Preview Step */}
              {(visitStep === 'confirm' || visitStep === 'verifying' || visitStep === 'verified') && (
                <div className="flex flex-col overflow-y-auto">
                  <div className="relative aspect-video bg-gray-100">
                    {capturedImage && <img src={capturedImage} className="w-full h-full object-cover" />}
                    <div className="absolute top-4 right-4">
                       <button 
                        onClick={() => { setVisitStep('idle'); setCapturedImage(null); setLocation(null); }}
                        className="w-10 h-10 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 backdrop-blur-sm"
                       >
                         <XSquare size={20} />
                       </button>
                    </div>
                  </div>

                  <div className="p-8 space-y-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-2xl font-bold text-gray-900">Confirm Photo</h3>
                        <p className="text-gray-500 text-sm font-medium">Verify your photo before checking location.</p>
                      </div>
                      <div className={cn(
                        "w-12 h-12 rounded-2xl flex items-center justify-center",
                        visitStep === 'verified' ? "bg-green-100 text-green-600" : "bg-blue-100 text-blue-600"
                      )}>
                        {visitStep === 'verified' ? <CheckCircle2 size={24} /> : <MapPin size={24} />}
                      </div>
                    </div>

                    <div className="space-y-3">
                      {visitStep === 'confirm' && (
                        <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 flex items-center gap-4 animate-in fade-in slide-in-from-bottom-2">
                          <div className="w-10 h-10 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center">
                            <Clock size={20} />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-gray-400 uppercase">GPS Check Required</p>
                            <p className="text-sm font-bold text-gray-700">Waiting for location verification...</p>
                          </div>
                        </div>
                      )}

                      {visitStep === 'verifying' && (
                        <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100 flex items-center gap-4 animate-pulse">
                          <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
                          <div>
                            <p className="text-xs font-bold text-blue-400 uppercase">Verifying GPS</p>
                            <p className="text-sm font-bold text-blue-700">Acquiring high-accuracy coordinates...</p>
                          </div>
                        </div>
                      )}

                      {visitStep === 'verified' && (
                        <div className="p-4 bg-green-50 rounded-2xl border border-green-100 flex items-center gap-4 animate-in zoom-in-95 duration-300">
                          <div className="w-10 h-10 rounded-xl bg-green-500 text-white flex items-center justify-center shadow-lg shadow-green-100">
                            <CheckCircle2 size={20} />
                          </div>
                          <div className="flex-1">
                            <p className="text-xs font-bold text-green-500 uppercase">GPS Verified</p>
                            <p className="text-sm font-bold text-green-700">Location and photo verified successfully.</p>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3 pt-2">
                       <button 
                        onClick={() => { setCapturedImage(null); startCamera(); }}
                        disabled={visitStep === 'verifying' || loading}
                        className="w-full sm:flex-1 py-4 font-bold text-gray-500 hover:bg-gray-100 rounded-2xl transition-colors border border-gray-100 disabled:opacity-50"
                       >
                         Retake Photo
                       </button>

                       {visitStep === 'confirm' && (
                         <button 
                          onClick={handleVerifyLocation}
                          className="w-full sm:flex-[1.5] py-4 bg-blue-600 text-white font-bold rounded-2xl shadow-xl shadow-blue-100 active:scale-95 transition-all text-sm uppercase tracking-wider"
                         >
                           Verify GPS & Proceed
                         </button>
                       )}

                       {visitStep === 'verifying' && (
                         <button 
                          disabled
                          className="w-full sm:flex-[1.5] py-4 bg-blue-400 text-white font-bold rounded-2xl shadow-xl shadow-blue-100 transition-all text-sm uppercase tracking-wider flex items-center justify-center gap-2"
                         >
                           <Loader2 size={18} className="animate-spin" /> Verifying...
                         </button>
                       )}

                       {visitStep === 'verified' && (
                         <button 
                          onClick={handleSiteVisit}
                          disabled={loading}
                          className="w-full sm:flex-[1.5] py-4 bg-green-600 text-white font-bold rounded-2xl shadow-xl shadow-green-100 active:scale-95 transition-all text-sm uppercase tracking-wider flex items-center justify-center gap-2"
                         >
                           {loading ? <Loader2 size={18} className="animate-spin" /> : 'Finalize Visit'}
                         </button>
                       )}
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}

        {showNotifications && (
          <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-white rounded-[32px] overflow-hidden shadow-2xl flex flex-col"
            >
              <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
                    <Bell size={20} />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900">Notifications</h3>
                </div>
                <button onClick={() => setShowNotifications(false)} className="p-2 hover:bg-gray-100 rounded-full text-gray-400">
                  <XCircle size={20} />
                </button>
              </div>
              <div className="max-h-[60vh] overflow-y-auto p-4 space-y-3 custom-scrollbar">
                {notifications.length === 0 ? (
                  <div className="py-12 text-center">
                    <div className="w-16 h-16 bg-gray-50 text-gray-300 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Bell size={32} />
                    </div>
                    <p className="text-gray-500 font-medium font-mono text-sm uppercase tracking-widest">No notifications yet</p>
                  </div>
                ) : (
                  notifications.map(notif => (
                    <div 
                      key={notif.id}
                      onClick={() => markNotificationAsRead(notif.id, notif.leadId)}
                      className={cn(
                        "p-5 rounded-2xl border transition-all cursor-pointer relative group",
                        notif.read ? "bg-white border-gray-100 opacity-70" : "bg-blue-50 border-blue-200 shadow-sm"
                      )}
                    >
                      {!notif.read && <div className="absolute top-5 right-5 w-2.5 h-2.5 bg-blue-600 rounded-full ring-4 ring-blue-100" />}
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                          <span className={cn(
                            "w-2 h-2 rounded-full",
                            notif.title.includes('New') ? "bg-green-500" : "bg-orange-500"
                          )} />
                          {notif.title}
                        </h4>
                        <span className="text-[10px] text-gray-400 font-bold uppercase tracking-tight">
                          {formatDateValue(notif.createdAt, 'p')}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 leading-relaxed pr-6">{notif.message}</p>
                      
                      <div className="mt-4 pt-4 border-t border-gray-100 flex justify-between items-center group-hover:opacity-100 transition-opacity">
                         <div className="flex items-center gap-2 text-[10px] text-blue-600 font-black uppercase tracking-widest">
                            <Send size={12} /> Click to View Lead
                         </div>
                         <button 
                          onClick={(e) => { e.stopPropagation(); deleteNotification(notif.id); }}
                          className="text-gray-300 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 transition-all"
                         >
                            <Trash2 size={16} />
                         </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
              {notifications.length > 0 && (
                <div className="p-4 bg-gray-50/50 border-t border-gray-100">
                  <button 
                    onClick={() => setShowNotifications(false)}
                    className="w-full py-3 bg-white border border-gray-200 text-gray-600 font-bold rounded-xl text-sm transition-all hover:bg-gray-100"
                  >
                    Close Panel
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}

        {showAddLead && (
          <div className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl max-h-[92vh] overflow-y-auto"
            >
              <h3 className="text-2xl font-bold mb-7 text-gray-900">Add New Lead</h3>
              <form onSubmit={handleAddLead} className="space-y-5">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Customer Name <span className="text-rose-500">*</span></label>
                  <input
                    required
                    value={leadForm.name}
                    onChange={e => setLeadForm({ ...leadForm, name: e.target.value })}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="Enter name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Mobile Number <span className="text-rose-500">*</span></label>
                  <input
                    required
                    type="tel"
                    inputMode="numeric"
                    pattern="[0-9]{10}"
                    maxLength={10}
                    value={leadForm.phone}
                    onChange={e => setLeadForm({ ...leadForm, phone: normalizePhone(e.target.value).slice(0, 10) })}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="10-digit mobile"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Source <span className="text-rose-500">*</span></label>
                  <input
                    value={leadForm.source}
                    disabled
                    className="w-full px-4 py-3 bg-gray-100 border border-gray-200 rounded-xl text-gray-500 cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Allocation Mode</label>
                  <div className="grid grid-cols-2 gap-2 p-1 bg-gray-100 rounded-xl">
                    <div className="py-2 text-sm font-bold rounded-lg bg-white text-blue-600 shadow-sm text-center">
                      Automatic
                    </div>
                    <div className="py-2 text-sm font-bold rounded-lg text-gray-400 text-center">
                      Self
                    </div>
                  </div>
                </div>
                <div className="flex gap-3 pt-6 mt-2 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => setShowAddLead(false)}
                    className="flex-1 py-3.5 font-bold text-gray-500 hover:bg-gray-100 rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 py-3.5 bg-blue-600 text-white font-bold rounded-xl shadow-lg shadow-blue-200 active:scale-95 transition-all disabled:opacity-50"
                  >
                    {loading ? 'Adding...' : 'Allocate Lead'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {showReqModal && (
          <div className="fixed inset-0 z-[110] bg-black/70 backdrop-blur-md flex items-end sm:items-center justify-center p-2 sm:p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="w-full max-w-xl bg-white rounded-[28px] sm:rounded-[48px] overflow-hidden shadow-2xl flex flex-col max-h-[92dvh] sm:max-h-[90vh]"
            >
              <form onSubmit={handleSaveRequirement} className="flex h-full min-h-0 flex-col">
                <div className="shrink-0 p-5 sm:p-10 border-b border-slate-100 bg-blue-50/50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-11 h-11 sm:w-14 sm:h-14 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-xl shadow-blue-100">
                        <PlusCircle size={22} className="sm:hidden" />
                        <PlusCircle size={32} className="hidden sm:block" />
                      </div>
                      <div>
                        <h3 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">{editingRequirementId ? 'Edit Requirement' : 'Add Requirement'}</h3>
                        <p className="text-slate-400 font-bold text-[10px] sm:text-xs uppercase tracking-widest mt-1">Log a new client inquiry</p>
                      </div>
                    </div>
                    <button type="button" onClick={() => setShowReqModal(false)} className="w-9 h-9 sm:w-12 sm:h-12 rounded-full bg-white border border-slate-200 text-slate-400 hover:text-rose-500 hover:border-rose-200 transition-all flex items-center justify-center shadow-sm shrink-0">
                      <X size={16} className="sm:hidden" />
                      <X size={22} className="hidden sm:block" />
                    </button>
                  </div>
                </div>

                <div className="flex-1 min-h-0 p-5 sm:p-10 space-y-5 sm:space-y-6 overflow-y-auto custom-scrollbar">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                    <div className="space-y-2">
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Client Name <span className="text-rose-500">*</span></label>
                      <input 
                        required
                        value={reqForm.name}
                        onChange={e => setReqForm({...reqForm, name: e.target.value})}
                        className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-3xl focus:ring-4 focus:ring-blue-100 outline-none font-bold text-slate-700"
                        placeholder="Enter client name"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Phone Number <span className="text-rose-500">*</span></label>
                      <input 
                        required
                        type="tel"
                        inputMode="numeric"
                        pattern="[0-9]{10}"
                        maxLength={10}
                        value={reqForm.phone}
                        onChange={e => setReqForm({...reqForm, phone: e.target.value.replace(/\D/g, '').slice(0, 10)})}
                        className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-3xl focus:ring-4 focus:ring-blue-100 outline-none font-bold text-slate-700"
                        placeholder="10-digit mobile number"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Requirement Type <span className="text-rose-500">*</span></label>
                      <select 
                        required
                        value={reqForm.type}
                        onChange={e => setReqForm({...reqForm, type: e.target.value})}
                        className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-3xl focus:ring-4 focus:ring-blue-100 outline-none font-bold text-slate-700"
                      >
                        <option value="zeemen">Zeemen</option>
                        <option value="plot">Plot</option>
                        <option value="house">House</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Budget</label>
                      <input 
                        value={reqForm.budget}
                        onChange={e => setReqForm({...reqForm, budget: e.target.value})}
                        className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-3xl focus:ring-4 focus:ring-blue-100 outline-none font-bold text-slate-700"
                        placeholder="Enter budget"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Area</label>
                      <input 
                        value={reqForm.area}
                        onChange={e => setReqForm({...reqForm, area: e.target.value})}
                        className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-3xl focus:ring-4 focus:ring-blue-100 outline-none font-bold text-slate-700"
                        placeholder="Enter area"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Location</label>
                      <input 
                        value={reqForm.location}
                        onChange={e => setReqForm({...reqForm, location: e.target.value})}
                        className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-3xl focus:ring-4 focus:ring-blue-100 outline-none font-bold text-slate-700"
                        placeholder="Preferred location"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
                    <div className="space-y-2">
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">State</label>
                      <select value={reqForm.brokerState} onChange={e => setReqForm({ ...reqForm, brokerState: e.target.value, brokerCity: '' })} className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-3xl font-bold text-slate-700">
                        <option value="">Select State</option>
                        {Object.keys(LOCATION_MAP).map((state) => <option key={state} value={state}>{state}</option>)}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">City</label>
                      <select value={reqForm.brokerCity} onChange={e => setReqForm({ ...reqForm, brokerCity: e.target.value })} className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-3xl font-bold text-slate-700">
                        <option value="">Select City</option>
                        {(LOCATION_MAP[reqForm.brokerState] || []).map((city) => <option key={city} value={city}>{city}</option>)}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Locality</label>
                      <input value={reqForm.brokerLocality} onChange={e => setReqForm({ ...reqForm, brokerLocality: e.target.value })} className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-3xl font-bold text-slate-700" placeholder="Area / Locality" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Specialization (Select Many)</label>
                    <div className="flex flex-wrap gap-2">
                      {specializationOptions.map((item) => (
                        <label key={item} className="inline-flex items-center gap-2 text-xs font-semibold px-2 py-1 rounded-lg border border-slate-200 bg-slate-50">
                          <input
                            type="checkbox"
                            checked={reqForm.specializations.includes(item)}
                            onChange={(e) => setReqForm({
                              ...reqForm,
                              specializations: e.target.checked
                                ? Array.from(new Set([...reqForm.specializations, item]))
                                : reqForm.specializations.filter((x) => x !== item),
                            })}
                          />
                          {item}
                        </label>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input value={newSpecialization} onChange={(e) => setNewSpecialization(e.target.value)} placeholder="Add more specialization" className="flex-1 px-4 py-2 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-semibold" />
                      <button
                        type="button"
                        onClick={() => {
                          const next = newSpecialization.trim();
                          if (!next) return;
                          if (!specializationOptions.includes(next)) setSpecializationOptions((prev) => [...prev, next]);
                          if (!reqForm.specializations.includes(next)) setReqForm({ ...reqForm, specializations: [...reqForm.specializations, next] });
                          setNewSpecialization('');
                        }}
                        className="px-3 py-2 rounded-2xl bg-blue-600 text-white text-sm font-bold"
                      >
                        Add
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Other Remarks</label>
                    <textarea 
                      value={reqForm.remark}
                      onChange={e => setReqForm({...reqForm, remark: e.target.value})}
                      className="w-full h-32 px-6 py-4 bg-slate-50 border border-slate-100 rounded-3xl focus:ring-4 focus:ring-blue-100 outline-none font-bold text-slate-700 resize-none"
                      placeholder="Any specific client requests..."
                    />
                  </div>
                </div>

                <div className="shrink-0 p-3 sm:p-10 pb-4 sm:pb-10 bg-slate-50 border-t border-slate-100 grid grid-cols-2 gap-3 sm:gap-4">
                    <button 
                      type="button" 
                      onClick={() => {
                        setShowReqModal(false);
                        setEditingRequirementId(null);
                      }}
                    className="py-3 sm:py-5 font-black text-xs uppercase tracking-widest text-slate-400 bg-white rounded-3xl border border-slate-200 hover:bg-slate-100 transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    disabled={loading}
                    className="py-3 sm:py-5 bg-blue-600 text-white font-black text-xs uppercase tracking-widest rounded-3xl shadow-2xl shadow-blue-200 hover:bg-blue-700 transition-all active:scale-95 disabled:opacity-50"
                  >
                    {loading ? (editingRequirementId ? 'Saving...' : 'Adding...') : (editingRequirementId ? 'Save Changes' : 'Save Requirement')}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
        </div>
      </div>
  );
}

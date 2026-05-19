import { useState, useEffect, useRef, FormEvent, useMemo } from 'react';
import { db, auth, functions } from '../lib/firebase';
import { initializeApp, deleteApp } from 'firebase/app';
import { createUserWithEmailAndPassword, getAuth, signOut } from 'firebase/auth';
import { 
  collection, 
  query, 
  addDoc, 
  setDoc,
  deleteDoc,
  doc, 
  updateDoc, 
  serverTimestamp, 
  orderBy, 
  onSnapshot,
  where,
  limit,
  getDocs,
  runTransaction,
  writeBatch,
  Timestamp
} from 'firebase/firestore';
import { Lead, User, LeadStatus, OperationType, Requirement, Attendance, AttendanceCorrectionRequest, Broker, LeadTransfer } from '../types';
import { handleFirestoreError } from '../lib/utils';
import InventoryManagement from './InventoryManagement';
import SalesPerformanceDashboard from './SalesPerformanceDashboard';
import MonthlyAttendanceReport from './MonthlyAttendanceReport';
import { 
  BarChart3,
  Users, 
  UserPlus, 
  ClipboardList, 
  Plus, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Search,
  History,
  ArrowLeftRight,
  MessageSquare,
  XSquare,
  Phone,
  Loader2,
  FileText,
  Home,
  MapPin,
  Edit2,
  Clock3,
  Trash2,
  LayoutGrid,
  Download,
  Upload,
  Database
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format } from 'date-fns';
import { Followup } from '../types';
import firebaseConfig from '../../firebase-applet-config.json';
import { httpsCallable } from 'firebase/functions';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type AdminView = 'performance' | 'leads' | 'employees' | 'attendance' | 'requirements' | 'inventory' | 'brokers' | 'transfer_register';

type AdminDashboardProps = {
  user: User;
  backSignal?: number;
  initialView?: AdminView;
  initialViewSignal?: number;
};

function LeadTimeline({ leadId }: { leadId: string }) {
  const [followups, setFollowups] = useState<Followup[]>([]);

  useEffect(() => {
    const q = query(collection(db, 'leads', leadId, 'followups'), orderBy('date', 'desc'));
    const unsub = onSnapshot(q, (sn) => setFollowups(sn.docs.map(d => ({ id: d.id, ...d.data() } as Followup))));
    return unsub;
  }, [leadId]);

  return (
    <div className="relative space-y-4 before:absolute before:left-3 before:top-2 before:bottom-2 before:w-0.5 before:bg-gray-100">
      {followups.map(f => (
        <div key={f.id} className="relative pl-8">
          <div className="absolute left-1.5 top-1.5 w-3 h-3 rounded-full bg-blue-500 border-2 border-white shadow-sm" />
          <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">{f.date?.toDate ? format(f.date.toDate(), 'MMM dd, hh:mm a') : 'Just now'}</p>
          <div className="p-3 bg-white border border-gray-100 rounded-xl shadow-sm text-sm text-gray-700 font-medium leading-relaxed">
            {f.remark}
          </div>
        </div>
      ))}
      {followups.length === 0 && <p className="text-center py-4 text-gray-400 text-sm">No history yet.</p>}
    </div>
  );
}

const formatLeadDate = (date: any) => {
  if (!date) return 'Just now';
  const d = date.toDate ? date.toDate() : (date.seconds ? new Date(date.seconds * 1000) : new Date(date));
  return format(d, 'MMM dd, yyyy hh:mm a');
};

const getAddedByRoleLabel = (role?: Lead['addedByRole']) => {
  if (role === 'admin') return 'Admin';
  if (role === 'manager') return 'Manager';
  return 'Legacy';
};

const parseTimestamp = (value: any): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value?.toDate === 'function') {
    const converted = value.toDate();
    return converted instanceof Date && !Number.isNaN(converted.getTime()) ? converted : null;
  }
  if (typeof value?.seconds === 'number') {
    const converted = new Date(value.seconds * 1000);
    return Number.isNaN(converted.getTime()) ? null : converted;
  }
  const converted = new Date(value);
  return Number.isNaN(converted.getTime()) ? null : converted;
};

export default function AdminDashboard({
  user,
  backSignal = 0,
  initialView,
  initialViewSignal = 0,
}: AdminDashboardProps) {
  const isSuperAdmin = user.role === 'super_admin' || user.role === 'admin';
  const isManager = user.role === 'manager';
  const [activeView, setActiveView] = useState<AdminView>(initialView ?? 'performance');
  const [employees, setEmployees] = useState<User[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [leadTransfers, setLeadTransfers] = useState<LeadTransfer[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [attendanceCorrections, setAttendanceCorrections] = useState<AttendanceCorrectionRequest[]>([]);
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [showAddLead, setShowAddLead] = useState(false);
  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [showAddBroker, setShowAddBroker] = useState(false);
  const [showReqModal, setShowReqModal] = useState(false);
  const [showEditEmployee, setShowEditEmployee] = useState<User | null>(null);
  const [leadForm, setLeadForm] = useState({ name: '', phone: '', source: '' });
  const [leadAllocationMode, setLeadAllocationMode] = useState<'auto' | 'manual'>('auto');
  const [manualLeadAssigneeId, setManualLeadAssigneeId] = useState('');
  const [employeeForm, setEmployeeForm] = useState({
    name: '',
    phone: '',
    role: 'employee' as 'employee' | 'manager',
    managerId: isManager ? user.uid : '',
  });
  const [brokerForm, setBrokerForm] = useState({ name: '', phone: '', email: '', company: '' });
  const [editingBrokerId, setEditingBrokerId] = useState<string | null>(null);
  const [editingRequirementId, setEditingRequirementId] = useState<string | null>(null);
  const [reqForm, setReqForm] = useState({
    name: '',
    phone: '',
    type: 'zeemen',
    area: '',
    budget: '',
    location: '',
    remark: ''
  });
  const [loading, setLoading] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferSearch, setTransferSearch] = useState('');
  const [interactionRemark, setInteractionRemark] = useState('');
  const [nextFollowupDate, setNextFollowupDate] = useState('');

  // Reallocation State
  const [reallocateEmployee, setReallocateEmployee] = useState<User | null>(null);
  const [showReallocateModal, setShowReallocateModal] = useState(false);
  const [reallocateToMethod, setReallocateToMethod] = useState<'manual' | 'auto'>('auto');
  const [targetEmployeeId, setTargetEmployeeId] = useState('');
  const [reallocateLeadsCount, setReallocateLeadsCount] = useState(0);
  const [pendingRole, setPendingRole] = useState<'suspended' | 'deleted' | null>(null);
  const [saveToast, setSaveToast] = useState<{ title: string; description: string } | null>(null);
  const saveToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const processedBackSignalRef = useRef(0);
  const tabsScrollRef = useRef<HTMLDivElement | null>(null);
  const leadsImportInputRef = useRef<HTMLInputElement | null>(null);
  const inventoryImportInputRef = useRef<HTMLInputElement | null>(null);
  const [canScrollTabsLeft, setCanScrollTabsLeft] = useState(false);
  const [canScrollTabsRight, setCanScrollTabsRight] = useState(false);
  const [dataToolsBusy, setDataToolsBusy] = useState<string | null>(null);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const managerScopeUserIdsRef = useRef<Set<string>>(new Set([user.uid]));
  const rawLeadsRef = useRef<Lead[]>([]);
  const rawAttendanceRef = useRef<Attendance[]>([]);
  const rawRequirementsRef = useRef<Requirement[]>([]);
  const rawLeadTransfersRef = useRef<LeadTransfer[]>([]);
  const actorLabel = isManager ? 'Manager' : 'Admin';

  const normalizePhone = (value: string) => value.replace(/\D/g, '');
  const managers = employees.filter((member) => member.role === 'manager' && (!isManager || member.uid === user.uid));
  const activeEmployees = employees.filter(
    (member) => member.role === 'employee' && (!isManager || member.managerId === user.uid)
  );
  const leadAssignableMembers = isManager
    ? [{ uid: user.uid, name: user.name, phone: user.phone }, ...activeEmployees.map((member) => ({ uid: member.uid, name: member.name, phone: member.phone }))]
    : activeEmployees.map((member) => ({ uid: member.uid, name: member.name, phone: member.phone }));
  const visibleEmployees = isManager
    ? employees.filter((member) => {
        if (member.uid === user.uid) return true;
        return (
          (member.role === 'employee' || member.role === 'suspended' || member.role === 'deleted') &&
          member.managerId === user.uid
        );
      })
    : employees;
  const attendanceMembers = isManager
    ? [
        ...activeEmployees,
        {
          uid: user.uid,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: 'manager' as const,
          createdAt: null,
        },
      ]
    : activeEmployees;
  const showSaveToast = (title: string, description: string) => {
    setSaveToast({ title, description });
    if (saveToastTimerRef.current) {
      clearTimeout(saveToastTimerRef.current);
    }
    saveToastTimerRef.current = setTimeout(() => {
      setSaveToast(null);
      saveToastTimerRef.current = null;
    }, 4500);
  };

  const serializeFirestoreValue = (value: any): any => {
    if (value instanceof Timestamp) {
      return { __ts: value.toMillis() };
    }
    if (value && typeof value === 'object' && typeof value.toDate === 'function') {
      const parsed = value.toDate();
      if (parsed instanceof Date && !Number.isNaN(parsed.getTime())) {
        return { __ts: parsed.getTime() };
      }
    }
    if (Array.isArray(value)) {
      return value.map((entry) => serializeFirestoreValue(entry));
    }
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, serializeFirestoreValue(v)])
      );
    }
    return value;
  };

  const deserializeFirestoreValue = (value: any): any => {
    if (Array.isArray(value)) {
      return value.map((entry) => deserializeFirestoreValue(entry));
    }
    if (value && typeof value === 'object') {
      if (typeof value.__ts === 'number') {
        return Timestamp.fromMillis(value.__ts);
      }
      if (typeof value.seconds === 'number' && typeof value.nanoseconds === 'number' && Object.keys(value).length <= 3) {
        return Timestamp.fromMillis(value.seconds * 1000 + Math.floor(value.nanoseconds / 1000000));
      }
      return Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, deserializeFirestoreValue(v)])
      );
    }
    return value;
  };

  const downloadJsonFile = (filename: string, payload: any) => {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const exportLeadsData = async () => {
    setDataToolsBusy('export_leads');
    try {
      const leadsSnapshot = await getDocs(collection(db, 'leads'));
      const records = [];
      for (const leadDoc of leadsSnapshot.docs) {
        const followupsSnapshot = await getDocs(query(collection(db, 'leads', leadDoc.id, 'followups'), orderBy('date', 'asc')));
        records.push({
          id: leadDoc.id,
          data: serializeFirestoreValue(leadDoc.data()),
          followups: followupsSnapshot.docs.map((f) => ({
            id: f.id,
            data: serializeFirestoreValue(f.data()),
          })),
        });
      }

      downloadJsonFile(
        `leads-export-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
        { collection: 'leads', exportedAt: new Date().toISOString(), records }
      );
      alert(`Exported ${records.length} leads successfully.`);
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, 'leads');
    } finally {
      setDataToolsBusy(null);
    }
  };

  const exportInventoryData = async () => {
    setDataToolsBusy('export_inventory');
    try {
      const snapshot = await getDocs(collection(db, 'inventory'));
      const records = snapshot.docs.map((d) => ({
        id: d.id,
        data: serializeFirestoreValue(d.data()),
      }));
      downloadJsonFile(
        `inventory-export-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
        { collection: 'inventory', exportedAt: new Date().toISOString(), records }
      );
      alert(`Exported ${records.length} inventory items successfully.`);
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, 'inventory');
    } finally {
      setDataToolsBusy(null);
    }
  };

  const commitBatchedWrites = async (
    targetCollection: 'leads' | 'inventory',
    records: Array<{ id?: string; data: any; followups?: Array<{ id?: string; data: any }> }>
  ) => {
    let batch = writeBatch(db);
    let operations = 0;
    let importedRows = 0;

    const flush = async () => {
      if (operations === 0) return;
      await batch.commit();
      batch = writeBatch(db);
      operations = 0;
    };

    for (const record of records) {
      const data = deserializeFirestoreValue(record.data || {});
      const docId = record.id || doc(collection(db, targetCollection)).id;
      batch.set(doc(db, targetCollection, docId), data);
      operations += 1;
      importedRows += 1;

      if (targetCollection === 'leads' && Array.isArray(record.followups)) {
        for (const followup of record.followups) {
          const followupId = followup.id || doc(collection(db, 'leads', docId, 'followups')).id;
          batch.set(doc(db, 'leads', docId, 'followups', followupId), deserializeFirestoreValue(followup.data || {}));
          operations += 1;
          if (operations >= 450) {
            await flush();
          }
        }
      }

      if (operations >= 450) {
        await flush();
      }
    }

    await flush();
    return importedRows;
  };

  const importDataFile = async (targetCollection: 'leads' | 'inventory', file: File) => {
    setDataToolsBusy(`import_${targetCollection}`);
    try {
      const raw = await file.text();
      const parsed = JSON.parse(raw);
      const records = Array.isArray(parsed) ? parsed : parsed?.records;

      if (!Array.isArray(records) || records.length === 0) {
        alert('Selected file has no records to import.');
        return;
      }

      const importedCount = await commitBatchedWrites(targetCollection, records);
      alert(`Imported ${importedCount} ${targetCollection} records successfully.`);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Import failed. Please verify the JSON file format.');
    } finally {
      setDataToolsBusy(null);
    }
  };

  const deleteAllFollowupsForLead = async (leadId: string) => {
    while (true) {
      const snapshot = await getDocs(query(collection(db, 'leads', leadId, 'followups'), limit(300)));
      if (snapshot.empty) break;

      const batch = writeBatch(db);
      snapshot.docs.forEach((docItem) => batch.delete(docItem.ref));
      await batch.commit();
    }
  };

  const clearEntireInventory = async () => {
    if (!confirm('This will permanently delete ALL inventory records. Continue?')) return;
    if (!confirm('Please confirm again: delete entire inventory database now?')) return;

    setDataToolsBusy('clear_inventory');
    try {
      let deletedCount = 0;
      while (true) {
        const snapshot = await getDocs(query(collection(db, 'inventory'), limit(300)));
        if (snapshot.empty) break;
        const batch = writeBatch(db);
        snapshot.docs.forEach((docItem) => {
          batch.delete(docItem.ref);
          deletedCount += 1;
        });
        await batch.commit();
      }
      alert(`Cleared inventory database. Deleted ${deletedCount} documents.`);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'inventory');
    } finally {
      setDataToolsBusy(null);
    }
  };

  const clearEntireLeads = async () => {
    if (!confirm('This will permanently delete ALL leads and follow-up history. Continue?')) return;
    if (!confirm('Please confirm again: delete entire leads database now?')) return;

    setDataToolsBusy('clear_leads');
    try {
      let deletedLeads = 0;
      while (true) {
        const leadsSnapshot = await getDocs(query(collection(db, 'leads'), limit(120)));
        if (leadsSnapshot.empty) break;

        for (const leadDoc of leadsSnapshot.docs) {
          await deleteAllFollowupsForLead(leadDoc.id);
        }

        const batch = writeBatch(db);
        leadsSnapshot.docs.forEach((leadDoc) => {
          batch.delete(leadDoc.ref);
          deletedLeads += 1;
        });
        await batch.commit();
      }

      alert(`Cleared leads database. Deleted ${deletedLeads} leads (with their follow-ups).`);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'leads');
    } finally {
      setDataToolsBusy(null);
    }
  };

  const handleReallocateAndChangeStatus = async () => {
    if (!reallocateEmployee || !pendingRole) return;
    if (reallocateToMethod === 'manual' && !targetEmployeeId) return alert('Select a person to reallocate leads to.');
    
    setLoading(true);
    try {
      const leadsToReallocate = leads.filter(l => l.assignedTo === reallocateEmployee.uid);
      const batch = writeBatch(db);
      const reallocationPool = leadAssignableMembers.filter((e) => e.uid !== reallocateEmployee.uid);

      if (reallocationPool.length === 0 && reallocateToMethod === 'auto') {
        throw new Error('No other active employees available for automatic reallocation.');
      }

      leadsToReallocate.forEach((lead, index) => {
        const leadRef = doc(db, 'leads', lead.id);
        let newAssigneeId = targetEmployeeId;
        
        if (reallocateToMethod === 'auto') {
          newAssigneeId = reallocationPool[index % reallocationPool.length].uid;
        }

        const newAssigneeName = employees.find(e => e.uid === newAssigneeId)?.name || 'New Executive';

        batch.update(leadRef, {
          assignedTo: newAssigneeId,
          updatedAt: serverTimestamp()
        });

        const followupRef = doc(collection(db, 'leads', lead.id, 'followups'));
        batch.set(followupRef, {
          date: serverTimestamp(),
          remark: `System reallocated lead from ${reallocateEmployee.name} (${pendingRole}) to ${newAssigneeName}`,
          employeeId: user.uid
        });

        // Notify new assignee
        const notifRef = doc(collection(db, 'notifications'));
        batch.set(notifRef, {
          userId: newAssigneeId,
          title: 'Transferred Lead Assigned',
          message: `Lead "${lead.name}" was transferred to you due to member status change.`,
          leadId: lead.id,
          read: false,
          createdAt: serverTimestamp()
        });
      });

      // Finally apply member status action.
      if (pendingRole === 'deleted') {
        batch.update(doc(db, 'users', reallocateEmployee.uid), {
          role: 'deleted',
          managerId: null,
          managerName: null,
          updatedAt: serverTimestamp(),
        });
      } else {
        batch.update(doc(db, 'users', reallocateEmployee.uid), { 
          role: pendingRole,
          updatedAt: serverTimestamp()
        });
      }
      batch.delete(doc(db, 'employeeDirectory', reallocateEmployee.uid));

      await batch.commit();
      setShowReallocateModal(false);
      setReallocateEmployee(null);
      alert(`Successfully reallocated ${reallocateLeadsCount} leads and ${pendingRole === 'deleted' ? 'removed the member.' : 'updated status.'}`);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Allocation failed');
    } finally {
      setLoading(false);
    }
  };

  const checkAndPromptReallocation = (emp: User, newRole: 'suspended' | 'deleted') => {
    const assignedLeadsCount = leads.filter(l => l.assignedTo === emp.uid).length;
    if (assignedLeadsCount > 0) {
      setReallocateEmployee(emp);
      setReallocateLeadsCount(assignedLeadsCount);
      setPendingRole(newRole);
      setShowReallocateModal(true);
      return true; 
    }
    return false;
  };

  const handleTransfer = async (targetEmployee: { uid: string; name: string }) => {
    if (!selectedLead) return;
    if (!confirm(`Transfer lead to ${targetEmployee.name}?`)) return;
    setLoading(true);

    try {
      const leadRef = doc(db, 'leads', selectedLead.id);
      await updateDoc(leadRef, {
        assignedTo: targetEmployee.uid,
        updatedAt: serverTimestamp()
      });

      await addDoc(collection(db, 'leads', selectedLead.id, 'followups'), {
        date: serverTimestamp(),
        remark: `${actorLabel} transferred lead from ${employees.find(e => e.uid === selectedLead.assignedTo)?.name || 'Unknown'} to ${targetEmployee.name}`,
        employeeId: user.uid
      });
      await addDoc(collection(db, 'leadTransfers'), {
        leadId: selectedLead.id,
        leadName: selectedLead.name,
        fromUid: selectedLead.assignedTo,
        fromName: employees.find(e => e.uid === selectedLead.assignedTo)?.name || 'Unknown',
        toUid: targetEmployee.uid,
        toName: targetEmployee.name,
        transferredByUid: user.uid,
        transferredByName: user.name,
        transferredByRole: user.role,
        createdAt: serverTimestamp(),
      });

      // Notify new assignee
      await addDoc(collection(db, 'notifications'), {
        userId: targetEmployee.uid,
        title: 'New Lead Assigned',
        message: `${actorLabel} re-assigned lead "${selectedLead.name}" to you.`,
        leadId: selectedLead.id,
        read: false,
        createdAt: serverTimestamp()
      });

      setShowTransferModal(false);
      setSelectedLead(null);
      alert(`Lead successfully transferred to ${targetEmployee.name}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `leads/${selectedLead.id}`);
    } finally {
      setLoading(false);
    }
  };

  const handleInteraction = async (status: LeadStatus) => {
    if (!selectedLead) return;
    if (!interactionRemark) return alert('Remark is mandatory for recording an interaction');
    setLoading(true);

    try {
      const leadRef = doc(db, 'leads', selectedLead.id);
      const updateData: any = {
        status,
        lastRemark: interactionRemark,
        updatedAt: serverTimestamp(),
        lastInteractionAt: serverTimestamp(),
      };

      const localUpdateData: Partial<Lead> = {
        status,
        lastRemark: interactionRemark,
        updatedAt: Timestamp.now(),
        lastInteractionAt: Timestamp.now(),
      };

      if (nextFollowupDate && !isNaN(new Date(nextFollowupDate).getTime())) {
        const nextFollowupAt = Timestamp.fromDate(new Date(nextFollowupDate));
        updateData.nextFollowupAt = nextFollowupAt;
        localUpdateData.nextFollowupAt = nextFollowupAt;
      }

      await updateDoc(leadRef, updateData);

      await addDoc(collection(db, 'leads', selectedLead.id, 'followups'), {
        date: serverTimestamp(),
        remark: `[Admin] ${interactionRemark}`,
        employeeId: user.uid
      });

      // Notify assigned employee about admin remark
      if (selectedLead.assignedTo) {
        await addDoc(collection(db, 'notifications'), {
          userId: selectedLead.assignedTo,
          title: `${actorLabel} Remark Added`,
          message: `${actorLabel} added a remark on your lead "${selectedLead.name}": ${interactionRemark}`,
          leadId: selectedLead.id,
          read: false,
          createdAt: serverTimestamp()
        });
      }

      setInteractionRemark('');
      setNextFollowupDate('');
      // Update local state with concrete timestamps to avoid invalid date formatting crashes.
      setSelectedLead((prev) => (prev ? ({ ...prev, ...localUpdateData } as Lead) : prev));

      let successMessage = 'Interaction recorded successfully.';
      if (status === 'interested') {
        successMessage = 'Interested successfully.';
      } else if (status === 'not_interested') {
        successMessage = 'Declined successfully.';
      }

      alert(successMessage);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `leads/${selectedLead.id}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const qEmployees = query(collection(db, 'users'), where('role', 'in', ['employee', 'manager', 'suspended']));
    const unsubscribeEmployees = onSnapshot(qEmployees, (snapshot) => {
      const nextEmployees = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as User));
      setEmployees(nextEmployees);
      if (isManager) {
        const scopedIds = new Set<string>([user.uid]);
        nextEmployees.forEach((member) => {
          if (member.managerId === user.uid && (member.role === 'employee' || member.role === 'suspended' || member.role === 'deleted')) {
            scopedIds.add(member.uid);
          }
        });
        managerScopeUserIdsRef.current = scopedIds;
        setLeads(rawLeadsRef.current.filter((lead) => scopedIds.has(lead.assignedTo) || lead.addedById === user.uid));
        setAttendance(rawAttendanceRef.current.filter((log) => scopedIds.has(log.uid)));
        setRequirements(rawRequirementsRef.current.filter((req) => scopedIds.has(req.employeeId)));
        setLeadTransfers(
          rawLeadTransfersRef.current.filter((entry) =>
            scopedIds.has(entry.fromUid) || scopedIds.has(entry.toUid) || scopedIds.has(entry.transferredByUid)
          )
        );
      }
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'users'));

    const qLeads = query(collection(db, 'leads'), orderBy('createdAt', 'desc'));
    const unsubscribeLeads = onSnapshot(qLeads, (snapshot) => {
      const allLeads = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Lead));
      rawLeadsRef.current = allLeads;
      if (!isManager) {
        setLeads(allLeads);
        return;
      }
      const scopeIds = managerScopeUserIdsRef.current;
      setLeads(
        allLeads.filter((lead) => scopeIds.has(lead.assignedTo) || lead.addedById === user.uid)
      );
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'leads'));

    const qAttendance = query(collection(db, 'attendance'), orderBy('timestamp', 'desc'), limit(2000));
    const unsubscribeAttendance = onSnapshot(qAttendance, (snapshot) => {
      const allLogs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Attendance));
      rawAttendanceRef.current = allLogs;
      if (!isManager) {
        setAttendance(allLogs);
        return;
      }
      const scopeIds = managerScopeUserIdsRef.current;
      setAttendance(allLogs.filter((log) => scopeIds.has(log.uid)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'attendance'));

    const qReqs = query(collection(db, 'requirements'), orderBy('createdAt', 'desc'));
    const unsubscribeReqs = onSnapshot(qReqs, (snapshot) => {
      const allRequirements = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Requirement));
      rawRequirementsRef.current = allRequirements;
      if (!isManager) {
        setRequirements(allRequirements);
        return;
      }
      const scopeIds = managerScopeUserIdsRef.current;
      setRequirements(allRequirements.filter((req) => scopeIds.has(req.employeeId)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'requirements'));

    const qTransfers = query(collection(db, 'leadTransfers'), orderBy('createdAt', 'desc'), limit(2000));
    const unsubscribeTransfers = onSnapshot(qTransfers, (snapshot) => {
      const allTransfers = snapshot.docs.map((transferDoc) => ({ id: transferDoc.id, ...transferDoc.data() } as LeadTransfer));
      rawLeadTransfersRef.current = allTransfers;
      if (!isManager) {
        setLeadTransfers(allTransfers);
        return;
      }
      const scopeIds = managerScopeUserIdsRef.current;
      setLeadTransfers(
        allTransfers.filter((entry) =>
          scopeIds.has(entry.fromUid) || scopeIds.has(entry.toUid) || scopeIds.has(entry.transferredByUid)
        )
      );
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'leadTransfers'));

    const qAttendanceCorrections = isManager
      ? query(collection(db, 'attendanceCorrections'), where('uid', '==', user.uid))
      : query(collection(db, 'attendanceCorrections'), orderBy('requestedAt', 'desc'));
    const unsubscribeAttendanceCorrections = onSnapshot(qAttendanceCorrections, (snapshot) => {
      const requests = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as AttendanceCorrectionRequest))
        .sort((a, b) => (parseTimestamp(b.requestedAt)?.getTime() ?? 0) - (parseTimestamp(a.requestedAt)?.getTime() ?? 0));
      setAttendanceCorrections(requests);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'attendanceCorrections'));

    return () => {
      unsubscribeEmployees();
      unsubscribeLeads();
      unsubscribeAttendance();
      unsubscribeReqs();
      unsubscribeTransfers();
      unsubscribeAttendanceCorrections();
    };
  }, [isManager, user.uid]);

  useEffect(() => {
    if (!isSuperAdmin) {
      setBrokers([]);
      return;
    }

    const qBrokers = query(collection(db, 'brokers'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(qBrokers, (snapshot) => {
      setBrokers(snapshot.docs.map((brokerDoc) => ({ id: brokerDoc.id, ...brokerDoc.data() } as Broker)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'brokers'));

    return () => unsubscribe();
  }, [isSuperAdmin]);

  useEffect(() => {
    return () => {
      if (saveToastTimerRef.current) {
        clearTimeout(saveToastTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!backSignal || backSignal === processedBackSignalRef.current) {
      return;
    }
    processedBackSignalRef.current = backSignal;

    if (showTransferModal) {
      setShowTransferModal(false);
      return;
    }

    if (showReallocateModal) {
      setShowReallocateModal(false);
      setReallocateEmployee(null);
      return;
    }

    if (showAddLead) {
      setShowAddLead(false);
      return;
    }

    if (showAddEmployee) {
      setShowAddEmployee(false);
      return;
    }

    if (showAddBroker) {
      setShowAddBroker(false);
      return;
    }

    if (showEditEmployee) {
      setShowEditEmployee(null);
      return;
    }

    if (selectedLead) {
      setSelectedLead(null);
      setIsEditing(false);
      return;
    }

    if (activeView !== 'performance') {
      setActiveView('performance');
    }
  }, [backSignal, showAddBroker]);

  useEffect(() => {
    if (!initialView) return;
    setActiveView(initialView);
  }, [initialView, initialViewSignal]);

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
    el.scrollBy({ left: direction === 'left' ? -180 : 180, behavior: 'smooth' });
  };

  const deleteRequirement = async (reqId: string) => {
    if (!confirm('Are you sure you want to delete this requirement?')) return;
    try {
      await deleteDoc(doc(db, 'requirements', reqId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `requirements/${reqId}`);
    }
  };

  const [filter, setFilter] = useState<LeadStatus | 'total'>('total');
  const [leadSearchQuery, setLeadSearchQuery] = useState('');
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Lead>>({});

  const handleUpdateEmployee = async (e: FormEvent) => {
    e.preventDefault();
    if (!showEditEmployee) return;
    
    const currentUser = employees.find(e => e.uid === showEditEmployee.uid);
    const isStatusWorsening = (showEditEmployee.role === 'suspended' || showEditEmployee.role === 'deleted') && 
                             (currentUser?.role !== showEditEmployee.role);
    
    if (isStatusWorsening) {
      const interrupted = checkAndPromptReallocation(showEditEmployee, showEditEmployee.role as any);
      if (interrupted) {
         setShowEditEmployee(null);
         return;
      }
    }

    setLoading(true);
    try {
      if (showEditEmployee.role === 'deleted') {
        const batch = writeBatch(db);
        batch.update(doc(db, 'users', showEditEmployee.uid), {
          role: 'deleted',
          managerId: null,
          managerName: null,
          updatedAt: serverTimestamp(),
        });
        batch.delete(doc(db, 'employeeDirectory', showEditEmployee.uid));
        await batch.commit();
        setShowEditEmployee(null);
        return;
      }

      const selectedManager = employees.find((member) => member.uid === showEditEmployee.managerId && member.role === 'manager');
      const isEmployeeRole = showEditEmployee.role === 'employee';
      await updateDoc(doc(db, 'users', showEditEmployee.uid), {
        name: showEditEmployee.name,
        phone: showEditEmployee.phone,
        role: showEditEmployee.role,
        managerId: isEmployeeRole ? (selectedManager?.uid || null) : null,
        managerName: isEmployeeRole ? (selectedManager?.name || null) : null,
        updatedAt: serverTimestamp(),
      });

      if (isEmployeeRole) {
        await setDoc(doc(db, 'employeeDirectory', showEditEmployee.uid), {
          name: showEditEmployee.name,
          phone: showEditEmployee.phone,
          role: 'employee',
          managerId: selectedManager?.uid || null,
          managerName: selectedManager?.name || null,
          updatedAt: serverTimestamp(),
        });
      } else {
        await deleteDoc(doc(db, 'employeeDirectory', showEditEmployee.uid));
      }

      setShowEditEmployee(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${showEditEmployee.uid}`);
    } finally {
      setLoading(false);
    }
  };

  const stats = {
    total: leads.length,
    interested: leads.filter(l => l.status === 'interest' || l.status === 'interested').length,
    notInterested: leads.filter(l => l.status === 'not_interested').length,
    pending: leads.filter(l => l.status === 'pending').length,
    dealPending: leads.filter(l => l.status === 'deal_pending').length,
    dealsApproved: leads.filter(l => l.status === 'deal_approved').length
  };

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);
  const upcomingCount = leads.filter((lead) => {
    const d = parseTimestamp((lead as any).nextFollowupAt);
    return Boolean(d && d > todayEnd);
  }).length;
  const overdueCount = leads.filter((lead) => {
    const d = parseTimestamp((lead as any).nextFollowupAt);
    return Boolean(d && d < todayStart && lead.status !== 'deal_approved' && lead.status !== 'not_interested');
  }).length;
  const todayFollowupsCount = leads.filter((lead) => {
    const d = parseTimestamp((lead as any).nextFollowupAt);
    return Boolean(d && d >= todayStart && d <= todayEnd);
  }).length;
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const weekSiteVisits = leads.filter((lead) => {
    const d = parseTimestamp((lead as any).siteVisitAt);
    return Boolean(d && d >= weekStart);
  }).length;
  const weekDeals = leads.filter((lead) => {
    const d = parseTimestamp((lead as any).updatedAt || (lead as any).createdAt);
    return Boolean(lead.status === 'deal_approved' && d && d >= weekStart);
  }).length;

  const statusFilteredLeads = filter === 'total' 
    ? leads 
    : leads.filter(l => {
        if (filter === 'deal_pending') return l.status === 'deal_pending';
        if (filter === 'deal_approved') return l.status === 'deal_approved';
        return l.status === filter;
      });

  const adminLeadSearchTerm = leadSearchQuery.trim().toLowerCase();
  const filteredLeads = statusFilteredLeads.filter((l) => {
    if (!adminLeadSearchTerm) return true;
    const assignedName = employees.find(e => e.uid === l.assignedTo)?.name || '';
    const searchableText = [
      l.name,
      l.phone,
      l.source,
      l.status?.replace('_', ' '),
      l.addedByName,
      l.lastRemark,
      assignedName
    ].filter(Boolean).join(' ').toLowerCase();
    return searchableText.includes(adminLeadSearchTerm);
  });

  const managerLastAttendance = useMemo(() => {
    if (!isManager) return null;
    const ownLogs = attendance
      .filter((log) => log.uid === user.uid)
      .map((log) => ({ log, at: parseTimestamp(log.timestamp) }))
      .filter((entry): entry is { log: Attendance; at: Date } => Boolean(entry.at))
      .sort((a, b) => b.at.getTime() - a.at.getTime());
    return ownLogs[0]?.log ?? null;
  }, [attendance, isManager, user.uid]);

  const isManagerClockedIn = managerLastAttendance?.type === 'clock_in';

  const handleManagerAttendance = async (type: 'clock_in' | 'clock_out') => {
    if (!isManager || !auth.currentUser) return;
    setAttendanceLoading(true);
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject);
      });
      const { latitude, longitude } = position.coords;
      await addDoc(collection(db, 'attendance'), {
        uid: auth.currentUser.uid,
        employeeName: user.name,
        timestamp: serverTimestamp(),
        type,
        location: { latitude, longitude },
      });
    } catch (error) {
      alert('Error fetching location or saving attendance. Please ensure GPS is enabled.');
    } finally {
      setAttendanceLoading(false);
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
    });
    setEditingRequirementId(req.id);
    setShowReqModal(true);
  };

  const handleSaveRequirement = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingRequirementId) return;
    if (!reqForm.name || !reqForm.phone || !reqForm.type) return alert('Name, Phone and Type are mandatory');
    const normalizedPhone = normalizePhone(reqForm.phone);
    if (normalizedPhone.length !== 10) return alert('Phone number must be exactly 10 digits.');
    setLoading(true);
    try {
      await updateDoc(doc(db, 'requirements', editingRequirementId), {
        ...reqForm,
        phone: normalizedPhone,
        updatedAt: serverTimestamp(),
      });
      setShowReqModal(false);
      setEditingRequirementId(null);
      showSaveToast('Requirement updated', `${reqForm.name} details saved`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `requirements/${editingRequirementId}`);
    } finally {
      setLoading(false);
    }
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

  const handleReviewAttendanceCorrection = async (request: AttendanceCorrectionRequest, status: 'approved' | 'rejected') => {
    if (!isSuperAdmin) return;
    try {
      await updateDoc(doc(db, 'attendanceCorrections', request.id), {
        status,
        reviewedBy: user.name,
        reviewedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `attendanceCorrections/${request.id}`);
    }
  };

  const deleteEmployee = async (empId: string) => {
    const emp = employees.find(e => e.uid === empId);
    if (!emp) return;
    if (!confirm('Are you sure? This will permanently remove this member from the site.')) return;
    
    const interrupted = checkAndPromptReallocation(emp, 'deleted');
    if (interrupted) return;

    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'users', empId), {
        role: 'deleted',
        managerId: null,
        managerName: null,
        updatedAt: serverTimestamp(),
      });
      batch.delete(doc(db, 'employeeDirectory', empId));
      await batch.commit();
    } catch (error) {
       handleFirestoreError(error, OperationType.DELETE, `users/${empId}`);
    }
  };

  const resetEmployeePassword = async (emp: User) => {
    if (emp.role === 'deleted') return alert('Cannot reset password for deleted users.');
    if (!functions) return alert('Firebase Functions is not available.');
    const suggested = normalizePhone(emp.phone);
    const entered = prompt(`Enter a temporary password for ${emp.name}.\nLeave empty to use mobile number.`, suggested);
    if (entered === null) return;
    const nextPassword = entered.trim() || suggested;
    if (nextPassword.length < 8) return alert('Password must be at least 8 characters.');
    if (!confirm(`Reset password for ${emp.name}?`)) return;

    setLoading(true);
    try {
      const fn = httpsCallable(functions, 'resetUserPassword');
      await fn({ targetUid: emp.uid, targetPhone: suggested, newPassword: nextPassword });
      alert(`Password reset successful.\nTemporary password: ${nextPassword}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${emp.uid}/password-reset`);
    } finally {
      setLoading(false);
    }
  };

  const showPasswordRecoveryHelp = (emp: User) => {
    alert(
      `Current password for ${emp.name} cannot be viewed.\n\n` +
      `Reason: passwords are securely hashed in Firebase Auth and are not retrievable.\n\n` +
      `Use "Reset Password" to set a temporary password and share it with the employee.`
    );
  };

  const handleAddLead = async (e: FormEvent) => {
    e.preventDefault();
    const normalizedLeadPhone = normalizePhone(leadForm.phone);
    if (!normalizedLeadPhone || !leadForm.source) return alert('Phone and Source are mandatory');
    if (normalizedLeadPhone.length !== 10) return alert('Mobile number must be exactly 10 digits.');

    const duplicateSnapshot = await getDocs(query(collection(db, 'leads'), where('phone', '==', normalizedLeadPhone), limit(1)));
    if (!duplicateSnapshot.empty) {
      const existingLead = duplicateSnapshot.docs[0].data() as Lead;
      return alert(`Lead with mobile ${normalizedLeadPhone} already exists (${existingLead.name || 'Unknown'}).`);
    }

    setLoading(true);

    try {
      const assignableMembers = leadAssignableMembers;
      if (assignableMembers.length === 0) {
        throw new Error('No active employees available for allocation. Add or activate an employee first.');
      }

      if (leadAllocationMode === 'manual') {
        if (!manualLeadAssigneeId) {
          throw new Error('Select an active employee for manual allocation.');
        }

        const assignedEmployee = assignableMembers.find(e => e.uid === manualLeadAssigneeId);
        if (!assignedEmployee) {
          throw new Error('Selected employee is not active. Please choose another employee.');
        }

        await addDoc(collection(db, 'leads'), {
          name: leadForm.name || 'Anonymous',
          phone: normalizedLeadPhone,
          source: leadForm.source,
          status: 'pending',
          assignedTo: assignedEmployee.uid,
          addedById: user.uid,
          addedByName: user.name,
          addedByRole: user.role === 'manager' ? 'manager' : 'admin',
          assignedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        await runTransaction(db, async (transaction) => {
          const allocationRef = doc(db, 'system', 'allocation');
          const allocationDoc = await transaction.get(allocationRef);
          
          let nextIndex = 0;
          if (allocationDoc.exists()) {
            nextIndex = (allocationDoc.data().lastIndex + 1) % assignableMembers.length;
          }

          const assignedEmployee = assignableMembers[nextIndex];
          
          const newLeadRef = doc(collection(db, 'leads'));
          transaction.set(newLeadRef, {
            name: leadForm.name || 'Anonymous',
            phone: normalizedLeadPhone,
            source: leadForm.source,
            status: 'pending',
            assignedTo: assignedEmployee.uid,
            addedById: user.uid,
            addedByName: user.name,
            addedByRole: user.role === 'manager' ? 'manager' : 'admin',
            assignedAt: serverTimestamp(),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });

          transaction.set(allocationRef, { 
            lastIndex: nextIndex,
            updatedAt: serverTimestamp()
          }, { merge: true });
        });
      }

      setLeadForm({ name: '', phone: '', source: '' });
      setLeadAllocationMode('auto');
      setManualLeadAssigneeId('');
      setShowAddLead(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'leads');
    } finally {
      setLoading(false);
    }
  };

  const handleAddEmployee = async (e: FormEvent) => {
    e.preventDefault();
    const name = employeeForm.name.trim();
    const normalizedPhone = normalizePhone(employeeForm.phone);
    const memberRole = employeeForm.role;
    const selectedManager = isManager
      ? { uid: user.uid, name: user.name }
      : managers.find((member) => member.uid === employeeForm.managerId);
    const email = `${normalizedPhone}@estatepulse.com`;
    const initialPassword = normalizedPhone;

    if (!name) {
      alert('Member name is required.');
      return;
    }
    if (normalizedPhone.length < 10 || normalizedPhone.length > 15) {
      alert('Enter a valid mobile number (10 to 15 digits).');
      return;
    }
    if (memberRole === 'manager' && !isSuperAdmin) {
      alert('Only admin can add managers.');
      return;
    }
    if (memberRole === 'employee' && !selectedManager) {
      alert('Please assign a manager for this employee.');
      return;
    }

    setLoading(true);
    let provisionApp: ReturnType<typeof initializeApp> | null = null;
    let provisionAuth: ReturnType<typeof getAuth> | null = null;
    let provisionedUser: { delete: () => Promise<void> } | null = null;
    try {
      const existingUsersSnapshot = await getDocs(query(collection(db, 'users'), where('phone', '==', normalizedPhone), limit(1)));
      if (!existingUsersSnapshot.empty) {
        const existingUserDoc = existingUsersSnapshot.docs[0];
        const existingUser = existingUserDoc.data() as User;
        if (existingUser.role !== 'deleted' && existingUser.role !== 'suspended') {
          alert('A member account with this mobile number already exists.');
          return;
        }

        const batch = writeBatch(db);
        batch.update(existingUserDoc.ref, {
          name,
          email,
          role: memberRole,
          phone: normalizedPhone,
          managerId: memberRole === 'employee' ? (selectedManager?.uid || null) : null,
          managerName: memberRole === 'employee' ? (selectedManager?.name || null) : null,
          updatedAt: serverTimestamp(),
        });
        if (memberRole === 'employee') {
          batch.set(doc(db, 'employeeDirectory', existingUserDoc.id), {
            name,
            phone: normalizedPhone,
            role: 'employee',
            managerId: selectedManager?.uid || null,
            managerName: selectedManager?.name || null,
            updatedAt: serverTimestamp(),
          });
        } else {
          batch.delete(doc(db, 'employeeDirectory', existingUserDoc.id));
        }
        await batch.commit();

        showSaveToast(`${name} restored successfully`, `${memberRole === 'manager' ? 'Manager' : 'Employee'} account reactivated`);
        setEmployeeForm({ name: '', phone: '', role: 'employee', managerId: isManager ? user.uid : '' });
        setShowAddEmployee(false);
        return;
      }

      // Use a secondary auth instance so the admin session is not replaced.
      provisionApp = initializeApp(firebaseConfig, `employee-provisioner-${Date.now()}`);
      provisionAuth = getAuth(provisionApp);
      const userCredential = await createUserWithEmailAndPassword(provisionAuth, email, initialPassword);
      provisionedUser = userCredential.user;

      const batch = writeBatch(db);
      batch.set(doc(db, 'users', userCredential.user.uid), {
        name,
        email,
        role: memberRole,
        phone: normalizedPhone,
        managerId: memberRole === 'employee' ? (selectedManager?.uid || null) : null,
        managerName: memberRole === 'employee' ? (selectedManager?.name || null) : null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      if (memberRole === 'employee') {
        batch.set(doc(db, 'employeeDirectory', userCredential.user.uid), {
          name,
          phone: normalizedPhone,
          role: 'employee',
          managerId: selectedManager?.uid || null,
          managerName: selectedManager?.name || null,
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();

      showSaveToast(`${name} added successfully`, `${memberRole === 'manager' ? 'Manager' : 'Employee'} account created`);
      setEmployeeForm({ name: '', phone: '', role: 'employee', managerId: isManager ? user.uid : '' });
      setShowAddEmployee(false);
    } catch (error) {
      if (provisionedUser) {
        await provisionedUser.delete().catch(() => {});
      }
      handleFirestoreError(error, OperationType.CREATE, 'users');
      const code = typeof error === 'object' && error && 'code' in error ? String((error as any).code) : '';
      if (code === 'auth/email-already-in-use') {
        alert('This mobile number is tied to an old login account. Restore that member from Team if visible, or contact super admin to reset/unblock the existing account.');
      } else if (code === 'auth/weak-password') {
        alert('Unable to set initial password. Please use a valid mobile number.');
      } else if (error instanceof Error) {
        alert(error.message || 'Failed to add employee. Please try again.');
      } else {
        alert('Failed to add employee. Please try again.');
      }
    } finally {
      try {
        if (provisionAuth) {
          await signOut(provisionAuth);
        }
      } catch {
        // Ignore cleanup sign-out failures for secondary auth instance.
      }
      if (provisionApp) {
        await deleteApp(provisionApp).catch(() => {});
      }
      setLoading(false);
    }
  };

  const handleAddBroker = async (e: FormEvent) => {
    e.preventDefault();
    if (!isSuperAdmin) return alert('Only admin can add brokers.');

    const name = brokerForm.name.trim();
    const phone = normalizePhone(brokerForm.phone);
    if (!name) return alert('Broker name is required.');
    if (phone.length !== 10) return alert('Broker mobile number must be exactly 10 digits.');

    setLoading(true);
    try {
      if (editingBrokerId) {
        await updateDoc(doc(db, 'brokers', editingBrokerId), {
          name,
          phone,
          email: brokerForm.email.trim(),
          company: brokerForm.company.trim(),
          updatedAt: serverTimestamp(),
        });
      } else {
        await addDoc(collection(db, 'brokers'), {
          name,
          phone,
          email: brokerForm.email.trim(),
          company: brokerForm.company.trim(),
          createdBy: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      setBrokerForm({ name: '', phone: '', email: '', company: '' });
      setEditingBrokerId(null);
      setShowAddBroker(false);
      showSaveToast(editingBrokerId ? 'Broker updated' : 'Broker added', `${name} is available for inventory assignment`);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'brokers');
    } finally {
      setLoading(false);
    }
  };

  const deleteAssignedLeadsForTestingUsers = async () => {
    const targetNames = ['tester for ee', 'testing manager'];
    const targetUsers = employees.filter((emp) => targetNames.includes((emp.name || '').trim().toLowerCase()));
    if (targetUsers.length === 0) {
      alert('No users named "Tester for EE" or "Testing Manager" were found.');
      return;
    }

    const targetIds = new Set(targetUsers.map((userItem) => userItem.uid));
    const leadsToDelete = leads.filter((lead) => targetIds.has(lead.assignedTo));
    if (leadsToDelete.length === 0) {
      alert('No leads are currently assigned to Tester for EE or Testing Manager.');
      return;
    }

    if (!confirm(`Delete ${leadsToDelete.length} leads assigned to Tester for EE / Testing Manager? This cannot be undone.`)) return;
    if (!confirm('Please confirm again: permanently delete those assigned leads and their follow-ups now?')) return;

    setDataToolsBusy('clear_testing_assigned_leads');
    try {
      let deletedCount = 0;
      for (const lead of leadsToDelete) {
        await deleteAllFollowupsForLead(lead.id);
        await deleteDoc(doc(db, 'leads', lead.id));
        deletedCount += 1;
      }
      alert(`Deleted ${deletedCount} assigned leads for Tester for EE / Testing Manager.`);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'leads');
    } finally {
      setDataToolsBusy(null);
    }
  };

  const deleteBroker = async (brokerId: string) => {
    if (!isSuperAdmin) return alert('Only admin can delete brokers.');
    if (!confirm('Delete this broker from the broker list? Existing inventory assignments will keep the saved broker name.')) return;

    try {
      await deleteDoc(doc(db, 'brokers', brokerId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `brokers/${brokerId}`);
    }
  };

  const editBroker = (broker: Broker) => {
    setBrokerForm({
      name: broker.name || '',
      phone: broker.phone || '',
      email: broker.email || '',
      company: broker.company || '',
    });
    setEditingBrokerId(broker.id);
    setShowAddBroker(true);
  };

  const handleUpdateLead = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedLead) return;
    setLoading(true);
    try {
      await updateDoc(doc(db, 'leads', selectedLead.id), {
        ...editForm,
        updatedAt: serverTimestamp()
      });
      setIsEditing(false);
      setSelectedLead({ ...selectedLead, ...editForm } as Lead);
      showSaveToast('Changes saved', 'Lead details updated');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `leads/${selectedLead.id}`);
    } finally {
      setLoading(false);
    }
  };

  const approveDeal = async (leadId: string) => {
    const lead = leads.find((item) => item.id === leadId);
    if (lead && (!lead.kycAadhaarUrl || !lead.kycPanUrl)) {
      alert('Aadhaar and PAN KYC documents are required before approving this deal.');
      return;
    }

    try {
      await updateDoc(doc(db, 'leads', leadId), {
        status: 'deal_approved',
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `leads/${leadId}`);
    }
  };

  const handleVerifySiteVisit = async () => {
    if (!selectedLead || !selectedLead.siteVisitPhoto) return;

    setLoading(true);
    try {
      await updateDoc(doc(db, 'leads', selectedLead.id), {
        siteVisitVerifiedAt: serverTimestamp(),
        siteVisitVerifiedBy: user.name,
        updatedAt: serverTimestamp(),
      });

      await addDoc(collection(db, 'leads', selectedLead.id, 'followups'), {
        date: serverTimestamp(),
        remark: `${actorLabel} verified site visit photo and location evidence.`,
        employeeId: user.uid
      });

      setSelectedLead({
        ...selectedLead,
        siteVisitVerifiedAt: Timestamp.now(),
        siteVisitVerifiedBy: user.name,
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `leads/${selectedLead.id}`);
    } finally {
      setLoading(false);
    }
  };

  const adminTabs: Array<{ id: AdminView; icon: any; label: string }> = [
    { id: 'performance', icon: BarChart3, label: 'Dashboard' },
    { id: 'leads', icon: Users, label: 'Leads' },
    { id: 'employees', icon: UserPlus, label: 'Team' },
    { id: 'attendance', icon: Clock, label: 'Attendance' },
    { id: 'requirements', icon: FileText, label: 'Needs' },
    { id: 'inventory', icon: LayoutGrid, label: 'Inventory' },
    { id: 'transfer_register', icon: ArrowLeftRight, label: 'Transfers' },
    ...(isSuperAdmin ? [{ id: 'brokers' as AdminView, icon: ClipboardList, label: 'Brokers' }] : []),
  ];

  return (
    <div className="lg:h-[calc(100vh-72px)] lg:overflow-hidden">
      <div className="grid gap-0 lg:grid-cols-[236px_minmax(0,1fr)] lg:h-full">
        <aside className="hidden lg:flex lg:flex-col bg-gradient-to-b from-[#03143d] to-[#010f30] text-white p-3">
          <div className="px-3 py-2 border-b border-white/10">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-white">
                <Home size={16} />
              </span>
              <p className="text-lg font-black tracking-tight">EstatePulse</p>
            </div>
            <p className="text-[10px] uppercase tracking-widest text-white/70">{isManager ? 'Manager' : 'Admin'}</p>
          </div>
          <nav className="mt-3 flex-1 space-y-1">
            {adminTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveView(tab.id)}
                className={cn(
                  "w-full flex items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold transition-all",
                  activeView === tab.id ? "bg-blue-600/30 text-white border border-blue-300/30" : "text-white/80 hover:text-white hover:bg-white/10"
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
        <div className="min-w-0 lg:h-full lg:overflow-auto space-y-3 px-4 py-3">
      <div className="relative mb-1 lg:hidden">
        <div
          ref={tabsScrollRef}
          className="flex bg-white/50 p-1 rounded-[20px] border border-slate-100 overflow-x-auto no-scrollbar whitespace-nowrap"
        >
        {adminTabs.map(tab => (
          <button 
            key={tab.id}
            onClick={() => setActiveView(tab.id)}
            className={cn(
              "min-w-[120px] md:min-w-0 md:flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all",
              activeView === tab.id 
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

      {activeView === 'performance' ? (
        <SalesPerformanceDashboard
          user={user}
          leads={leads}
          employees={employees}
          attendance={attendance}
          scope={isManager ? 'manager' : 'admin'}
          onOpenLead={(lead) => {
            setSelectedLead(lead);
            setEditForm(lead);
            setIsEditing(false);
          }}
        />
      ) : activeView === 'leads' ? (
        <>
          <div className="rounded-2xl border border-slate-100 bg-white p-3">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-black text-slate-900">Leads Dashboard</h3>
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Condensed View</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2">
              {[
                { label: 'Total Leads', id: 'total', value: stats.total, tone: 'bg-slate-50 border-slate-200 text-slate-900' },
                { label: 'Interested', id: 'interested', value: stats.interested, tone: 'bg-emerald-50 border-emerald-200 text-emerald-800' },
                { label: 'Not Interested', id: 'not_interested', value: stats.notInterested, tone: 'bg-rose-50 border-rose-200 text-rose-800' },
                { label: 'Pending', id: 'pending', value: stats.pending, tone: 'bg-amber-50 border-amber-200 text-amber-800' },
                { label: 'Overdue', id: 'total', value: overdueCount, tone: 'bg-red-50 border-red-200 text-red-800' },
                { label: 'Today', id: 'total', value: todayFollowupsCount, tone: 'bg-blue-50 border-blue-200 text-blue-800' },
                { label: 'Site Visits', id: 'interested', value: weekSiteVisits, tone: 'bg-cyan-50 border-cyan-200 text-cyan-800' },
                { label: 'Deals', id: 'deal_approved', value: weekDeals, tone: 'bg-violet-50 border-violet-200 text-violet-800' },
              ].map((card) => (
                <button
                  key={card.label}
                  type="button"
                  onClick={() => setFilter(card.id as any)}
                  className={cn(
                    "rounded-xl border px-2 py-2 text-left transition-all",
                    card.tone,
                    filter === card.id ? "ring-2 ring-blue-300" : "hover:shadow-sm"
                  )}
                >
                  <p className="text-[9px] font-black uppercase tracking-wider opacity-80">{card.label}</p>
                  <p className="mt-1 text-lg leading-none font-black">{card.value}</p>
                </button>
              ))}
            </div>
          </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Leads List */}
        <div className="flex-1 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              {filter === 'total' ? 'All' : filter.replace('_', ' ').toUpperCase()} Leads
              <span className="text-sm font-normal text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{filteredLeads.length}</span>
            </h2>
            <div className="flex gap-2">
              <button
                onClick={deleteAssignedLeadsForTestingUsers}
                disabled={dataToolsBusy === 'clear_testing_assigned_leads'}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all shadow-md active:scale-95",
                  dataToolsBusy === 'clear_testing_assigned_leads'
                    ? "bg-gray-300 text-gray-600 cursor-not-allowed"
                    : "bg-rose-600 hover:bg-rose-700 text-white"
                )}
                title="Delete leads assigned to Tester for EE and Testing Manager"
              >
                <Trash2 size={16} />
                {dataToolsBusy === 'clear_testing_assigned_leads' ? 'Deleting...' : 'Delete Tester Leads'}
              </button>
              <button 
                onClick={() => {
                  if (leadAssignableMembers.length === 0) {
                    alert('Please add at least one employee first to enable lead allocation.');
                    return;
                  }
                  setLeadAllocationMode('auto');
                  setManualLeadAssigneeId('');
                  setShowAddLead(true);
                }}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all shadow-md active:scale-95",
                  leadAssignableMembers.length === 0 
                  ? "bg-gray-400 cursor-not-allowed text-white" 
                  : "bg-blue-600 hover:bg-blue-700 text-white"
                )}
                title={leadAssignableMembers.length === 0 ? "Add an employee first" : "Add new client"}
              >
                <Plus size={18} />
                Add Lead
              </button>
            </div>
          </div>
          <div className="relative">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={leadSearchQuery}
              onChange={e => setLeadSearchQuery(e.target.value)}
              placeholder="Search leads by name, number, source, assignee..."
              className="w-full pl-11 pr-4 py-3 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 placeholder:text-gray-400 focus:ring-4 focus:ring-blue-100 focus:border-blue-300 outline-none"
            />
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Client</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Source</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Added By</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Assigned To</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Last Follow-up</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Upcoming Follow-up</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredLeads.map((lead) => (
                    <tr 
                      key={lead.id} 
                      onClick={() => { setSelectedLead(lead); setEditForm(lead); }}
                      className="hover:bg-gray-50/50 transition-colors cursor-pointer group"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-xs">
                            {lead.name[0]}
                          </div>
                          <div>
                            <p className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">{lead.name}</p>
                            <p className="text-sm text-gray-500">{lead.phone}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-1 rounded-md uppercase tracking-tighter">
                          {lead.source}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm font-medium text-gray-600 bg-gray-100 px-2.5 py-1 rounded-lg">
                          {lead.addedByName || getAddedByRoleLabel(lead.addedByRole)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm font-medium text-gray-600 bg-gray-100 px-2.5 py-1 rounded-lg">
                          {employees.find(e => e.uid === lead.assignedTo)?.name || 'Unknown'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {lead.lastInteractionAt ? (
                          <div className="flex items-center gap-1.5">
                            <History size={12} className="text-blue-400" />
                            <p className="text-[10px] font-bold text-gray-600 uppercase tracking-tighter">
                              {formatLeadDate(lead.lastInteractionAt)}
                            </p>
                          </div>
                        ) : (
                          <span className="text-[10px] font-bold text-gray-300 uppercase italic">Never</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {lead.nextFollowupAt ? (
                          <div className="flex items-center gap-1.5">
                            <Clock3 size={12} className="text-indigo-400" />
                            <p className="text-[10px] font-bold text-gray-600 uppercase tracking-tighter">
                              {formatLeadDate(lead.nextFollowupAt)}
                            </p>
                          </div>
                        ) : (
                          <span className="text-[10px] font-bold text-gray-300 uppercase italic">Not set</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div 
                          title={`Last updated: ${formatLeadDate(lead.updatedAt || lead.createdAt)}`}
                          className={cn(
                          "inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold uppercase",
                          lead.status === 'pending' && "bg-orange-100 text-orange-600",
                          lead.status === 'interested' && "bg-green-100 text-green-600",
                          lead.status === 'not_interested' && "bg-red-100 text-red-600",
                          lead.status === 'deal_pending' && "bg-purple-100 text-purple-600",
                          lead.status === 'deal_approved' && "bg-blue-100 text-blue-600",
                        )}>
                          {lead.status.replace('_', ' ')}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        {lead.status === 'deal_pending' && (
                          <button 
                            onClick={(event) => {
                              event.stopPropagation();
                              approveDeal(lead.id);
                            }}
                            disabled={!lead.kycAadhaarUrl || !lead.kycPanUrl}
                            className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                            title={!lead.kycAadhaarUrl || !lead.kycPanUrl ? 'KYC documents required' : 'Approve deal'}
                          >
                            Approve Deal
                          </button>
                        )}
                        {lead.status === 'deal_approved' && (
                          <span className="text-green-600 flex items-center justify-end gap-1 font-bold text-xs">
                            <CheckCircle2 size={14} /> Approved
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filteredLeads.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-gray-400 font-medium">
                        No leads found in this category.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </>
    ) : activeView === 'attendance' ? (
        <MonthlyAttendanceReport
          user={user}
          members={attendanceMembers}
          attendance={attendance}
          isManager={isManager}
          attendanceLoading={attendanceLoading}
          isManagerClockedIn={isManagerClockedIn}
          onManagerAttendance={handleManagerAttendance}
          scope={isManager ? 'manager' : 'admin'}
          correctionRequests={attendanceCorrections}
          onRequestCorrection={isManager ? handleAttendanceCorrectionRequest : undefined}
          onReviewCorrection={isSuperAdmin ? handleReviewAttendanceCorrection : undefined}
        />
      ) : activeView === 'employees' ? (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Team</h2>
              <p className="text-xs text-gray-500 mt-1">
                Add managers and employees. Employee accounts can be assigned under managers.
              </p>
            </div>
            <button 
              onClick={() => {
                setEmployeeForm({ name: '', phone: '', role: 'employee', managerId: isManager ? user.uid : '' });
                setShowAddEmployee(true);
              }}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-2xl font-bold transition-all shadow-lg active:scale-95"
            >
              <UserPlus size={20} /> Add Member
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {visibleEmployees.map((emp) => (
              <motion.div 
                key={emp.uid} 
                layout
                className={cn(
                  "bg-white p-6 rounded-3xl border shadow-sm flex items-start gap-4 transition-all hover:shadow-md",
                  (emp.role === 'deleted' || emp.role === 'suspended') ? "opacity-60 border-red-100 bg-red-50/20" : "border-gray-100"
                )}
              >
                <div className={cn(
                  "w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-bold shadow-inner",
                  emp.role === 'deleted' ? "bg-gray-200 text-gray-500" : "bg-blue-600 text-white"
                )}>
                  {emp.name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="font-bold text-gray-900 truncate text-lg">{emp.name}</p>
                    <span className={cn(
                      "text-[10px] uppercase font-black px-2 py-0.5 rounded-md",
                      emp.role === 'deleted' ? "bg-red-100 text-red-600" : 
                      emp.role === 'suspended' ? "bg-orange-100 text-orange-600" :
                      emp.role === 'manager' ? "bg-violet-100 text-violet-600" :
                      "bg-green-100 text-green-600"
                    )}>
                      {emp.role}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 font-medium">{emp.phone}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{emp.email}</p>
                  {emp.role === 'employee' && (
                    <p className="text-xs text-blue-600 font-semibold mt-1">
                      Manager: {emp.managerName || 'Not assigned'}
                    </p>
                  )}
                  
                  <div className="flex gap-2 mt-4">
                    {isManager && emp.uid === user.uid ? (
                      <div className="w-full py-2 text-center bg-blue-50 text-blue-700 rounded-xl text-xs font-bold border border-blue-100">
                        Manage your account from Profile
                      </div>
                    ) : (
                      <>
                        <button 
                          onClick={() => setShowEditEmployee(emp)}
                          className="flex-1 py-2 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-xl text-xs font-bold border border-gray-200 transition-colors"
                        >
                          Edit Profile
                        </button>
                        <button
                          onClick={() => showPasswordRecoveryHelp(emp)}
                          className="flex-1 py-2 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-xl text-xs font-bold border border-amber-100 transition-colors"
                          title="Current password cannot be viewed; use reset flow"
                        >
                          Password Help
                        </button>
                        <button
                          onClick={() => resetEmployeePassword(emp)}
                          className="flex-1 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl text-xs font-bold border border-blue-100 transition-colors"
                        >
                          Reset Password
                        </button>
                        {emp.role !== 'deleted' ? (
                          <button 
                            onClick={() => deleteEmployee(emp.uid)}
                            className="py-2 px-3 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl transition-colors border border-red-100"
                            title="Delete Employee"
                          >
                            <XCircle size={16} />
                          </button>
                        ) : null}
                      </>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
            {visibleEmployees.length === 0 && (
              <div className="col-span-full py-20 text-center bg-gray-50 rounded-3xl border border-dashed border-gray-200">
                <Users size={48} className="mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500 font-bold">No team members found.</p>
                <p className="text-xs text-gray-400 mt-1">Add your first manager or employee to get started.</p>
                <button
                  onClick={() => {
                    setEmployeeForm({ name: '', phone: '', role: 'employee', managerId: isManager ? user.uid : '' });
                    setShowAddEmployee(true);
                  }}
                  className="text-blue-600 text-sm font-bold mt-2 hover:underline"
                >
                  Add member
                </button>
              </div>
            )}
          </div>
        </div>
      ) : activeView === 'requirements' ? (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <FileText className="text-blue-600" size={28} /> Client Requirements
            </h2>
            <p className="text-[10px] font-black text-slate-400 capitalize px-4 py-1.5 bg-slate-100 rounded-full tracking-widest">
              Total Recorded: {requirements.length}
            </p>
          </div>

          <div className="bg-white rounded-[32px] border border-slate-100 shadow-xl shadow-slate-200/20 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="px-8 py-5 text-[10px] font-black uppercase text-slate-400 tracking-widest">Client Details</th>
                    <th className="px-8 py-5 text-[10px] font-black uppercase text-slate-400 tracking-widest">Type</th>
                    <th className="px-8 py-5 text-[10px] font-black uppercase text-slate-400 tracking-widest">Budget/Area</th>
                    <th className="px-8 py-5 text-[10px] font-black uppercase text-slate-400 tracking-widest">Location</th>
                    <th className="px-8 py-5 text-[10px] font-black uppercase text-slate-400 tracking-widest">Employee</th>
                    <th className="px-8 py-5 text-[10px] font-black uppercase text-slate-400 tracking-widest text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {requirements.map((req) => (
                    <tr key={req.id} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-black text-lg group-hover:bg-blue-600 group-hover:text-white transition-all">
                            {req.name[0]}
                          </div>
                          <div>
                            <p className="font-black text-slate-900">{req.name}</p>
                            <p className="text-xs text-slate-400 font-bold flex items-center gap-1">
                              <Phone size={12} /> {req.phone}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <span className="px-3 py-1 bg-slate-900 text-white text-[9px] font-black uppercase rounded-full tracking-widest">
                          {req.type}
                        </span>
                      </td>
                      <td className="px-8 py-6">
                        <div>
                          <p className="text-xs font-black text-slate-700 leading-tight">₹ {req.budget || 'N/A'}</p>
                          <p className="text-[10px] text-slate-400 font-bold">{req.area || 'N/A'}</p>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-1.5 text-xs text-slate-600 font-bold">
                          <MapPin size={14} className="text-blue-500" />
                          {req.location || 'N/A'}
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <p className="text-xs font-black text-slate-700">{req.employeeName}</p>
                        <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">
                          {req.createdAt ? format(req.createdAt.toDate(), 'MMM dd, h:mm a') : 'Recently'}
                        </p>
                      </td>
                      <td className="px-8 py-6 text-right">
                        <button 
                          onClick={() => startEditRequirement(req)}
                          className="w-10 h-10 rounded-xl bg-blue-50 text-blue-500 hover:bg-blue-100 hover:text-blue-700 transition-all flex items-center justify-center shadow-inner mr-2"
                          title="Edit requirement"
                        >
                          <Edit2 size={18} />
                        </button>
                        <button 
                          onClick={() => deleteRequirement(req.id)}
                          className="w-10 h-10 rounded-xl bg-slate-50 text-slate-300 hover:bg-rose-50 hover:text-rose-600 transition-all flex items-center justify-center shadow-inner"
                        >
                          <Trash2 size={18} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {requirements.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-8 py-20 text-center">
                        <div className="w-20 h-20 bg-slate-50 text-slate-200 rounded-full flex items-center justify-center mx-auto mb-4">
                          <FileText size={40} />
                        </div>
                        <p className="text-slate-400 font-black text-xs uppercase tracking-[0.2em]">No Requirements Recorded</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : activeView === 'transfer_register' ? (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <ArrowLeftRight className="text-blue-600" size={28} /> Lead Transfer Register
            </h2>
            <p className="text-[10px] font-black text-slate-400 capitalize px-4 py-1.5 bg-slate-100 rounded-full tracking-widest">
              Total Records: {leadTransfers.length}
            </p>
          </div>

          <div className="bg-white rounded-[32px] border border-slate-100 shadow-xl shadow-slate-200/20 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="px-8 py-5 text-[10px] font-black uppercase text-slate-400 tracking-widest">When</th>
                    <th className="px-8 py-5 text-[10px] font-black uppercase text-slate-400 tracking-widest">Lead</th>
                    <th className="px-8 py-5 text-[10px] font-black uppercase text-slate-400 tracking-widest">From</th>
                    <th className="px-8 py-5 text-[10px] font-black uppercase text-slate-400 tracking-widest">To</th>
                    <th className="px-8 py-5 text-[10px] font-black uppercase text-slate-400 tracking-widest">Transferred By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {leadTransfers.map((entry) => (
                    <tr key={entry.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-8 py-5 text-xs font-bold text-slate-500">{formatLeadDate(entry.createdAt)}</td>
                      <td className="px-8 py-5 text-sm font-black text-slate-800">{entry.leadName || entry.leadId}</td>
                      <td className="px-8 py-5 text-sm font-bold text-slate-600">{entry.fromName || '-'}</td>
                      <td className="px-8 py-5 text-sm font-bold text-slate-600">{entry.toName || '-'}</td>
                      <td className="px-8 py-5 text-sm font-bold text-slate-600">{entry.transferredByName || '-'}</td>
                    </tr>
                  ))}
                  {leadTransfers.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-8 py-20 text-center text-slate-400 font-black text-xs uppercase tracking-[0.2em]">
                        No Transfer Records
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : activeView === 'brokers' && isSuperAdmin ? (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Broker List</h2>
              <p className="text-xs text-gray-500 mt-1">Admin-only brokers available for inventory assignment.</p>
            </div>
            <button
              onClick={() => setShowAddBroker(true)}
              className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-2xl font-bold transition-all shadow-lg active:scale-95"
            >
              <Plus size={20} /> Add Broker
            </button>
          </div>

          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Broker</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Company</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Email</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {brokers.map((broker) => (
                    <tr key={broker.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <p className="font-bold text-gray-900">{broker.name}</p>
                        <p className="text-sm text-gray-500">{broker.phone}</p>
                      </td>
                      <td className="px-6 py-4 text-sm font-medium text-gray-600">{broker.company || '-'}</td>
                      <td className="px-6 py-4 text-sm font-medium text-gray-600">{broker.email || '-'}</td>
                      <td className="px-6 py-4 text-right">
                        <button
                          type="button"
                          onClick={() => editBroker(broker)}
                          className="inline-flex w-10 h-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors mr-2"
                          title="Edit broker"
                          aria-label="Edit broker"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteBroker(broker.id)}
                          className="inline-flex w-10 h-10 items-center justify-center rounded-xl bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                          title="Delete broker"
                          aria-label="Delete broker"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {brokers.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-6 py-16 text-center text-gray-400 font-medium">
                        No brokers added yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : activeView === 'inventory' ? (
        <InventoryManagement user={user} />
      ) : null}

      {/* Reallocate Leads Modal */}
      {showReallocateModal && reallocateEmployee && (
        <div className="fixed inset-0 z-[110] bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-lg bg-white rounded-[40px] overflow-hidden shadow-2xl flex flex-col"
          >
            <div className="p-8 border-b border-gray-100 bg-orange-50/50">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-14 h-14 rounded-2xl bg-orange-500 text-white flex items-center justify-center shadow-lg shadow-orange-200">
                  <ArrowLeftRight size={28} />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-gray-900 tracking-tight">Reallocate Leads</h3>
                  <p className="text-sm text-gray-500 font-medium">{reallocateEmployee.name} has {reallocateLeadsCount} active leads</p>
                </div>
              </div>
              <p className="text-sm text-orange-700 bg-orange-100/50 p-4 rounded-2xl font-medium border border-orange-200">
                You must reassign these leads before changing the member's status to <strong>{pendingRole}</strong>.
              </p>
            </div>

            <div className="p-8 space-y-6">
              <div className="space-y-4">
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Allocation Method</label>
                <div className="grid grid-cols-2 gap-3">
                  <button 
                    onClick={() => setReallocateToMethod('auto')}
                    className={cn(
                      "p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-2",
                      reallocateToMethod === 'auto' ? "border-blue-500 bg-blue-50/50" : "border-gray-100 hover:border-gray-200"
                    )}
                  >
                    <Users size={20} className={reallocateToMethod === 'auto' ? "text-blue-600" : "text-gray-400"} />
                    <span className="font-bold text-sm">Automatic</span>
                  </button>
                  <button 
                    onClick={() => setReallocateToMethod('manual')}
                    className={cn(
                      "p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-2",
                      reallocateToMethod === 'manual' ? "border-blue-500 bg-blue-50/50" : "border-gray-100 hover:border-gray-200"
                    )}
                  >
                    <UserPlus size={20} className={reallocateToMethod === 'manual' ? "text-blue-600" : "text-gray-400"} />
                    <span className="font-bold text-sm">To Person</span>
                  </button>
                </div>
              </div>

              {reallocateToMethod === 'manual' && (
                <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Select Target Recipient</label>
                  <select 
                    value={targetEmployeeId}
                    onChange={e => setTargetEmployeeId(e.target.value)}
                    className="w-full px-6 py-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-4 focus:ring-blue-100 outline-none font-bold text-gray-700"
                  >
                    <option value="">-- Choose Employee --</option>
                    {leadAssignableMembers
                      .filter(e => e.uid !== reallocateEmployee.uid)
                      .map(e => <option key={e.uid} value={e.uid}>{e.name} ({leads.filter(l => l.assignedTo === e.uid).length} leads)</option>)}
                  </select>
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button 
                  onClick={() => { setShowReallocateModal(false); setReallocateEmployee(null); }}
                  className="flex-1 py-4 font-bold text-gray-500 bg-gray-50 rounded-2xl hover:bg-gray-100 transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleReallocateAndChangeStatus}
                  disabled={loading || (reallocateToMethod === 'manual' && !targetEmployeeId)}
                  className="flex-[2] py-4 bg-blue-600 text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-xl shadow-blue-200 hover:bg-blue-700 transition-all active:scale-95 disabled:opacity-30"
                >
                  {loading ? 'Reallocating...' : `Confirm & Reallocate ${reallocateLeadsCount} Leads`}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Lead Detail & Edit Modal */}
      {selectedLead && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, y: 30 }} 
            animate={{ opacity: 1, y: 0 }} 
            className="bg-white rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl"
          >
            <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center text-white font-bold text-xl">
                  {selectedLead.name[0]}
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900">{selectedLead.name}</h3>
                  <p className="text-sm text-gray-500">{selectedLead.phone}</p>
                </div>
              </div>
              <button onClick={() => { setSelectedLead(null); setIsEditing(false); }} className="p-2 hover:bg-red-100 rounded-full text-gray-400 hover:text-red-500 transition-colors">
                <XCircle size={24} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8">
              {!isEditing ? (
                <div className="space-y-8">
                  <div className="grid grid-cols-2 gap-6">
                    <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Status</p>
                      <p className={cn("text-lg font-bold", 
                        selectedLead.status === 'interested' ? "text-green-600" :
                        selectedLead.status === 'deal_pending' ? "text-purple-600" :
                        selectedLead.status === 'deal_approved' ? "text-blue-600" : "text-gray-900"
                      )}>
                        {selectedLead.status.replace('_', ' ').toUpperCase()}
                      </p>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Lead Source</p>
                      <p className="text-lg font-bold text-gray-900 uppercase">
                        {selectedLead.source}
                      </p>
                    </div>
                    {selectedLead.lastInteractionAt && (
                      <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100 col-span-2 shadow-inner">
                        <p className="text-xs font-bold text-blue-400 uppercase tracking-widest mb-1 flex items-center gap-2">
                          <History size={12} /> Last Follow-up Interaction
                        </p>
                        <p className="text-sm font-bold text-blue-700">
                          {formatLeadDate(selectedLead.lastInteractionAt)}
                        </p>
                      </div>
                    )}
                    <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 relative group">
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Assigned To</p>
                      <div className="flex items-center justify-between">
                        <p className="text-lg font-bold text-gray-900">
                          {employees.find(e => e.uid === selectedLead.assignedTo)?.name || 'Unknown'}
                        </p>
                        <button 
                          onClick={() => setShowTransferModal(true)}
                          className="p-1.5 bg-orange-50 text-orange-600 rounded-lg opacity-0 group-hover:opacity-100 transition-all hover:bg-orange-100"
                        >
                          <ArrowLeftRight size={14} />
                        </button>
                      </div>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Added By</p>
                      <p className="text-lg font-bold text-gray-900">
                        {selectedLead.addedByName || getAddedByRoleLabel(selectedLead.addedByRole)}
                      </p>
                    </div>
                  </div>

                  {(selectedLead.kycAadhaarUrl || selectedLead.kycPanUrl || selectedLead.status === 'deal_pending' || selectedLead.status === 'deal_approved') && (
                    <div className="space-y-4 p-6 bg-indigo-50/40 rounded-[32px] border border-indigo-100">
                      <h4 className="font-bold text-gray-900 flex items-center gap-2">
                        <FileText className="text-indigo-500" size={20} /> KYC Documents
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {[
                          { label: 'Aadhaar Card', url: selectedLead.kycAadhaarUrl, name: selectedLead.kycAadhaarName },
                          { label: 'PAN Card', url: selectedLead.kycPanUrl, name: selectedLead.kycPanName },
                        ].map((docItem) => (
                          <div key={docItem.label} className="p-4 bg-white rounded-2xl border border-indigo-100">
                            <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-2">{docItem.label}</p>
                            {docItem.url ? (
                              <a
                                href={docItem.url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-sm font-bold text-blue-600 hover:underline break-all"
                              >
                                {docItem.name || 'View document'}
                              </a>
                            ) : (
                              <p className="text-sm font-bold text-rose-500">Missing</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Quick Interaction Panel for Admin */}
                  <div className="space-y-4 p-6 bg-blue-50/30 rounded-[32px] border border-blue-100/50">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-gray-900 flex items-center gap-2">
                        <MessageSquare className="text-blue-500" size={20} /> Quick Interaction
                      </h4>
                    </div>
                    <div className="space-y-4">
                      <textarea
                        placeholder="Add a remark as Admin..."
                        value={interactionRemark}
                        onChange={e => setInteractionRemark(e.target.value)}
                        className="w-full h-24 px-4 py-3 bg-white border border-gray-200 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none transition-all resize-none font-medium text-sm"
                      />
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Next Followup</label>
                          <input
                            type="date"
                            value={nextFollowupDate}
                            onChange={e => setNextFollowupDate(e.target.value)}
                            className="px-4 py-2 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-medium h-[42px]"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Quick Status</label>
                          <div className="flex gap-2">
                            <button 
                              onClick={() => handleInteraction('interested')}
                              disabled={loading || !interactionRemark}
                              className="flex-1 bg-green-600 text-white font-bold rounded-xl text-xs hover:bg-green-700 shadow-md transition-all active:scale-95 disabled:opacity-50 h-[42px]"
                            >
                              Interested
                            </button>
                            <button 
                              onClick={() => handleInteraction('not_interested')}
                              disabled={loading || !interactionRemark}
                              className="flex-1 bg-red-600 text-white font-bold rounded-xl text-xs hover:bg-red-700 shadow-md transition-all active:scale-95 disabled:opacity-50 h-[42px]"
                            >
                              Declined
                            </button>
                          </div>
                        </div>
                      </div>
                      <button 
                        onClick={() => handleInteraction(selectedLead.status)}
                        disabled={loading || !interactionRemark}
                        className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl text-sm shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all disabled:opacity-50 active:scale-95 flex items-center justify-center gap-2"
                      >
                        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                        Update Remark {nextFollowupDate && '& Schedule'}
                      </button>
                    </div>
                  </div>

                  {selectedLead.siteVisitPhoto && (
                    <div className="space-y-4 p-6 bg-violet-50/40 rounded-[32px] border border-violet-100">
                      <div className="flex items-center justify-between gap-3">
                        <h4 className="font-bold text-gray-900 flex items-center gap-2">
                          <MapPin className="text-violet-500" size={20} /> Site Visit Verification
                        </h4>
                        {selectedLead.siteVisitVerifiedAt ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-100 text-green-700 text-[10px] font-black uppercase tracking-widest">
                            <CheckCircle2 size={12} /> Verified
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-3 py-1 rounded-full bg-amber-100 text-amber-700 text-[10px] font-black uppercase tracking-widest">
                            Pending Verify
                          </span>
                        )}
                      </div>

                      <a
                        href={selectedLead.siteVisitPhoto}
                        target="_blank"
                        rel="noreferrer"
                        className="block rounded-2xl overflow-hidden border border-violet-100 shadow-sm bg-white"
                        title="Open full image"
                      >
                        <img
                          src={selectedLead.siteVisitPhoto}
                          alt="Site visit evidence"
                          className="w-full h-64 object-cover hover:scale-[1.01] transition-transform"
                          referrerPolicy="no-referrer"
                        />
                      </a>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="p-3 bg-white rounded-xl border border-violet-100">
                          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Captured At</p>
                          <p className="text-sm font-bold text-gray-800">
                            {selectedLead.siteVisitAt ? formatLeadDate(selectedLead.siteVisitAt) : 'Not available'}
                          </p>
                        </div>
                        <div className="p-3 bg-white rounded-xl border border-violet-100">
                          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">GPS Coordinates</p>
                          <p className="text-sm font-bold text-gray-800 break-all">
                            {selectedLead.siteVisitLocation
                              ? `${selectedLead.siteVisitLocation.latitude.toFixed(6)}, ${selectedLead.siteVisitLocation.longitude.toFixed(6)}`
                              : 'Not available'}
                          </p>
                        </div>
                      </div>

                      {selectedLead.siteVisitVerifiedAt ? (
                        <p className="text-xs font-semibold text-green-700 bg-green-50 border border-green-100 rounded-xl px-3 py-2">
                          Verified by {selectedLead.siteVisitVerifiedBy || 'Admin'} on {formatLeadDate(selectedLead.siteVisitVerifiedAt)}.
                        </p>
                      ) : (
                        <button
                          onClick={handleVerifySiteVisit}
                          disabled={loading}
                          className="w-full py-3 bg-violet-600 text-white font-bold rounded-xl shadow-lg shadow-violet-100 hover:bg-violet-700 transition-all active:scale-95 disabled:opacity-50"
                        >
                          {loading ? 'Verifying...' : 'Verify Site Visit Evidence'}
                        </button>
                      )}
                    </div>
                  )}

                  <div className="space-y-3">
                    <h4 className="font-bold text-gray-900 flex items-center gap-2">
                       <History size={18} className="text-gray-400" /> Interaction Timeline
                    </h4>
                    <div className="space-y-4">
                       <LeadTimeline leadId={selectedLead.id} />
                    </div>
                  </div>

                  <button 
                    onClick={() => setIsEditing(true)}
                    className="w-full py-4 bg-blue-600 text-white font-bold rounded-2xl shadow-lg hover:bg-blue-700 transition-all flex items-center justify-center gap-2"
                  >
                    Edit Everything
                  </button>
                </div>
              ) : (
                <form onSubmit={handleUpdateLead} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Full Name</label>
                      <input required value={editForm.name || ''} onChange={e => setEditForm({...editForm, name: e.target.value})} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Mobile</label>
                      <input required value={editForm.phone || ''} onChange={e => setEditForm({...editForm, phone: e.target.value})} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Source</label>
                      <input required value={editForm.source || ''} onChange={e => setEditForm({...editForm, source: e.target.value})} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" placeholder="e.g. Facebook, Website, Referral" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Update Status</label>
                      <select value={editForm.status || ''} onChange={e => setEditForm({...editForm, status: e.target.value as any})} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="pending">Pending</option>
                        <option value="interested">Interested</option>
                        <option value="not_interested">Not Interested</option>
                        <option value="deal_pending">Deal Submitted</option>
                        <option value="deal_approved">Deal Approved</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Re-assign To</label>
                      <select value={editForm.assignedTo || ''} onChange={e => setEditForm({...editForm, assignedTo: e.target.value})} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500">
                        {leadAssignableMembers.map(e => <option key={e.uid} value={e.uid}>{e.name}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="flex gap-3 pt-4 border-t border-gray-100">
                    <button type="button" onClick={() => setIsEditing(false)} className="flex-1 py-4 font-bold text-gray-500 bg-gray-100 rounded-2xl hover:bg-gray-200 transition-colors">Cancel</button>
                    <button type="submit" disabled={loading} className="flex-1 py-4 bg-blue-600 text-white font-bold rounded-2xl shadow-xl shadow-blue-200 active:scale-95 transition-all">
                      {loading ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </motion.div>
        </div>
      )}

      {/* Edit Employee Modal */}
      {showEditEmployee && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-gray-900">Edit Member</h3>
              <button onClick={() => setShowEditEmployee(null)} className="text-gray-400 hover:text-gray-600"><XCircle size={24} /></button>
            </div>
            <form onSubmit={handleUpdateEmployee} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Full Name</label>
                <input 
                  required 
                  value={showEditEmployee.name} 
                  onChange={e => setShowEditEmployee({...showEditEmployee, name: e.target.value})} 
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" 
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Mobile Number</label>
                <input 
                  required 
                  value={showEditEmployee.phone} 
                  onChange={e => setShowEditEmployee({...showEditEmployee, phone: e.target.value})} 
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" 
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Role / Status</label>
                <select 
                  value={showEditEmployee.role} 
                  onChange={e => setShowEditEmployee({...showEditEmployee, role: e.target.value as any})}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="manager" disabled={!isSuperAdmin}>Manager</option>
                  <option value="employee">Active Employee</option>
                  <option value="suspended">Suspended</option>
                </select>
              </div>
              {showEditEmployee.role === 'employee' && (
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Assigned Manager</label>
                  <select
                    value={showEditEmployee.managerId || ''}
                    onChange={e => setShowEditEmployee({ ...showEditEmployee, managerId: e.target.value, managerName: managers.find((m) => m.uid === e.target.value)?.name })}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="">No manager assigned</option>
                    {managers.map((manager) => (
                      <option key={manager.uid} value={manager.uid}>{manager.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowEditEmployee(null)} className="flex-1 py-3 font-bold text-gray-500 hover:bg-gray-100 rounded-xl transition-colors">Cancel</button>
                <button type="submit" disabled={loading} className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl shadow-lg shadow-blue-200 active:scale-95 transition-all">
                  {loading ? 'Saving...' : 'Update Member'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Modals */}
      {showTransferModal && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 text-left">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md bg-white rounded-[32px] overflow-hidden shadow-2xl flex flex-col"
          >
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-xl font-bold text-gray-900">Re-assign Lead</h3>
              <button onClick={() => setShowTransferModal(false)} className="p-2 hover:bg-gray-100 rounded-full text-gray-400">
                <XCircle size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="relative">
                <input
                  placeholder="Search employee..."
                  value={transferSearch}
                  onChange={e => setTransferSearch(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                />
              </div>
              <div className="max-h-64 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                {leadAssignableMembers
                  .filter(emp => emp.name.toLowerCase().includes(transferSearch.toLowerCase()))
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
              </div>
            </div>
          </motion.div>
        </div>
      )}

      </div>
      </div>

      {showAddLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/50 backdrop-blur-sm">
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl max-h-[92vh] overflow-y-auto">
            <h3 className="text-2xl font-bold mb-7 text-gray-900">Add New Lead</h3>
            <form onSubmit={handleAddLead} className="space-y-5">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Customer Name <span className="text-rose-500">*</span></label>
                <input required value={leadForm.name} onChange={e => setLeadForm({...leadForm, name: e.target.value})} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Enter name" />
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
                  onChange={e => setLeadForm({...leadForm, phone: normalizePhone(e.target.value).slice(0, 10)})}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="10-digit mobile"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Source <span className="text-rose-500">*</span></label>
                <input required value={leadForm.source} onChange={e => setLeadForm({...leadForm, source: e.target.value})} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" placeholder="e.g. Website, Instagram, Outdoor" />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Allocation Mode</label>
                <div className="grid grid-cols-2 gap-2 p-1 bg-gray-100 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setLeadAllocationMode('auto')}
                    className={cn(
                      "py-2 text-sm font-bold rounded-lg transition-colors",
                      leadAllocationMode === 'auto' ? "bg-white text-blue-600 shadow-sm" : "text-gray-600 hover:text-gray-800"
                    )}
                  >
                    Automatic
                  </button>
                  <button
                    type="button"
                    onClick={() => setLeadAllocationMode('manual')}
                    className={cn(
                      "py-2 text-sm font-bold rounded-lg transition-colors",
                      leadAllocationMode === 'manual' ? "bg-white text-blue-600 shadow-sm" : "text-gray-600 hover:text-gray-800"
                    )}
                  >
                    Manual
                  </button>
                </div>
              </div>
              {leadAllocationMode === 'manual' && (
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Assign To (Active Employee)</label>
                  <select
                    required
                    value={manualLeadAssigneeId}
                    onChange={e => setManualLeadAssigneeId(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="">Select employee</option>
                    {leadAssignableMembers
                      .map(emp => (
                        <option key={emp.uid} value={emp.uid}>{emp.name} ({emp.phone})</option>
                      ))}
                  </select>
                </div>
              )}
              <div className="flex gap-3 pt-6 mt-2 border-t border-gray-100">
                <button type="button" onClick={() => setShowAddLead(false)} className="flex-1 py-3.5 font-bold text-gray-500 hover:bg-gray-100 rounded-xl transition-colors">Cancel</button>
                <button type="submit" disabled={loading} className="flex-1 py-3.5 bg-blue-600 text-white font-bold rounded-xl shadow-lg shadow-blue-200 active:scale-95 transition-all">
                  {loading ? 'Adding...' : 'Allocate Lead'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {showAddEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl">
            <h3 className="text-2xl font-bold mb-6 text-gray-900">Add Member</h3>
            <form onSubmit={handleAddEmployee} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Full Name <span className="text-rose-500">*</span></label>
                <input required value={employeeForm.name} onChange={e => setEmployeeForm({...employeeForm, name: e.target.value})} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Role</label>
                <select
                  value={employeeForm.role}
                  onChange={e => setEmployeeForm({ ...employeeForm, role: e.target.value as 'employee' | 'manager', managerId: isManager ? user.uid : '' })}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="employee">Employee</option>
                  {isSuperAdmin && <option value="manager">Manager</option>}
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Mobile Number <span className="text-rose-500">*</span></label>
                <input
                  required
                  type="tel"
                  inputMode="numeric"
                  minLength={10}
                  maxLength={15}
                  value={employeeForm.phone}
                  onChange={e => setEmployeeForm({...employeeForm, phone: e.target.value})}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              {employeeForm.role === 'employee' && !isManager && (
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Assign Manager</label>
                  <select
                    value={employeeForm.managerId}
                    onChange={e => setEmployeeForm({ ...employeeForm, managerId: e.target.value })}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="">No manager assigned</option>
                    {managers.map((manager) => (
                      <option key={manager.uid} value={manager.uid}>{manager.name}</option>
                    ))}
                  </select>
                </div>
              )}
              {employeeForm.role === 'employee' && isManager && (
                <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
                  <p className="text-xs font-black uppercase tracking-wider text-blue-600">Assigned Manager</p>
                  <p className="text-sm font-semibold text-blue-800 mt-1">{user.name}</p>
                </div>
              )}
              <p className="text-xs text-gray-500">
                Account will be created immediately. Initial password will be the mobile number.
              </p>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowAddEmployee(false)} className="flex-1 py-3 font-bold text-gray-500 hover:bg-gray-100 rounded-xl transition-colors">Cancel</button>
                <button type="submit" disabled={loading} className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl shadow-lg shadow-blue-200 active:scale-95 transition-all">
                  {loading ? 'Adding...' : 'Add Member'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {showAddBroker && isSuperAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl">
            <h3 className="text-2xl font-bold mb-6 text-gray-900">{editingBrokerId ? 'Edit Broker' : 'Add Broker'}</h3>
            <form onSubmit={handleAddBroker} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Broker Name <span className="text-rose-500">*</span></label>
                <input
                  required
                  value={brokerForm.name}
                  onChange={e => setBrokerForm({ ...brokerForm, name: e.target.value })}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Mobile Number <span className="text-rose-500">*</span></label>
                <input
                  required
                  type="tel"
                  inputMode="numeric"
                  maxLength={10}
                  value={brokerForm.phone}
                  onChange={e => setBrokerForm({ ...brokerForm, phone: normalizePhone(e.target.value).slice(0, 10) })}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Company</label>
                <input
                  value={brokerForm.company}
                  onChange={e => setBrokerForm({ ...brokerForm, company: e.target.value })}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={brokerForm.email}
                  onChange={e => setBrokerForm({ ...brokerForm, email: e.target.value })}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => { setShowAddBroker(false); setEditingBrokerId(null); setBrokerForm({ name: '', phone: '', email: '', company: '' }); }} className="flex-1 py-3 font-bold text-gray-500 hover:bg-gray-100 rounded-xl transition-colors">Cancel</button>
                <button type="submit" disabled={loading} className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl shadow-lg shadow-blue-200 active:scale-95 transition-all">
                  {loading ? (editingBrokerId ? 'Updating...' : 'Adding...') : (editingBrokerId ? 'Update Broker' : 'Add Broker')}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
      {showReqModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl">
            <h3 className="text-2xl font-bold mb-6 text-gray-900">Edit Requirement</h3>
            <form onSubmit={handleSaveRequirement} className="space-y-4">
              <input required value={reqForm.name} onChange={e => setReqForm({ ...reqForm, name: e.target.value })} placeholder="Client Name" className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" />
              <input required type="tel" inputMode="numeric" maxLength={10} value={reqForm.phone} onChange={e => setReqForm({ ...reqForm, phone: normalizePhone(e.target.value).slice(0, 10) })} placeholder="Phone" className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" />
              <input required value={reqForm.type} onChange={e => setReqForm({ ...reqForm, type: e.target.value })} placeholder="Type" className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" />
              <input value={reqForm.budget} onChange={e => setReqForm({ ...reqForm, budget: e.target.value })} placeholder="Budget" className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" />
              <input value={reqForm.area} onChange={e => setReqForm({ ...reqForm, area: e.target.value })} placeholder="Area" className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" />
              <input value={reqForm.location} onChange={e => setReqForm({ ...reqForm, location: e.target.value })} placeholder="Location" className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" />
              <textarea value={reqForm.remark} onChange={e => setReqForm({ ...reqForm, remark: e.target.value })} placeholder="Remark / Requirement" className="w-full h-24 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none resize-none" />
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setShowReqModal(false); setEditingRequirementId(null); }} className="flex-1 py-3 font-bold text-gray-500 hover:bg-gray-100 rounded-xl transition-colors">Cancel</button>
                <button type="submit" disabled={loading} className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl shadow-lg shadow-blue-200 active:scale-95 transition-all">
                  {loading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
      <AnimatePresence>
        {saveToast && (
          <motion.div
            initial={{ opacity: 0, y: -14, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.96 }}
            transition={{ duration: 0.2 }}
            className="fixed top-20 right-4 z-[140] w-[300px] max-w-[calc(100vw-2rem)] rounded-2xl border border-gray-200 bg-white/95 px-4 py-3 shadow-2xl backdrop-blur"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-green-100 text-green-600 flex items-center justify-center">
                <CheckCircle2 size={18} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{saveToast.title}</p>
                <p className="text-xs text-gray-500">{saveToast.description}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

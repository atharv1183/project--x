import { useState, useEffect, useRef, FormEvent } from 'react';
import { db, auth } from '../lib/firebase';
import { 
  collection, 
  query, 
  where, 
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
import { Lead, User, Followup, Attendance, Notification, OperationType, Location, Requirement } from '../types';
import { handleFirestoreError } from '../lib/utils';
import InventoryManagement from './InventoryManagement';
import { 
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
  ChevronRight,
  Clock,
  History,
  Send,
  Loader2,
  Users,
  ArrowLeftRight,
  Bell,
  Trash2,
  PlusCircle,
  FileText,
  LayoutGrid
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

export default function EmployeeDashboard({ user }: { user: User }) {
  const [activeTab, setActiveTab] = useState<'pending' | 'today' | 'upcoming' | 'requirements' | 'inventory'>('today');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [selectedLeadIndex, setSelectedLeadIndex] = useState<number | null>(null);
  const [followups, setFollowups] = useState<Followup[]>([]);
  const [loading, setLoading] = useState(false);

  // New Requirement Form State
  const [showReqModal, setShowReqModal] = useState(false);
  const [reqForm, setReqForm] = useState({
    name: '',
    phone: '',
    type: 'zeemen',
    area: '',
    budget: '',
    location: '',
    remark: ''
  });
  const [remark, setRemark] = useState('');
  const [nextDate, setNextDate] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [visitStep, setVisitStep] = useState<'idle' | 'capture' | 'confirm' | 'verifying' | 'verified'>('idle');
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [location, setLocation] = useState<{ latitude: number, longitude: number } | null>(null);

  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [lastAttendance, setLastAttendance] = useState<Attendance | null>(null);
  const [employees, setEmployees] = useState<User[]>([]);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferSearch, setTransferSearch] = useState('');
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);

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
        // Find the lead index in our lists
        const leadIndex = leads.findIndex(l => l.id === leadId);
        if (leadIndex !== -1) {
          setSelectedLeadIndex(leadIndex);
          setShowNotifications(false);
          // Set filter to 'all' or whichever category contains the lead if needed
          // For now just opening the modal is usually enough if leads list is populated
        } else {
          alert('Lead not found in your current list. It might have been reassigned.');
        }
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
    const q = query(collection(db, 'employeeDirectory'), where('role', '==', 'employee'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setEmployees(snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as User)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'employeeDirectory'));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!auth.currentUser) return;
    const qAttendance = query(
      collection(db, 'attendance'),
      where('uid', '==', auth.currentUser.uid)
    );

    const unsubscribe = onSnapshot(qAttendance, (snapshot) => {
      if (snapshot.empty) {
        setLastAttendance(null);
        return;
      }

      const latestAttendance = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as Attendance))
        .sort((a, b) => toMillis(b.timestamp) - toMillis(a.timestamp))[0];

      setLastAttendance(latestAttendance ?? null);
    }, (error) => handleFirestoreError(error, OperationType.GET, 'attendance'));

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
        uid: auth.currentUser.uid,
        employeeName: user.name,
        timestamp: serverTimestamp(),
        type,
        location: { latitude, longitude }
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

  useEffect(() => {
    const qLeads = query(
      collection(db, 'leads'), 
      where('assignedTo', '==', user.uid)
    );
    
    const unsubscribe = onSnapshot(qLeads, (snapshot) => {
      const allLeads = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as Lead))
        .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
      setLeads(allLeads);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'leads'));

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
    setLoading(true);

    try {
      await addDoc(collection(db, 'requirements'), {
        ...reqForm,
        employeeId: user.uid,
        employeeName: user.name,
        createdAt: serverTimestamp()
      });
      setShowReqModal(false);
      setReqForm({
        name: '',
        phone: '',
        type: 'zeemen',
        area: '',
        budget: '',
        location: '',
        remark: ''
      });
      alert('Requirement added successfully!');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'requirements');
    } finally {
      setLoading(false);
    }
  };

  const filteredLeads = leads.filter(l => {
    if (l.status === 'deal_approved' || l.status === 'not_interested') return false;
    
    let nextDateObj: Date | null = null;
    if (l.nextFollowupAt instanceof Timestamp) {
      nextDateObj = l.nextFollowupAt.toDate();
    } else {
      nextDateObj = toDateValue(l.nextFollowupAt);
    }
    
    if (activeTab === 'today') return nextDateObj && isToday(nextDateObj);
    if (activeTab === 'pending') return !nextDateObj || (isPast(nextDateObj) && !isToday(nextDateObj));
    if (activeTab === 'upcoming') return nextDateObj && isFuture(nextDateObj) && !isToday(nextDateObj);
    return false;
  });

  const currentLead = selectedLeadIndex !== null ? filteredLeads[selectedLeadIndex] : null;

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

  const handleUpdateLead = async (status: Lead['status']) => {
    if (!currentLead) return;
    if (!remark) return alert('Remark is mandatory for call made');
    setLoading(true);

    try {
      const leadRef = doc(db, 'leads', currentLead.id);
      const updateData: any = {
        status,
        lastRemark: remark,
        updatedAt: serverTimestamp(),
        lastInteractionAt: serverTimestamp(),
      };

      if (nextDate && !isNaN(new Date(nextDate).getTime())) {
        updateData.nextFollowupAt = Timestamp.fromDate(new Date(nextDate));
      } else if (status === 'not_interested' || status === 'deal_approved') {
        updateData.nextFollowupAt = deleteField();
      }

      await updateDoc(leadRef, updateData);

      await addDoc(collection(db, 'leads', currentLead.id, 'followups'), {
        date: serverTimestamp(),
        remark,
        employeeId: user.uid
      });

      setRemark('');
      setNextDate('');
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

  const startCamera = async () => {
    setVisitStep('capture');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
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
      
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(t => t.stop());
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

  const handleSiteVisit = async () => {
    if (!capturedImage || !location) return alert('Photo and Location are mandatory');
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

      setShowTransferModal(false);
      setSelectedLeadIndex(null);
      alert(`Lead successfully transferred to ${targetEmployee.name}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `leads/${currentLead.id}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Professional Header & Attendance */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white/40 backdrop-blur-2xl p-8 rounded-[48px] border border-white/40 shadow-2xl shadow-blue-900/5 ring-1 ring-black/[0.02]">
        <div className="flex items-center gap-6">
          <div className="w-20 h-20 rounded-[32px] bg-gradient-to-tr from-blue-600 to-blue-500 flex items-center justify-center text-white shadow-2xl shadow-blue-600/40 transform hover:rotate-3 transition-transform">
            <UserIcon size={40} />
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight leading-none mb-2">Hey, {user.name.split(' ')[0]}</h1>
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-2.5 h-2.5 rounded-full ring-4",
                isClockedIn ? "bg-green-500 ring-green-100 animate-pulse" : "bg-red-400 ring-red-100"
              )} />
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] font-mono">
                {isClockedIn ? "Live Tracker Active" : "Offline Mode"}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={() => handleAttendance(isClockedIn ? 'clock_out' : 'clock_in')}
            disabled={attendanceLoading}
            className={cn(
              "px-10 py-4 rounded-[24px] font-black text-sm tracking-widest uppercase transition-all active:scale-95 flex items-center gap-3 border shadow-xl",
              isClockedIn 
                ? "bg-red-50 text-red-600 border-red-100 hover:bg-red-100/50" 
                : "bg-blue-600 text-white border-transparent hover:bg-blue-700 shadow-blue-300/40"
            )}
          >
            {attendanceLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <MapPin size={22} />
            )}
            {isClockedIn ? "Check Out" : "Check In"}
          </button>
          
          <button 
            onClick={() => setShowNotifications(true)}
            className="p-4 relative bg-white border border-slate-100 rounded-[24px] hover:border-blue-200 transition-all shadow-lg shadow-slate-200/50 active:scale-95 group overflow-hidden"
          >
            <Bell size={28} className="text-slate-400 group-hover:text-blue-500 transition-colors relative z-10" />
            {notifications.filter(n => !n.read).length > 0 && (
              <span className="absolute top-3 right-3 w-7 h-7 bg-blue-600 text-white text-[11px] font-black rounded-full flex items-center justify-center border-4 border-white shadow-lg z-20">
                {notifications.filter(n => !n.read).length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Branded Statistics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-5">
        {[
          { label: 'Assigned', value: stats.total, icon: ClipboardList, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Interests', value: stats.interested, icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50' },
          { label: 'Declined', value: stats.notInterested, icon: XCircle, color: 'text-rose-500', bg: 'bg-rose-50' },
          { label: 'Followups', value: stats.pending, icon: Clock, color: 'text-amber-500', bg: 'bg-amber-50' },
          { label: 'Visits', value: leads.filter(l => l.siteVisitAt).length, icon: MapPin, color: 'text-violet-600', bg: 'bg-violet-50' },
          { label: 'Closed', value: stats.dealsApproved, icon: ShieldCheck, color: 'text-indigo-600', bg: 'bg-indigo-50' }
        ].map((item, i) => (
          <div key={i} className="bg-white p-6 rounded-[36px] border border-slate-100 shadow-xl shadow-slate-200/20 flex flex-col items-center justify-center text-center group hover:bg-slate-50 transition-all">
            <div className={cn("w-14 h-14 rounded-3xl flex items-center justify-center mb-4 transition-all duration-500 group-hover:scale-110 shadow-inner", item.bg, item.color)}>
              <item.icon size={26} />
            </div>
            <p className="text-3xl font-black text-slate-900 tracking-tighter">{item.value}</p>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mt-1.5">{item.label}</p>
          </div>
        ))}
      </div>

      {/* Tab Navigation */}
      <div className="flex bg-white/50 p-1.5 rounded-[24px] border border-slate-100 mb-8 sticky top-20 z-10 overflow-x-auto no-scrollbar whitespace-nowrap">
        {[
          { id: 'pending', icon: Clock, label: 'Pending' },
          { id: 'today', icon: Calendar, label: 'Today' },
          { id: 'upcoming', icon: TrendingUp, label: 'Upcoming' },
          { id: 'requirements', icon: FileText, label: 'Needs' },
          { id: 'inventory', icon: LayoutGrid, label: 'Inventory' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => { setActiveTab(tab.id as any); setSelectedLeadIndex(null); }}
            className={cn(
              "flex-1 flex items-center justify-center gap-3 py-3.5 px-6 rounded-2xl text-xs font-black uppercase tracking-widest transition-all",
              activeTab === tab.id 
                ? "bg-slate-900 text-white shadow-xl shadow-slate-200" 
                : "text-slate-400 hover:text-slate-600 hover:bg-white"
            )}
          >
            <tab.icon size={16} /> {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'requirements' ? (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-black text-slate-800 tracking-tight">Requirement List</h2>
            <button 
              onClick={() => setShowReqModal(true)}
              className="px-6 py-3 bg-blue-600 text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-xl shadow-blue-200 hover:bg-blue-700 transition-all flex items-center gap-2"
            >
              <PlusCircle size={18} /> Add New Requirement
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {requirements.map(req => (
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

                <div>
                  <h3 className="font-black text-slate-900 text-lg tracking-tight">{req.name}</h3>
                  <div className="flex items-center gap-2 text-slate-400 font-bold text-xs mt-1">
                    <Phone size={14} /> {req.phone}
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
                      <MapPin size={10} className="text-blue-500" /> {req.location || 'N/A'}
                    </p>
                  </div>
                </div>

                {req.remark && (
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Remark / Requirement</p>
                    <p className="text-xs text-slate-600 leading-relaxed font-medium line-clamp-2">{req.remark}</p>
                  </div>
                )}
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
      ) : activeTab === 'inventory' ? (
        <InventoryManagement user={user} />
      ) : (
        <div className="flex flex-col lg:flex-row gap-6">
        {/* Leads List Side */}
        <div className={cn("w-full lg:w-[400px] space-y-4", selectedLeadIndex !== null && "hidden lg:block")}>
          <div className="flex items-center justify-between px-4">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] font-mono">
              {activeTab} Queue ({filteredLeads.length})
            </h3>
          </div>
          <div className="space-y-3 max-h-[calc(100vh-450px)] overflow-y-auto pr-2 custom-scrollbar">
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
                  "w-full text-left p-5 rounded-[32px] border transition-all duration-300 flex items-center gap-4 group",
                  selectedLeadIndex === idx 
                    ? "bg-white border-blue-500 shadow-2xl shadow-blue-900/10 ring-4 ring-blue-50/50" 
                    : "bg-white border-slate-100 shadow-xl shadow-slate-200/10 hover:border-blue-200"
                )}
              >
                <div className={cn(
                  "w-12 h-12 rounded-2xl flex items-center justify-center font-black text-lg transition-all duration-500",
                  selectedLeadIndex === idx 
                    ? "bg-blue-600 text-white rotate-3 scale-110 shadow-lg shadow-blue-200" 
                    : "bg-slate-50 text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-600 group-hover:rotate-6"
                )}>
                  {lead.name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-black text-slate-800 truncate tracking-tight">{lead.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Phone size={10} className="text-slate-300" />
                    <p className="text-[10px] text-slate-400 font-bold tracking-tight">
                      {lead.phone}
                    </p>
                  </div>
                  {lead.lastInteractionAt && (
                    <div className="flex items-center gap-1 mt-1">
                      <History size={10} className="text-blue-400" />
                      <p className="text-[9px] text-blue-500 font-black uppercase tracking-tighter">
                        Last: {formatDateValue(lead.lastInteractionAt, 'MMM dd, HH:mm')}
                      </p>
                    </div>
                  )}
                </div>
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center transition-all",
                  selectedLeadIndex === idx ? "bg-blue-100 text-blue-600" : "bg-slate-50 text-slate-300 group-hover:bg-blue-50 group-hover:text-blue-400"
                )}>
                  <ChevronRight size={16} className={cn("transition-transform", selectedLeadIndex === idx && "translate-x-0.5")} />
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
                <div className="p-8 md:p-10 bg-slate-50/50 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div className="flex items-center gap-6">
                    <div className="w-20 h-20 rounded-[32px] bg-blue-600 flex items-center justify-center text-white text-3xl font-black shadow-2xl shadow-blue-200 ring-8 ring-blue-50">
                      {currentLead.name[0]}
                    </div>
                    <div>
                      <h2 className="text-3xl font-black text-slate-900 tracking-tight">{currentLead.name}</h2>
                      <div className="flex flex-wrap items-center gap-4 mt-2">
                        <a href={`tel:${currentLead.phone}`} className="bg-white px-4 py-1.5 rounded-full shadow-sm border border-slate-100 text-blue-600 font-black text-[11px] uppercase tracking-widest hover:bg-blue-50 transition-all flex items-center gap-2">
                          <Phone size={12} /> {currentLead.phone}
                        </a>
                        <div className="flex items-center gap-2 text-slate-400 font-bold text-[10px] uppercase tracking-widest">
                          <Clock size={12} /> Added {formatDateValue(currentLead.createdAt, 'MMM dd', 'Unknown')}
                        </div>
                        {currentLead.lastInteractionAt && (
                          <div className="flex items-center gap-2 text-blue-500 font-black text-[10px] uppercase tracking-widest bg-blue-50 px-3 py-1 rounded-full border border-blue-100">
                            <History size={12} /> Last Follow-up: {formatDateValue(currentLead.lastInteractionAt, 'MMM dd, hh:mm a', 'N/A')}
                          </div>
                        )}
                        <div className="bg-slate-900 text-white px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-[0.2em]">
                          {currentLead.source}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => setShowTransferModal(true)} className="px-5 py-2.5 bg-white border border-slate-200 rounded-2xl text-orange-600 hover:bg-orange-50 transition-all shadow-sm flex items-center gap-2 font-black text-[11px] uppercase tracking-widest">
                      <ArrowLeftRight size={16} /> Transfer
                    </button>
                    <button onClick={() => setShowHistory(!showHistory)} className="px-5 py-2.5 bg-white border border-slate-200 rounded-2xl text-slate-600 hover:bg-slate-50 transition-all shadow-sm flex items-center gap-2 font-black text-[11px] uppercase tracking-widest">
                      <History size={16} /> History
                    </button>
                    <button 
                      onClick={() => {
                        const nextIdx = filteredLeads.indexOf(currentLead) + 1;
                        if (nextIdx < filteredLeads.length) setSelectedLeadIndex(nextIdx);
                        else setSelectedLeadIndex(null);
                      }}
                      className="px-5 py-2.5 bg-blue-600 text-white rounded-2xl shadow-xl shadow-blue-100 hover:bg-blue-700 transition-all flex items-center gap-2 font-black text-[11px] uppercase tracking-widest"
                    >
                      Next <ChevronRight size={16} />
                    </button>
                  </div>
                </div>

                <div className="flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-slate-100">
                  {/* Action Panel */}
                  <div className="flex-1 p-8 md:p-10 space-y-10">
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
                          onClick={() => handleUpdateLead(currentLead.status)}
                          disabled={loading || !remark.trim() || !nextDate}
                          className="flex-1 h-[56px] bg-blue-600 text-white font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-blue-700 shadow-2xl shadow-blue-200 disabled:opacity-30 disabled:grayscale transition-all active:scale-95"
                        >
                          Save & Schedule
                        </button>
                      </div>
                    </div>

                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => handleUpdateLead('interested')}
                          disabled={loading || !remark.trim()}
                          className="flex-1 py-3 bg-green-50 text-green-600 font-black text-[10px] uppercase tracking-[0.2em] rounded-xl hover:bg-green-100 transition-colors disabled:opacity-30"
                        >
                          Interested
                        </button>
                        <button 
                          onClick={() => handleUpdateLead('not_interested')}
                          disabled={loading || !remark.trim()}
                          className="flex-1 py-3 bg-rose-50 text-rose-600 font-black text-[10px] uppercase tracking-[0.2em] rounded-xl hover:bg-rose-100 transition-colors disabled:opacity-30"
                        >
                          Not Interested
                        </button>
                      </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-slate-100">
                      <button 
                        onClick={startCamera}
                        className="p-6 border-2 border-dashed border-slate-200 rounded-[32px] flex flex-col items-center justify-center gap-3 text-blue-600 hover:bg-blue-50 transition-all hover:border-blue-300 group"
                      >
                        <Camera className="w-8 h-8 group-hover:scale-110 transition-transform text-blue-500" />
                        <span className="font-black text-xs uppercase tracking-widest">Real-time Site Visit</span>
                      </button>
                      <button 
                        onClick={() => handleUpdateLead('deal_pending')}
                        className="p-6 bg-slate-900 border border-slate-800 rounded-[32px] flex flex-col items-center justify-center gap-3 text-white hover:bg-black shadow-2xl shadow-slate-200 transition-all active:scale-95 group"
                      >
                        <ShieldCheck className="w-8 h-8 group-hover:scale-110 transition-transform text-indigo-400" />
                        <span className="font-black text-xs uppercase tracking-widest">Submit for Review</span>
                      </button>
                    </div>
                  </div>

                  {/* Sidebar Info/History */}
                  {showHistory && (
                    <div className="w-full md:w-80 bg-gray-50/50 p-6 md:p-8">
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
              <div className="flex-1 bg-white rounded-3xl border border-dashed border-gray-200 py-32 flex flex-col items-center justify-center text-center px-8">
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

      {/* Site Visit Workflows */}
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
                  <textarea
                    placeholder="Search employee by name..."
                    value={transferSearch}
                    onChange={e => setTransferSearch(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none transition-all h-12"
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
                    <div className="text-center py-8 text-gray-400 font-medium">No other employees found.</div>
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
              className="w-full max-w-lg bg-white rounded-[40px] overflow-hidden shadow-2xl flex flex-col"
            >
              {/* Camera Step */}
              {visitStep === 'capture' && (
                <div className="relative aspect-square bg-gray-900">
                  <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
                  <div className="absolute inset-x-0 bottom-8 flex justify-center gap-8 items-center">
                    <button 
                      onClick={() => { setVisitStep('idle'); if(videoRef.current?.srcObject) (videoRef.current.srcObject as MediaStream).getTracks().forEach(t=>t.stop()); }}
                      className="w-14 h-14 rounded-full bg-white/20 text-white flex items-center justify-center hover:bg-white/30 backdrop-blur-md"
                    >
                      <XSquare size={28} />
                    </button>
                    <button onClick={capturePhoto} className="w-24 h-24 rounded-full border-8 border-white/20 bg-white shadow-xl flex items-center justify-center group active:scale-95 transition-all">
                      <div className="w-16 h-16 rounded-full bg-red-600 group-hover:bg-red-500" />
                    </button>
                    <div className="w-14" />
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
                <div className="flex flex-col">
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

                    <div className="flex gap-3 pt-2">
                       <button 
                        onClick={() => { setCapturedImage(null); startCamera(); }}
                        disabled={visitStep === 'verifying' || loading}
                        className="flex-1 py-4 font-bold text-gray-500 hover:bg-gray-100 rounded-2xl transition-colors border border-gray-100 disabled:opacity-50"
                       >
                         Retake Photo
                       </button>

                       {visitStep === 'confirm' && (
                         <button 
                          onClick={handleVerifyLocation}
                          className="flex-[1.5] py-4 bg-blue-600 text-white font-bold rounded-2xl shadow-xl shadow-blue-100 active:scale-95 transition-all text-sm uppercase tracking-wider"
                         >
                           Verify GPS & Proceed
                         </button>
                       )}

                       {visitStep === 'verifying' && (
                         <button 
                          disabled
                          className="flex-[1.5] py-4 bg-blue-400 text-white font-bold rounded-2xl shadow-xl shadow-blue-100 transition-all text-sm uppercase tracking-wider flex items-center justify-center gap-2"
                         >
                           <Loader2 size={18} className="animate-spin" /> Verifying...
                         </button>
                       )}

                       {visitStep === 'verified' && (
                         <button 
                          onClick={handleSiteVisit}
                          disabled={loading}
                          className="flex-[1.5] py-4 bg-green-600 text-white font-bold rounded-2xl shadow-xl shadow-green-100 active:scale-95 transition-all text-sm uppercase tracking-wider flex items-center justify-center gap-2"
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

        {showReqModal && (
          <div className="fixed inset-0 z-[110] bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="w-full max-w-xl bg-white rounded-[48px] overflow-hidden shadow-2xl flex flex-col"
            >
              <form onSubmit={handleSaveRequirement}>
                <div className="p-10 border-b border-slate-100 bg-blue-50/50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-xl shadow-blue-100">
                        <PlusCircle size={32} />
                      </div>
                      <div>
                        <h3 className="text-2xl font-black text-slate-900 tracking-tight">Add Requirement</h3>
                        <p className="text-slate-400 font-bold text-xs uppercase tracking-widest mt-1">Log a new client inquiry</p>
                      </div>
                    </div>
                    <button type="button" onClick={() => setShowReqModal(false)} className="w-12 h-12 rounded-full bg-white text-slate-400 hover:text-rose-500 transition-all flex items-center justify-center shadow-sm">
                      <XSquare size={24} />
                    </button>
                  </div>
                </div>

                <div className="p-10 space-y-6 max-h-[60vh] overflow-y-auto custom-scrollbar">
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Client Name *</label>
                      <input 
                        required
                        value={reqForm.name}
                        onChange={e => setReqForm({...reqForm, name: e.target.value})}
                        className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-3xl focus:ring-4 focus:ring-blue-100 outline-none font-bold text-slate-700"
                        placeholder="Enter name"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Phone Number *</label>
                      <input 
                        required
                        value={reqForm.phone}
                        onChange={e => setReqForm({...reqForm, phone: e.target.value})}
                        className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-3xl focus:ring-4 focus:ring-blue-100 outline-none font-bold text-slate-700"
                        placeholder="10-digit number"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Requirement Type *</label>
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
                        placeholder="Budget range"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Area</label>
                      <input 
                        value={reqForm.area}
                        onChange={e => setReqForm({...reqForm, area: e.target.value})}
                        className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-3xl focus:ring-4 focus:ring-blue-100 outline-none font-bold text-slate-700"
                        placeholder="Area size"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Location</label>
                      <input 
                        value={reqForm.location}
                        onChange={e => setReqForm({...reqForm, location: e.target.value})}
                        className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-3xl focus:ring-4 focus:ring-blue-100 outline-none font-bold text-slate-700"
                        placeholder="Preferred area"
                      />
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

                <div className="p-10 bg-slate-50 border-t border-slate-100 flex gap-4">
                  <button 
                    type="button" 
                    onClick={() => setShowReqModal(false)}
                    className="flex-1 py-5 font-black text-xs uppercase tracking-widest text-slate-400 bg-white rounded-3xl border border-slate-200 hover:bg-slate-100 transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    disabled={loading}
                    className="flex-[2] py-5 bg-blue-600 text-white font-black text-xs uppercase tracking-widest rounded-3xl shadow-2xl shadow-blue-200 hover:bg-blue-700 transition-all active:scale-95 disabled:opacity-50"
                  >
                    {loading ? 'Adding...' : 'Save Requirement'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

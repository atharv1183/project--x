import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Download,
  Edit3,
  FileSpreadsheet,
  FileText,
  Loader2,
  Lock,
  MapPin,
  MessageSquare,
  Printer,
  ShieldCheck,
  Users,
  XCircle,
} from 'lucide-react';
import { Attendance, AttendanceCorrectionRequest, User } from '../types';
import { cn } from '../lib/utils';

type AttendanceStatus = 'P' | 'A' | 'HD' | 'L' | 'WO' | 'H' | 'OT';

type DailyRow = {
  key: string;
  uid: string;
  employeeName: string;
  employee: User;
  date: Date;
  day: string;
  loginTime: Date | null;
  logoutTime: Date | null;
  workingMinutes: number;
  overtimeMinutes: number;
  lateMinutes: number;
  earlyMinutes: number;
  loginLocation?: Attendance['location'] | null;
  logoutLocation?: Attendance['location'] | null;
  status: AttendanceStatus;
  remarks: string;
};

type MonthlyAttendanceReportProps = {
  user: User;
  members: User[];
  attendance: Attendance[];
  isManager: boolean;
  attendanceLoading: boolean;
  isManagerClockedIn: boolean;
  onManagerAttendance: (type: 'clock_in' | 'clock_out') => void;
  scope?: 'admin' | 'manager' | 'employee';
  correctionRequests?: AttendanceCorrectionRequest[];
  onRequestCorrection?: (request: {
    row: DailyRow;
    loginTime: Date | null;
    logoutTime: Date | null;
    remark: string;
  }) => Promise<void> | void;
  onReviewCorrection?: (request: AttendanceCorrectionRequest, status: 'approved' | 'rejected') => Promise<void> | void;
};

const STANDARD_DAY_MINUTES = 8 * 60;
const LATE_GRACE_MINUTES = 15;
const OFFICE_START_HOUR = 10;
const OFFICE_END_HOUR = 18;
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
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
  const parsed = new Date(value as string | number);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatTime(date: Date | null) {
  return date ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-';
}

function formatHours(minutes: number) {
  const safe = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safe / 60);
  const mins = safe % 60;
  if (!hours) return `${mins}m`;
  return mins ? `${hours}h ${mins}m` : `${hours}h`;
}

function getDepartment(employee: User) {
  const department = (employee as User & { department?: string }).department;
  if (department) return department;
  return employee.role === 'manager' ? 'Sales Management' : 'Sales';
}

function getBranch(employee: User) {
  return (employee as User & { branch?: string }).branch || 'Main Branch';
}

function getDesignation(employee: User) {
  return employee.role === 'manager' ? 'Manager' : 'Sales Executive';
}

function scheduledDate(date: Date, hour: number, minute = 0) {
  const next = new Date(date);
  next.setHours(hour, minute, 0, 0);
  return next;
}

function getMonthDates(year: number, month: number) {
  const days: Date[] = [];
  const cursor = new Date(year, month, 1);
  while (cursor.getMonth() === month) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

function downloadText(filename: string, content: string, type = 'text/csv;charset=utf-8') {
  const blob = new Blob([content], { type });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function toCsv(rows: Array<Record<string, string | number>>) {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const escape = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
  return [headers.join(','), ...rows.map((row) => headers.map((header) => escape(row[header])).join(','))].join('\n');
}

export default function MonthlyAttendanceReport({
  user,
  members,
  attendance,
  isManager,
  attendanceLoading,
  isManagerClockedIn,
  onManagerAttendance,
  scope = isManager ? 'manager' : 'admin',
  correctionRequests = [],
  onRequestCorrection,
  onReviewCorrection,
}: MonthlyAttendanceReportProps) {
  const now = new Date();
  const [employeeId, setEmployeeId] = useState('all');
  const [department, setDepartment] = useState('all');
  const [branch, setBranch] = useState('all');
  const [status, setStatus] = useState<'all' | AttendanceStatus>('all');
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const [locked, setLocked] = useState(false);
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [editOverrides, setEditOverrides] = useState<Record<string, { login?: Date | null; logout?: Date | null }>>({});

  const cleanMembers = useMemo(() => {
    const map = new Map<string, User>();
    members.forEach((member) => {
      if (member.uid && member.role !== 'deleted' && member.role !== 'suspended') {
        map.set(member.uid, member);
      }
    });
    if (isManager && user.uid && !map.has(user.uid)) map.set(user.uid, { ...user, role: 'manager' });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [isManager, members, user]);

  const departmentOptions = useMemo(() => Array.from(new Set(cleanMembers.map(getDepartment))).sort(), [cleanMembers]);
  const branchOptions = useMemo(() => Array.from(new Set(cleanMembers.map(getBranch))).sort(), [cleanMembers]);

  const filteredMembers = useMemo(() => {
    return cleanMembers.filter((member) => {
      if (employeeId !== 'all' && member.uid !== employeeId) return false;
      if (department !== 'all' && getDepartment(member) !== department) return false;
      if (branch !== 'all' && getBranch(member) !== branch) return false;
      return true;
    });
  }, [branch, cleanMembers, department, employeeId]);

  const selectedEmployee = employeeId === 'all' ? null : cleanMembers.find((member) => member.uid === employeeId) || null;

  const correctionByRow = useMemo(() => {
    const map = new Map<string, AttendanceCorrectionRequest>();
    correctionRequests
      .slice()
      .sort((a, b) => (toDate(b.requestedAt)?.getTime() ?? 0) - (toDate(a.requestedAt)?.getTime() ?? 0))
      .forEach((request) => {
        if (!request.uid || !request.dateKey) return;
        const key = `${request.uid}-${request.dateKey}`;
        if (!map.has(key)) map.set(key, request);
      });
    return map;
  }, [correctionRequests]);

  const approvedCorrectionByRow = useMemo(() => {
    const map = new Map<string, AttendanceCorrectionRequest>();
    correctionRequests
      .filter((request) => request.status === 'approved')
      .slice()
      .sort((a, b) => (toDate(b.reviewedAt)?.getTime() ?? toDate(b.requestedAt)?.getTime() ?? 0) - (toDate(a.reviewedAt)?.getTime() ?? toDate(a.requestedAt)?.getTime() ?? 0))
      .forEach((request) => {
        if (!request.uid || !request.dateKey) return;
        const key = `${request.uid}-${request.dateKey}`;
        if (!map.has(key)) map.set(key, request);
      });
    return map;
  }, [correctionRequests]);

  const rows = useMemo(() => {
    const days = getMonthDates(year, month);
    const logsByEmployeeDate = new Map<string, Array<{ at: Date; type: Attendance['type']; remark?: string; location?: Attendance['location'] }>>();

    attendance.forEach((record) => {
      const at = toDate(record.timestamp);
      if (!at || at.getFullYear() !== year || at.getMonth() !== month || !record.uid) return;
      const key = `${record.uid}-${dateKey(at)}`;
      const entry = {
        at,
        type: record.type,
        remark: (record as Attendance & { remark?: string }).remark,
        location: record.location,
      };
      logsByEmployeeDate.set(key, [...(logsByEmployeeDate.get(key) || []), entry]);
    });

    return filteredMembers.flatMap((employee) => {
      return days.map((dayDate) => {
        const key = `${employee.uid}-${dateKey(dayDate)}`;
        const logs = (logsByEmployeeDate.get(key) || []).sort((a, b) => a.at.getTime() - b.at.getTime());
        const override = editOverrides[key];
        const approvedCorrection = approvedCorrectionByRow.get(key);
        const correctedLogin = approvedCorrection && 'requestedLoginTime' in approvedCorrection ? toDate(approvedCorrection.requestedLoginTime) : undefined;
        const correctedLogout = approvedCorrection && 'requestedLogoutTime' in approvedCorrection ? toDate(approvedCorrection.requestedLogoutTime) : undefined;
        const loginTime = correctedLogin !== undefined
          ? correctedLogin
          : override?.login !== undefined ? override.login : logs.find((log) => log.type === 'clock_in')?.at || null;
        const logoutTime = correctedLogout !== undefined
          ? correctedLogout
          : override?.logout !== undefined ? override.logout : [...logs].reverse().find((log) => log.type === 'clock_out')?.at || null;

        let workingMinutes = 0;
        let openClockIn: Date | null = null;
        logs.forEach((log) => {
          if (log.type === 'clock_in') {
            openClockIn = log.at;
          } else if (openClockIn && log.at.getTime() >= openClockIn.getTime()) {
            workingMinutes += (log.at.getTime() - openClockIn.getTime()) / 60000;
            openClockIn = null;
          }
        });
        if (openClockIn && dateKey(dayDate) === dateKey(now)) {
          workingMinutes += (now.getTime() - openClockIn.getTime()) / 60000;
        }
        if (override?.login !== undefined || override?.logout !== undefined || approvedCorrection) {
          workingMinutes = loginTime && logoutTime && logoutTime.getTime() >= loginTime.getTime()
            ? (logoutTime.getTime() - loginTime.getTime()) / 60000
            : 0;
        }

        const weeklyOff = dayDate.getDay() === 0;
        const overtimeMinutes = Math.max(0, workingMinutes - STANDARD_DAY_MINUTES);
        const lateThreshold = scheduledDate(dayDate, OFFICE_START_HOUR, LATE_GRACE_MINUTES);
        const officeEnd = scheduledDate(dayDate, OFFICE_END_HOUR);
        const lateMinutes = loginTime && loginTime > lateThreshold ? (loginTime.getTime() - lateThreshold.getTime()) / 60000 : 0;
        const earlyMinutes = logoutTime && logoutTime < officeEnd && workingMinutes > 0 ? (officeEnd.getTime() - logoutTime.getTime()) / 60000 : 0;
        let rowStatus: AttendanceStatus = 'A';
        if (weeklyOff && logs.length === 0 && !loginTime && !logoutTime) rowStatus = 'WO';
        else if (overtimeMinutes > 0) rowStatus = 'OT';
        else if (workingMinutes >= STANDARD_DAY_MINUTES) rowStatus = 'P';
        else if (workingMinutes >= STANDARD_DAY_MINUTES / 2) rowStatus = 'HD';
        else if (logs.length > 0 || loginTime || logoutTime) rowStatus = 'HD';

        return {
          key,
          uid: employee.uid,
          employeeName: employee.name,
          employee,
          date: dayDate,
          day: dayDate.toLocaleDateString([], { weekday: 'short' }),
          loginTime,
          logoutTime,
          workingMinutes,
          overtimeMinutes,
          lateMinutes,
          earlyMinutes,
          status: rowStatus,
          remarks: approvedCorrection?.remark || remarks[key] || logs.find((log) => log.remark)?.remark || '',
          loginLocation: logs.find((log) => log.type === 'clock_in')?.location || null,
          logoutLocation: [...logs].reverse().find((log) => log.type === 'clock_out')?.location || null,
        };
      });
    }).filter((row) => status === 'all' || row.status === status);
  }, [approvedCorrectionByRow, attendance, editOverrides, filteredMembers, month, now, remarks, status, year]);

  const summary = useMemo(() => {
    const totalWorkingDays = rows.filter((row) => row.status !== 'WO' && row.status !== 'H').length;
    const presentDays = rows.filter((row) => row.status === 'P' || row.status === 'OT').length;
    const absentDays = rows.filter((row) => row.status === 'A').length;
    const halfDays = rows.filter((row) => row.status === 'HD').length;
    const lateArrivals = rows.filter((row) => row.lateMinutes > 0).length;
    const earlyLogout = rows.filter((row) => row.earlyMinutes > 0).length;
    const totalWorkingMinutes = rows.reduce((sum, row) => sum + row.workingMinutes, 0);
    const overtimeMinutes = rows.reduce((sum, row) => sum + row.overtimeMinutes, 0);
    const attendancePercent = totalWorkingDays ? (presentDays / totalWorkingDays) * 100 : 0;

    return {
      totalWorkingDays,
      presentDays,
      absentDays,
      halfDays,
      paidLeaves: 0,
      unpaidLeaves: 0,
      lateArrivals,
      earlyLogout,
      totalWorkingMinutes,
      overtimeMinutes,
      attendancePercent,
    };
  }, [rows]);

  const employeeSummaries = useMemo(() => {
    return filteredMembers.map((member) => {
      const memberRows = rows.filter((row) => row.uid === member.uid && row.status !== 'WO' && row.status !== 'H');
      const present = memberRows.filter((row) => row.status === 'P' || row.status === 'OT').length;
      const late = memberRows.filter((row) => row.lateMinutes > 0).length;
      const percent = memberRows.length ? (present / memberRows.length) * 100 : 0;
      return { member, present, late, percent };
    });
  }, [filteredMembers, rows]);

  const highestAttendance = employeeSummaries.reduce((best, item) => (!best || item.percent > best.percent ? item : best), null as null | typeof employeeSummaries[number]);
  const lowestAttendance = employeeSummaries.reduce((worst, item) => (!worst || item.percent < worst.percent ? item : worst), null as null | typeof employeeSummaries[number]);
  const mostLate = employeeSummaries.reduce((worst, item) => (!worst || item.late > worst.late ? item : worst), null as null | typeof employeeSummaries[number]);
  const teamAttendancePercent = employeeSummaries.length
    ? employeeSummaries.reduce((sum, item) => sum + item.percent, 0) / employeeSummaries.length
    : 0;

  const dailyTrend = useMemo(() => {
    const grouped = new Map<string, { label: string; present: number; absent: number; hours: number; late: number }>();
    rows.forEach((row) => {
      const key = dateKey(row.date);
      const existing = grouped.get(key) || { label: row.date.getDate().toString(), present: 0, absent: 0, hours: 0, late: 0 };
      if (row.status === 'P' || row.status === 'OT' || row.status === 'HD') existing.present += 1;
      if (row.status === 'A') existing.absent += 1;
      if (row.lateMinutes > 0) existing.late += 1;
      existing.hours += row.workingMinutes / 60;
      grouped.set(key, existing);
    });
    return Array.from(grouped.values());
  }, [rows]);

  const weeklySummary = useMemo(() => {
    const grouped = new Map<string, { label: string; present: number; absent: number; late: number }>();
    rows.forEach((row) => {
      const week = Math.ceil(row.date.getDate() / 7);
      const key = `Week ${week}`;
      const existing = grouped.get(key) || { label: key, present: 0, absent: 0, late: 0 };
      if (row.status === 'P' || row.status === 'OT' || row.status === 'HD') existing.present += 1;
      if (row.status === 'A') existing.absent += 1;
      if (row.lateMinutes > 0) existing.late += 1;
      grouped.set(key, existing);
    });
    return Array.from(grouped.values());
  }, [rows]);

  const averageDailyHours = rows.length ? rows.reduce((sum, row) => sum + row.workingMinutes, 0) / rows.length / 60 : 0;
  const mostProductiveDay = dailyTrend.reduce((best, item) => (!best || item.hours > best.hours ? item : best), null as null | typeof dailyTrend[number]);
  const maxHours = Math.max(1, ...dailyTrend.map((item) => item.hours));
  const maxPresentAbsent = Math.max(1, ...dailyTrend.map((item) => item.present + item.absent));
  const maxWeeklyLate = Math.max(1, ...weeklySummary.map((item) => item.late));

  const exportRows = rows.map((row) => ({
    Date: row.date.toLocaleDateString(),
    Day: row.day,
    Employee: row.employeeName,
    Login: formatTime(row.loginTime),
    Logout: formatTime(row.logoutTime),
    WorkingHours: formatHours(row.workingMinutes),
    LateBy: formatHours(row.lateMinutes),
    Status: row.status,
    Remarks: row.remarks || '-',
  }));

  const exportReport = (kind: 'csv' | 'excel' | 'pdf' | 'print') => {
    if (kind === 'pdf' || kind === 'print') {
      window.print();
      return;
    }
    const csv = toCsv(exportRows);
    downloadText(`monthly-attendance-${MONTHS[month]}-${year}.${kind === 'excel' ? 'xls' : 'csv'}`, csv, kind === 'excel' ? 'application/vnd.ms-excel' : 'text/csv;charset=utf-8');
  };

  const handleEditRow = (row: DailyRow) => {
    if (locked) return alert('Monthly attendance is locked.');
    const login = prompt('Login time (HH:mm)', row.loginTime ? row.loginTime.toTimeString().slice(0, 5) : '');
    if (login === null) return;
    const logout = prompt('Logout time (HH:mm)', row.logoutTime ? row.logoutTime.toTimeString().slice(0, 5) : '');
    if (logout === null) return;
    const parseTime = (value: string) => {
      if (!value.trim()) return null;
      const [hours, minutes] = value.split(':').map(Number);
      if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
      const next = new Date(row.date);
      next.setHours(hours, minutes, 0, 0);
      return next;
    };
    setEditOverrides((prev) => ({ ...prev, [row.key]: { login: parseTime(login), logout: parseTime(logout) } }));
  };

  const handleRemark = (row: DailyRow) => {
    const remark = prompt('Attendance remark', row.remarks);
    if (remark === null) return;
    setRemarks((prev) => ({ ...prev, [row.key]: remark }));
  };

  const handleRequestCorrection = async (row: DailyRow) => {
    if (!onRequestCorrection) return;
    const login = prompt('Requested login time (HH:mm). Leave blank for no login time.', row.loginTime ? row.loginTime.toTimeString().slice(0, 5) : '');
    if (login === null) return;
    const logout = prompt('Requested logout time (HH:mm). Leave blank for no logout time.', row.logoutTime ? row.logoutTime.toTimeString().slice(0, 5) : '');
    if (logout === null) return;
    const remark = prompt('Reason for correction request', row.remarks);
    if (remark === null) return;
    if (!remark.trim()) return alert('Please add a reason so admin can approve the correction.');
    const parseTime = (value: string) => {
      if (!value.trim()) return null;
      const [hours, minutes] = value.split(':').map(Number);
      if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
      const next = new Date(row.date);
      next.setHours(hours, minutes, 0, 0);
      return next;
    };
    await onRequestCorrection({ row, loginTime: parseTime(login), logoutTime: parseTime(logout), remark: remark.trim() });
  };

  const pendingCorrectionRequests = correctionRequests.filter((request) => request.status === 'pending');
  const canApproveCorrections = scope === 'admin' && Boolean(onReviewCorrection);
  const canRequestCorrections = Boolean(onRequestCorrection) && (scope === 'employee' || scope === 'manager');

  const cardData = [
    ['Total Working Days', summary.totalWorkingDays],
    ['Present Days', summary.presentDays],
    ['Absent Days', summary.absentDays],
    ['Half Days', summary.halfDays],
    ['Paid Leaves', summary.paidLeaves],
    ['Unpaid Leaves', summary.unpaidLeaves],
    ['Late Arrivals', summary.lateArrivals],
    ['Early Logout', summary.earlyLogout],
    ['Total Working Hours', formatHours(summary.totalWorkingMinutes)],
    ['Overtime Hours', formatHours(summary.overtimeMinutes)],
    ['Attendance %', `${summary.attendancePercent.toFixed(1)}%`],
  ];

  return (
    <div className="space-y-6 pb-20 print:bg-white">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-blue-700">
            <CalendarDays size={13} /> Employee Monthly Attendance Report
          </div>
          <h2 className="mt-2 text-2xl sm:text-3xl font-black tracking-tight text-slate-900">Real Estate CRM Attendance</h2>
          <p className="mt-1 text-sm font-medium text-slate-500">Presence, punctuality, working hours, overtime, and productivity summary.</p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          {isManager && (
            <button
              type="button"
              disabled={attendanceLoading}
              onClick={() => onManagerAttendance(isManagerClockedIn ? 'clock_out' : 'clock_in')}
              className={cn(
                "inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-black uppercase tracking-widest text-white shadow-md",
                isManagerClockedIn ? "bg-red-600 hover:bg-red-700" : "bg-green-600 hover:bg-green-700",
                attendanceLoading && "opacity-60"
              )}
            >
              {attendanceLoading ? <Loader2 size={14} className="animate-spin" /> : <MapPin size={14} />}
              {attendanceLoading ? 'Saving' : isManagerClockedIn ? 'Clock Out' : 'Clock In'}
            </button>
          )}
          <button onClick={() => exportReport('csv')} className="inline-flex items-center gap-2 rounded-xl bg-white border border-slate-200 px-3 py-2 text-xs font-black uppercase tracking-widest text-slate-700 hover:bg-slate-50"><Download size={14} /> CSV</button>
          <button onClick={() => exportReport('excel')} className="inline-flex items-center gap-2 rounded-xl bg-white border border-slate-200 px-3 py-2 text-xs font-black uppercase tracking-widest text-slate-700 hover:bg-slate-50"><FileSpreadsheet size={14} /> Excel</button>
          <button onClick={() => exportReport('pdf')} className="inline-flex items-center gap-2 rounded-xl bg-white border border-slate-200 px-3 py-2 text-xs font-black uppercase tracking-widest text-slate-700 hover:bg-slate-50"><FileText size={14} /> PDF</button>
          <button onClick={() => exportReport('print')} className="inline-flex items-center gap-2 rounded-xl bg-white border border-slate-200 px-3 py-2 text-xs font-black uppercase tracking-widest text-slate-700 hover:bg-slate-50"><Printer size={14} /> Print</button>
        </div>
      </div>

      <section className="rounded-3xl border border-slate-100 bg-white p-4 sm:p-5 shadow-sm print:hidden">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-6">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Employee Name</label>
            <select value={employeeId} onChange={(event) => setEmployeeId(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold text-slate-700">
              <option value="all">All Employees</option>
              {cleanMembers.map((member) => <option key={member.uid} value={member.uid}>{member.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Team/Department</label>
            <select value={department} onChange={(event) => setDepartment(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold text-slate-700">
              <option value="all">All Departments</option>
              {departmentOptions.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Branch</label>
            <select value={branch} onChange={(event) => setBranch(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold text-slate-700">
              <option value="all">All Branches</option>
              {branchOptions.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Month</label>
            <select value={month} onChange={(event) => setMonth(Number(event.target.value))} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold text-slate-700">
              {MONTHS.map((item, index) => <option key={item} value={index}>{item}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Year</label>
            <select value={year} onChange={(event) => setYear(Number(event.target.value))} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold text-slate-700">
              {Array.from({ length: 5 }, (_, index) => now.getFullYear() - 2 + index).map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Attendance Status</label>
            <select value={status} onChange={(event) => setStatus(event.target.value as 'all' | AttendanceStatus)} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold text-slate-700">
              <option value="all">All Status</option>
              {['P', 'A', 'HD', 'L', 'WO', 'H', 'OT'].map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          ['Total Employees Present', employeeSummaries.filter((item) => item.present > 0).length, Users],
          ['Highest Attendance Employee', highestAttendance ? `${highestAttendance.member.name} (${highestAttendance.percent.toFixed(0)}%)` : '-', CheckCircle2],
          ['Most Late Employee', mostLate ? `${mostLate.member.name} (${mostLate.late})` : '-', AlertTriangle],
          ['Lowest Attendance Employee', lowestAttendance ? `${lowestAttendance.member.name} (${lowestAttendance.percent.toFixed(0)}%)` : '-', XCircle],
          ['Team Attendance %', `${teamAttendancePercent.toFixed(1)}%`, ShieldCheck],
        ].map(([label, value, Icon]) => (
          <div key={label as string} className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 text-slate-400">
              <Icon size={16} />
              <p className="text-[10px] font-black uppercase tracking-widest">{label as string}</p>
            </div>
            <p className="mt-3 text-xl font-black text-slate-900">{value as string | number}</p>
          </div>
        ))}
      </section>

      <section className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {cardData.map(([label, value]) => (
          <div key={label as string} className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label as string}</p>
            <p className="mt-3 text-2xl font-black text-slate-900">{value as string | number}</p>
          </div>
        ))}
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-800">Employee Information</h3>
          <div className="mt-4 grid grid-cols-1 gap-3 text-sm">
            {[
              ['Employee ID', selectedEmployee?.uid || 'Team Report'],
              ['Employee Name', selectedEmployee?.name || 'All selected employees'],
              ['Designation', selectedEmployee ? getDesignation(selectedEmployee) : 'Mixed'],
              ['Department', selectedEmployee ? getDepartment(selectedEmployee) : department === 'all' ? 'All Departments' : department],
              ['Branch', selectedEmployee ? getBranch(selectedEmployee) : branch === 'all' ? 'All Branches' : branch],
              ['Reporting Manager', selectedEmployee?.managerName || (isManager ? user.name : 'Team Leader')],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl bg-slate-50 p-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
                <p className="mt-1 font-black text-slate-800 break-all">{value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm lg:col-span-2">
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-800">Monthly Analysis</h3>
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Average Daily Working Hours</p>
              <p className="mt-2 text-2xl font-black text-slate-900">{averageDailyHours.toFixed(1)}h</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Most Productive Day</p>
              <p className="mt-2 text-2xl font-black text-slate-900">{mostProductiveDay ? `${mostProductiveDay.label} (${mostProductiveDay.hours.toFixed(1)}h)` : '-'}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Formula</p>
              <p className="mt-2 text-sm font-black text-slate-900">Present Days / Total Working Days</p>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div>
              <p className="mb-3 text-xs font-black uppercase tracking-widest text-slate-500">Present vs Absent</p>
              <div className="flex h-44 items-end gap-1 rounded-2xl bg-slate-50 p-3">
                {dailyTrend.map((item) => (
                  <div key={item.label} className="flex flex-1 flex-col items-center gap-1">
                    <div className="w-full rounded-t bg-emerald-500" style={{ height: `${(item.present / maxPresentAbsent) * 120}px` }} />
                    <div className="w-full rounded-t bg-rose-500" style={{ height: `${(item.absent / maxPresentAbsent) * 120}px` }} />
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-3 text-xs font-black uppercase tracking-widest text-slate-500">Working Hours Trend</p>
              <div className="flex h-44 items-end gap-1 rounded-2xl bg-slate-50 p-3">
                {dailyTrend.map((item) => (
                  <div key={item.label} className="flex-1 rounded-t bg-blue-600" style={{ height: `${(item.hours / maxHours) * 140}px` }} title={`${item.label}: ${item.hours.toFixed(1)}h`} />
                ))}
              </div>
            </div>
            <div>
              <p className="mb-3 text-xs font-black uppercase tracking-widest text-slate-500">Weekly Late Report</p>
              <div className="space-y-3 rounded-2xl bg-slate-50 p-3">
                {weeklySummary.map((item) => (
                  <div key={item.label}>
                    <div className="mb-1 flex justify-between text-xs font-bold text-slate-500"><span>{item.label}</span><span>{item.late}</span></div>
                    <div className="h-5 rounded-full bg-white overflow-hidden"><div className="h-full rounded-full bg-amber-500" style={{ width: `${(item.late / maxWeeklyLate) * 100}%` }} /></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {(canApproveCorrections || canRequestCorrections) && (
      <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm print:hidden">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-sm font-black uppercase tracking-widest text-slate-800">{canApproveCorrections ? 'Admin Controls' : 'Attendance Corrections'}</h3>
            <p className="mt-1 text-xs font-medium text-slate-500">
              {canApproveCorrections
                ? 'Review employee correction requests, lock the month, and add admin remarks.'
                : 'Request login/logout changes here. Admin approval is required before changes affect the report.'}
            </p>
          </div>
          {canApproveCorrections && (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setLocked((prev) => !prev)} className={cn("inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-black uppercase tracking-widest text-white", locked ? "bg-slate-700" : "bg-amber-600")}><Lock size={14} /> {locked ? 'Unlock Month' : 'Lock Month'}</button>
          </div>
          )}
        </div>
        {canApproveCorrections && (
          <div className="mt-4 space-y-2">
            {pendingCorrectionRequests.slice(0, 8).map((request) => (
              <div key={request.id} className="flex flex-col gap-3 rounded-2xl border border-amber-100 bg-amber-50 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-black text-slate-800">{request.employeeName} - {request.dateKey}</p>
                  <p className="mt-1 text-xs font-medium text-slate-600">
                    Login {formatTime(toDate(request.requestedLoginTime))}, Logout {formatTime(toDate(request.requestedLogoutTime))} - {request.remark}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => onReviewCorrection?.(request, 'approved')} className="rounded-xl bg-emerald-600 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white">Approve</button>
                  <button type="button" onClick={() => onReviewCorrection?.(request, 'rejected')} className="rounded-xl bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-rose-600 border border-rose-100">Reject</button>
                </div>
              </div>
            ))}
            {pendingCorrectionRequests.length === 0 && <p className="rounded-2xl bg-slate-50 p-4 text-sm font-medium text-slate-400">No pending correction requests.</p>}
          </div>
        )}
      </section>
      )}

      <section className="rounded-3xl border border-slate-100 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-slate-100 p-5">
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-800">Daily Attendance Table</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                {['Date', 'Day', employeeId === 'all' ? 'Employee' : '', 'Login Time', 'Login Location', 'Logout Time', 'Logout Location', 'Working Hours', 'Late By', 'Status', 'Remarks', 'Actions'].filter(Boolean).map((header) => (
                  <th key={header} className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map((row) => (
                <tr key={row.key} className="hover:bg-slate-50/70">
                  <td className="px-4 py-3 text-sm font-bold text-slate-700">{row.date.toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-sm font-bold text-slate-500">{row.day}</td>
                  {employeeId === 'all' && <td className="px-4 py-3 text-sm font-black text-slate-800">{row.employeeName}</td>}
                  <td className="px-4 py-3 text-sm font-bold text-slate-700">{formatTime(row.loginTime)}</td>
                  <td className="px-4 py-3 text-xs font-bold text-slate-600">
                    {row.loginLocation ? (
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${row.loginLocation.latitude},${row.loginLocation.longitude}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700"
                      >
                        <MapPin size={12} /> {row.loginLocation.address || `${row.loginLocation.latitude.toFixed(5)}, ${row.loginLocation.longitude.toFixed(5)}`}
                      </a>
                    ) : '-'}
                  </td>
                  <td className="px-4 py-3 text-sm font-bold text-slate-700">{formatTime(row.logoutTime)}</td>
                  <td className="px-4 py-3 text-xs font-bold text-slate-600">
                    {row.logoutLocation ? (
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${row.logoutLocation.latitude},${row.logoutLocation.longitude}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700"
                      >
                        <MapPin size={12} /> {row.logoutLocation.address || `${row.logoutLocation.latitude.toFixed(5)}, ${row.logoutLocation.longitude.toFixed(5)}`}
                      </a>
                    ) : '-'}
                  </td>
                  <td className="px-4 py-3 text-sm font-bold text-slate-700">{formatHours(row.workingMinutes)}</td>
                  <td className="px-4 py-3 text-sm font-bold text-slate-700">{row.lateMinutes > 0 ? formatHours(row.lateMinutes) : '-'}</td>
                  <td className="px-4 py-3">
                    <span className={cn(
                      "inline-flex rounded-lg px-2.5 py-1 text-[10px] font-black uppercase tracking-widest",
                      row.status === 'P' && "bg-emerald-100 text-emerald-700",
                      row.status === 'A' && "bg-rose-100 text-rose-700",
                      row.status === 'HD' && "bg-amber-100 text-amber-700",
                      row.status === 'WO' && "bg-slate-100 text-slate-600",
                      row.status === 'OT' && "bg-blue-100 text-blue-700",
                      row.status === 'L' && "bg-purple-100 text-purple-700",
                      row.status === 'H' && "bg-cyan-100 text-cyan-700",
                    )}>{row.status}</span>
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-slate-500">{row.remarks || '-'}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 print:hidden">
                      {scope === 'admin' && (
                        <>
                          <button type="button" onClick={() => handleEditRow(row)} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50" title="Edit attendance entry"><Edit3 size={14} /></button>
                          <button type="button" onClick={() => handleRemark(row)} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50" title="Add remark"><MessageSquare size={14} /></button>
                        </>
                      )}
                      {canRequestCorrections && row.uid === user.uid && (
                        <button type="button" onClick={() => handleRequestCorrection(row)} className="rounded-lg border border-blue-100 p-2 text-blue-600 hover:bg-blue-50" title="Request correction"><Edit3 size={14} /></button>
                      )}
                      {correctionByRow.get(row.key) && (
                        <span className={cn(
                          "inline-flex items-center rounded-lg px-2.5 py-1 text-[10px] font-black uppercase tracking-widest",
                          correctionByRow.get(row.key)?.status === 'approved' && "bg-emerald-100 text-emerald-700",
                          correctionByRow.get(row.key)?.status === 'pending' && "bg-amber-100 text-amber-700",
                          correctionByRow.get(row.key)?.status === 'rejected' && "bg-rose-100 text-rose-700",
                        )}>
                          {correctionByRow.get(row.key)?.status}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={employeeId === 'all' ? 12 : 11} className="px-4 py-12 text-center text-sm font-medium text-slate-400">No attendance rows for the selected filters.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
        {[
          ['P', 'Present'],
          ['A', 'Absent'],
          ['HD', 'Half Day'],
          ['L', 'Leave'],
          ['WO', 'Weekly Off'],
          ['H', 'Holiday'],
          ['OT', 'Overtime'],
        ].map(([code, label]) => (
          <div key={code} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <p className="text-lg font-black text-slate-900">{code}</p>
            <p className="text-xs font-bold text-slate-500">{label}</p>
          </div>
        ))}
      </section>
    </div>
  );
}

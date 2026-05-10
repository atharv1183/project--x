import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  Search,
  Trophy,
  Users,
  X,
} from 'lucide-react';
import { Attendance, Lead, User } from '../types';
import { cn } from '../lib/utils';

type DatePreset =
  | 'today'
  | 'yesterday'
  | 'last_3'
  | 'last_7'
  | 'last_15'
  | 'last_30'
  | 'this_month'
  | 'last_month'
  | 'custom';

type SortKey = 'rank' | 'name' | 'score' | 'deals' | 'visits' | 'interested';
type SortDirection = 'asc' | 'desc';
type KpiKey = 'total' | 'pending' | 'notInterested' | 'interested' | 'visits' | 'deals';

type SalesPerformanceDashboardProps = {
  user: User;
  leads: Lead[];
  employees: User[];
  attendance?: Attendance[];
  scope: 'admin' | 'manager' | 'employee';
  onOpenLead?: (lead: Lead) => void;
};

type EmployeeMetrics = {
  uid: string;
  name: string;
  total: number;
  pending: number;
  notInterested: number;
  interested: number;
  visits: number;
  deals: number;
  lost: number;
  calls: number;
  followupsDone: number;
  missedFollowups: number;
  meetingsScheduled: number;
  avgResponseMs: number | null;
  loginHours: number;
  attendanceCount: number;
  dailyActivityScore: number;
  leadToInterested: number;
  leadToVisit: number;
  leadToDeal: number;
  score: number;
  sourceRows: Array<{ source: string; total: number; interested: number; visits: number; deals: number }>;
};

const SOURCE_OPTIONS = [
  'Facebook Ads',
  'Google Ads',
  'Instagram',
  'WhatsApp',
  'Referral',
  'Website',
  'MagicBricks',
  '99acres',
  'Walk-In',
  'Cold Calling',
  'Other',
];

const PRESETS: Array<{ id: DatePreset; label: string }> = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'last_3', label: 'Last 3 Days' },
  { id: 'last_7', label: 'Last 7 Days' },
  { id: 'last_15', label: 'Last 15 Days' },
  { id: 'last_30', label: 'Last 30 Days' },
  { id: 'this_month', label: 'This Month' },
  { id: 'last_month', label: 'Last Month' },
  { id: 'custom', label: 'Custom' },
];

const kpiLabels: Record<KpiKey, string> = {
  total: 'Total Leads Assigned',
  pending: 'Total Pending Leads',
  notInterested: 'Total Not Interested',
  interested: 'Total Interested Leads',
  visits: 'Total Site Visits',
  deals: 'Total Deals Closed',
};

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
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function formatInputDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getDateRange(preset: DatePreset, customFrom: string, customTo: string) {
  const now = new Date();
  const todayStart = startOfDay(now);
  let from = new Date(todayStart);
  let to = endOfDay(now);

  if (preset === 'yesterday') {
    from.setDate(from.getDate() - 1);
    to = endOfDay(from);
  } else if (preset === 'last_3') {
    from.setDate(from.getDate() - 2);
  } else if (preset === 'last_7') {
    from.setDate(from.getDate() - 6);
  } else if (preset === 'last_15') {
    from.setDate(from.getDate() - 14);
  } else if (preset === 'last_30') {
    from.setDate(from.getDate() - 29);
  } else if (preset === 'this_month') {
    from = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (preset === 'last_month') {
    from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    to = endOfDay(new Date(now.getFullYear(), now.getMonth(), 0));
  } else if (preset === 'custom') {
    from = customFrom ? startOfDay(new Date(customFrom)) : from;
    to = customTo ? endOfDay(new Date(customTo)) : to;
  }

  return { from, to };
}

function getPreviousRange(from: Date, to: Date) {
  const span = Math.max(1, to.getTime() - from.getTime());
  return {
    from: new Date(from.getTime() - span - 1),
    to: new Date(from.getTime() - 1),
  };
}

function getLeadDate(lead: Lead) {
  return toDate(lead.assignedAt) || toDate(lead.createdAt) || new Date(0);
}

function isInside(date: Date, from: Date, to: Date) {
  return date.getTime() >= from.getTime() && date.getTime() <= to.getTime();
}

function normalizeSource(source?: string) {
  const raw = (source || 'Other').trim();
  const lower = raw.toLowerCase();
  const mapped = SOURCE_OPTIONS.find((option) => option.toLowerCase() === lower);
  if (mapped) return mapped;
  if (lower.includes('facebook')) return 'Facebook Ads';
  if (lower.includes('google')) return 'Google Ads';
  if (lower.includes('insta')) return 'Instagram';
  if (lower.includes('whatsapp')) return 'WhatsApp';
  if (lower.includes('ref')) return 'Referral';
  if (lower.includes('web')) return 'Website';
  if (lower.includes('magic')) return 'MagicBricks';
  if (lower.includes('99')) return '99acres';
  if (lower.includes('walk')) return 'Walk-In';
  if (lower.includes('cold')) return 'Cold Calling';
  return raw || 'Other';
}

function isOpenLead(lead: Lead) {
  return lead.status !== 'deal_approved' && lead.status !== 'not_interested';
}

function getFirstActionDate(lead: Lead) {
  return toDate(lead.lastInteractionAt) || toDate(lead.siteVisitAt) || toDate(lead.kycUploadedAt);
}

function isPendingLead(lead: Lead) {
  return lead.status === 'pending' && !getFirstActionDate(lead) && !lead.lastRemark;
}

function formatDuration(ms: number | null) {
  if (ms === null || !Number.isFinite(ms)) return 'No data';
  const seconds = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes} min ${remainingSeconds} sec`;
  return `${remainingSeconds} sec`;
}

function percentage(part: number, total: number) {
  if (!total) return 0;
  return (part / total) * 100;
}

function computeMetrics(leads: Lead[], attendance: Attendance[], employee: Pick<User, 'uid' | 'name'>): EmployeeMetrics {
  const assigned = leads.filter((lead) => lead.assignedTo === employee.uid);
  const now = new Date();
  const respondedLeads = assigned
    .map((lead) => {
      const created = getLeadDate(lead);
      const firstAction = getFirstActionDate(lead);
      if (!firstAction || firstAction.getTime() < created.getTime()) return null;
      return firstAction.getTime() - created.getTime();
    })
    .filter((value): value is number => typeof value === 'number');

  const employeeAttendance = attendance.filter((record) => record.uid === employee.uid);
  const attendanceDates = new Set(employeeAttendance.map((record) => formatInputDate(toDate(record.timestamp) || new Date(0))));
  const sortedLogs = employeeAttendance
    .map((record) => ({ at: toDate(record.timestamp), type: record.type }))
    .filter((record): record is { at: Date; type: Attendance['type'] } => Boolean(record.at))
    .sort((a, b) => a.at.getTime() - b.at.getTime());

  let loginMs = 0;
  let openClockIn: Date | null = null;
  sortedLogs.forEach((record) => {
    if (record.type === 'clock_in') {
      openClockIn = record.at;
    } else if (openClockIn && record.at.getTime() >= openClockIn.getTime()) {
      loginMs += record.at.getTime() - openClockIn.getTime();
      openClockIn = null;
    }
  });
  if (openClockIn) loginMs += now.getTime() - openClockIn.getTime();

  const interested = assigned.filter((lead) => lead.status === 'interested' || lead.status === 'deal_pending' || lead.status === 'deal_approved').length;
  const visits = assigned.filter((lead) => Boolean(lead.siteVisitAt)).length;
  const deals = assigned.filter((lead) => lead.status === 'deal_approved').length;
  const pending = assigned.filter(isPendingLead).length;
  const notInterested = assigned.filter((lead) => lead.status === 'not_interested').length;
  const missedFollowups = assigned.filter((lead) => {
    const followup = toDate(lead.nextFollowupAt);
    return followup && followup.getTime() < now.getTime() && isOpenLead(lead);
  }).length;

  const sourceMap = new Map<string, { source: string; total: number; interested: number; visits: number; deals: number }>();
  assigned.forEach((lead) => {
    const source = normalizeSource(lead.source);
    const existing = sourceMap.get(source) || { source, total: 0, interested: 0, visits: 0, deals: 0 };
    existing.total += 1;
    if (lead.status === 'interested' || lead.status === 'deal_pending' || lead.status === 'deal_approved') existing.interested += 1;
    if (lead.siteVisitAt) existing.visits += 1;
    if (lead.status === 'deal_approved') existing.deals += 1;
    sourceMap.set(source, existing);
  });

  const avgResponseMs = respondedLeads.length
    ? respondedLeads.reduce((sum, value) => sum + value, 0) / respondedLeads.length
    : null;

  return {
    uid: employee.uid,
    name: employee.name,
    total: assigned.length,
    pending,
    notInterested,
    interested,
    visits,
    deals,
    lost: notInterested,
    calls: assigned.filter((lead) => Boolean(lead.lastInteractionAt || lead.lastRemark)).length,
    followupsDone: assigned.filter((lead) => Boolean(lead.lastInteractionAt)).length,
    missedFollowups,
    meetingsScheduled: visits,
    avgResponseMs,
    loginHours: loginMs / 3600000,
    attendanceCount: attendanceDates.size,
    dailyActivityScore: assigned.length ? Math.round(((interested + visits + deals * 2) / assigned.length) * 100) : 0,
    leadToInterested: percentage(interested, assigned.length),
    leadToVisit: percentage(visits, assigned.length),
    leadToDeal: percentage(deals, assigned.length),
    score: (0.6 * deals) + (0.25 * visits) + (0.15 * interested),
    sourceRows: Array.from(sourceMap.values()).sort((a, b) => b.total - a.total),
  };
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

function MultiSelectDropdown({
  label,
  values,
  options,
  onChange,
  placeholder,
}: {
  label: string;
  values: string[];
  options: Array<{ value: string; label: string; hint?: string }>;
  onChange: (values: string[]) => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const filteredOptions = options.filter((option) => `${option.label} ${option.hint || ''}`.toLowerCase().includes(search.toLowerCase()));
  const labelText = values.length === 0 ? placeholder : values.length === 1 ? options.find((option) => option.value === values[0])?.label || placeholder : `${values.length} selected`;

  return (
    <div className="relative">
      <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">{label}</label>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="w-full min-h-[46px] px-4 py-3 rounded-2xl border border-slate-200 bg-white text-left text-sm font-bold text-slate-700 hover:border-blue-200 transition-colors"
      >
        {labelText}
      </button>
      {open && (
        <div className="absolute z-50 mt-2 w-full min-w-[260px] rounded-2xl border border-slate-200 bg-white shadow-2xl p-3">
          <div className="relative mb-2">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 border border-slate-100 outline-none text-sm font-medium"
              placeholder="Search..."
            />
          </div>
          <button
            type="button"
            onClick={() => onChange([])}
            className="w-full text-left px-3 py-2 rounded-xl text-xs font-black uppercase tracking-widest text-blue-600 hover:bg-blue-50"
          >
            Select All
          </button>
          <div className="max-h-64 overflow-y-auto space-y-1">
            {filteredOptions.map((option) => {
              const checked = values.includes(option.value);
              return (
                <label key={option.value} className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      onChange(checked ? values.filter((value) => value !== option.value) : [...values, option.value]);
                    }}
                    className="w-4 h-4 accent-blue-600"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-slate-700 truncate">{option.label}</span>
                    {option.hint && <span className="block text-[10px] font-bold text-slate-400 truncate">{option.hint}</span>}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function SalesPerformanceDashboard({
  user,
  leads,
  employees,
  attendance = [],
  scope,
  onOpenLead,
}: SalesPerformanceDashboardProps) {
  const [employeeIds, setEmployeeIds] = useState<string[]>([]);
  const [sourceValues, setSourceValues] = useState<string[]>([]);
  const [sourceSearch] = useState('');
  const [preset, setPreset] = useState<DatePreset>('last_30');
  const [customFrom, setCustomFrom] = useState(formatInputDate(new Date(Date.now() - 29 * 86400000)));
  const [customTo, setCustomTo] = useState(formatInputDate(new Date()));
  const [teamManagerId, setTeamManagerId] = useState('');
  const [detailEmployee, setDetailEmployee] = useState<EmployeeMetrics | null>(null);
  const [leadList, setLeadList] = useState<{ title: string; leads: Lead[] } | null>(null);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('score');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [page, setPage] = useState(1);
  const pageSize = 8;

  const visibleEmployees = useMemo(() => {
    const baseEmployees = employees.filter((employee) => employee.role === 'employee' || employee.role === 'manager');
    if (scope === 'employee') {
      const map = new Map<string, User>();
      baseEmployees.forEach((employee) => map.set(employee.uid, employee));
      map.set(user.uid, { ...user, role: 'employee' as const });
      return Array.from(map.values()).filter((employee) => employee.role === 'employee');
    }
    if (scope === 'manager') {
      const scoped = baseEmployees.filter((employee) => employee.uid === user.uid || employee.managerId === user.uid);
      return scoped.length ? scoped : [{ ...user, role: 'manager' as const }];
    }
    return baseEmployees;
  }, [employees, scope, user]);

  const managerOptions = visibleEmployees.filter((employee) => employee.role === 'manager');
  const selectedTeamIds = useMemo(() => {
    if (!teamManagerId) return [];
    return visibleEmployees.filter((employee) => employee.uid === teamManagerId || employee.managerId === teamManagerId).map((employee) => employee.uid);
  }, [teamManagerId, visibleEmployees]);

  const effectiveEmployeeIds = employeeIds.length > 0
    ? employeeIds
    : selectedTeamIds.length > 0
      ? selectedTeamIds
      : visibleEmployees.map((employee) => employee.uid);

  const { from, to } = useMemo(() => getDateRange(preset, customFrom, customTo), [preset, customFrom, customTo]);
  const previousRange = useMemo(() => getPreviousRange(from, to), [from, to]);

  const sourceOptions = useMemo(() => {
    const actual = new Set(leads.map((lead) => normalizeSource(lead.source)));
    SOURCE_OPTIONS.forEach((source) => actual.add(source));
    return Array.from(actual)
      .filter((source) => source.toLowerCase().includes(sourceSearch.toLowerCase()))
      .sort()
      .map((source) => ({ value: source, label: source }));
  }, [leads, sourceSearch]);

  const filteredLeads = useMemo(() => {
    const sourceSet = new Set(sourceValues);
    const employeeSet = new Set(effectiveEmployeeIds);
    return leads.filter((lead) => {
      if (!employeeSet.has(lead.assignedTo)) return false;
      if (!isInside(getLeadDate(lead), from, to)) return false;
      if (sourceSet.size > 0 && !sourceSet.has(normalizeSource(lead.source))) return false;
      return true;
    });
  }, [leads, effectiveEmployeeIds, from, to, sourceValues]);

  const previousLeads = useMemo(() => {
    const sourceSet = new Set(sourceValues);
    const employeeSet = new Set(effectiveEmployeeIds);
    return leads.filter((lead) => {
      if (!employeeSet.has(lead.assignedTo)) return false;
      if (!isInside(getLeadDate(lead), previousRange.from, previousRange.to)) return false;
      if (sourceSet.size > 0 && !sourceSet.has(normalizeSource(lead.source))) return false;
      return true;
    });
  }, [leads, effectiveEmployeeIds, previousRange.from, previousRange.to, sourceValues]);

  const filteredAttendance = useMemo(() => {
    const employeeSet = new Set(effectiveEmployeeIds);
    return attendance.filter((record) => {
      const recordDate = toDate(record.timestamp);
      return employeeSet.has(record.uid) && recordDate && isInside(recordDate, from, to);
    });
  }, [attendance, effectiveEmployeeIds, from, to]);

  const employeeMetrics = useMemo(() => {
    return visibleEmployees
      .filter((employee) => effectiveEmployeeIds.includes(employee.uid))
      .map((employee) => computeMetrics(filteredLeads, filteredAttendance, employee))
      .filter((metric) => metric.total > 0 || scope !== 'admin');
  }, [visibleEmployees, effectiveEmployeeIds, filteredLeads, filteredAttendance, scope]);

  const summary = useMemo(() => {
    const responded = filteredLeads
      .map((lead) => {
        const firstAction = getFirstActionDate(lead);
        if (!firstAction) return null;
        return Math.max(0, firstAction.getTime() - getLeadDate(lead).getTime());
      })
      .filter((value): value is number => typeof value === 'number');

    return {
      total: filteredLeads.length,
      pending: filteredLeads.filter(isPendingLead).length,
      notInterested: filteredLeads.filter((lead) => lead.status === 'not_interested').length,
      interested: filteredLeads.filter((lead) => lead.status === 'interested' || lead.status === 'deal_pending' || lead.status === 'deal_approved').length,
      visits: filteredLeads.filter((lead) => Boolean(lead.siteVisitAt)).length,
      deals: filteredLeads.filter((lead) => lead.status === 'deal_approved').length,
      avgResponseMs: responded.length ? responded.reduce((sum, value) => sum + value, 0) / responded.length : null,
    };
  }, [filteredLeads]);

  const previousSummary = useMemo(() => ({
    total: previousLeads.length,
    pending: previousLeads.filter(isPendingLead).length,
    notInterested: previousLeads.filter((lead) => lead.status === 'not_interested').length,
    interested: previousLeads.filter((lead) => lead.status === 'interested' || lead.status === 'deal_pending' || lead.status === 'deal_approved').length,
    visits: previousLeads.filter((lead) => Boolean(lead.siteVisitAt)).length,
    deals: previousLeads.filter((lead) => lead.status === 'deal_approved').length,
  }), [previousLeads]);

  const kpiLeadSets: Record<KpiKey, Lead[]> = {
    total: filteredLeads,
    pending: filteredLeads.filter(isPendingLead),
    notInterested: filteredLeads.filter((lead) => lead.status === 'not_interested'),
    interested: filteredLeads.filter((lead) => lead.status === 'interested' || lead.status === 'deal_pending' || lead.status === 'deal_approved'),
    visits: filteredLeads.filter((lead) => Boolean(lead.siteVisitAt)),
    deals: filteredLeads.filter((lead) => lead.status === 'deal_approved'),
  };

  const conversionTrend = useMemo(() => {
    const buckets = new Map<string, { label: string; total: number; deals: number }>();
    filteredLeads.forEach((lead) => {
      const date = getLeadDate(lead);
      const label = formatInputDate(date).slice(5);
      const existing = buckets.get(label) || { label, total: 0, deals: 0 };
      existing.total += 1;
      if (lead.status === 'deal_approved') existing.deals += 1;
      buckets.set(label, existing);
    });
    return Array.from(buckets.values()).slice(-14).map((bucket) => ({ ...bucket, value: percentage(bucket.deals, bucket.total) }));
  }, [filteredLeads]);

  const sourceDistribution = useMemo(() => {
    const map = new Map<string, number>();
    filteredLeads.forEach((lead) => {
      const source = normalizeSource(lead.source);
      map.set(source, (map.get(source) || 0) + 1);
    });
    return Array.from(map.entries()).map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count);
  }, [filteredLeads]);

  const sortedMetrics = useMemo(() => {
    const searched = employeeMetrics.filter((metric) => metric.name.toLowerCase().includes(employeeSearch.toLowerCase()));
    return searched.sort((a, b) => {
      const dir = sortDirection === 'asc' ? 1 : -1;
      if (sortKey === 'name') return a.name.localeCompare(b.name) * dir;
      if (sortKey === 'deals') return (a.deals - b.deals) * dir;
      if (sortKey === 'visits') return (a.visits - b.visits) * dir;
      if (sortKey === 'interested') return (a.interested - b.interested) * dir;
      return (a.score - b.score) * dir;
    });
  }, [employeeMetrics, employeeSearch, sortDirection, sortKey]);

  const pagedMetrics = sortedMetrics.slice((page - 1) * pageSize, page * pageSize);
  const totalPages = Math.max(1, Math.ceil(sortedMetrics.length / pageSize));
  const scoreRankedMetrics = useMemo(() => [...employeeMetrics].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)), [employeeMetrics]);
  const currentUserRank = scoreRankedMetrics.findIndex((metric) => metric.uid === user.uid) + 1;
  const currentUserMetric = scoreRankedMetrics.find((metric) => metric.uid === user.uid) || null;

  const alerts = useMemo(() => {
    const now = Date.now();
    const leadAlerts = filteredLeads
      .filter((lead) => !getFirstActionDate(lead) && now - getLeadDate(lead).getTime() > 30 * 60000)
      .slice(0, 5)
      .map((lead) => ({ title: 'Lead not responded', detail: `${lead.name} has no action after 30 minutes.` }));
    const followupAlerts = filteredLeads
      .filter((lead) => {
        const followup = toDate(lead.nextFollowupAt);
        return followup && followup.getTime() < now && isOpenLead(lead);
      })
      .slice(0, 5)
      .map((lead) => ({ title: 'Missed follow-up', detail: `${lead.name} follow-up date crossed.` }));
    const lowPerformance = employeeMetrics
      .filter((metric) => metric.total >= 5 && metric.leadToDeal < 5)
      .slice(0, 3)
      .map((metric) => ({ title: 'Low performance alert', detail: `${metric.name} deal conversion is below 5%.` }));
    return [...leadAlerts, ...followupAlerts, ...lowPerformance];
  }, [employeeMetrics, filteredLeads]);

  const exportRows = sortedMetrics.map((metric, index) => ({
    Rank: index + 1,
    Employee: metric.name,
    Score: metric.score.toFixed(2),
    Deals: metric.deals,
    SiteVisits: metric.visits,
    Interested: metric.interested,
    TotalLeads: metric.total,
    LeadToDealPercent: metric.leadToDeal.toFixed(2),
  }));

  const exportDashboard = (kind: 'csv' | 'excel' | 'pdf') => {
    if (kind === 'pdf') {
      window.print();
      return;
    }
    const csv = toCsv(exportRows);
    downloadText(`sales-performance-${formatInputDate(new Date())}.${kind === 'excel' ? 'xls' : 'csv'}`, csv, kind === 'excel' ? 'application/vnd.ms-excel' : 'text/csv;charset=utf-8');
  };

  const linePoints = conversionTrend.length
    ? conversionTrend.map((point, index) => {
        const x = conversionTrend.length === 1 ? 50 : (index / (conversionTrend.length - 1)) * 100;
        const y = 100 - Math.min(100, point.value);
        return `${x},${y}`;
      }).join(' ')
    : '';

  const pieGradient = (() => {
    const total = sourceDistribution.reduce((sum, item) => sum + item.count, 0);
    if (!total) return '#e2e8f0 0 100%';
    const colors = ['#2563eb', '#16a34a', '#f59e0b', '#db2777', '#7c3aed', '#0891b2', '#64748b'];
    let cursor = 0;
    return sourceDistribution.map((item, index) => {
      const start = cursor;
      cursor += (item.count / total) * 100;
      return `${colors[index % colors.length]} ${start}% ${cursor}%`;
    }).join(', ');
  })();

  const responseColor = summary.avgResponseMs === null
    ? 'text-slate-500 bg-slate-100'
    : summary.avgResponseMs < 5 * 60000
      ? 'text-emerald-700 bg-emerald-100'
      : summary.avgResponseMs <= 15 * 60000
        ? 'text-amber-700 bg-amber-100'
        : 'text-rose-700 bg-rose-100';

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection(key === 'name' ? 'asc' : 'desc');
    }
  };

  const topPerformerSection = (
    <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Trophy size={18} className="text-amber-500" />
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-800">Top Performer Table</h3>
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={employeeSearch}
            onChange={(event) => {
              setEmployeeSearch(event.target.value);
              setPage(1);
            }}
            className="w-full sm:w-72 rounded-2xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm font-medium outline-none"
            placeholder="Search employee..."
          />
        </div>
      </div>
      <div className="mt-4 overflow-x-auto">
        {scope === 'employee' && currentUserMetric && (
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
            <div className="rounded-2xl bg-blue-50 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-blue-500">Your Rank</p>
              <p className="mt-2 text-2xl font-black text-slate-900">#{currentUserRank || '-'}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Score</p>
              <p className="mt-2 text-2xl font-black text-slate-900">{currentUserMetric.score.toFixed(2)}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Deals</p>
              <p className="mt-2 text-2xl font-black text-slate-900">{currentUserMetric.deals}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Site Visits</p>
              <p className="mt-2 text-2xl font-black text-slate-900">{currentUserMetric.visits}</p>
            </div>
          </div>
        )}
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              {[
                ['rank', 'Rank'],
                ['name', 'Employee Name'],
                ['score', 'Performance Score'],
                ['deals', 'Deals Closed'],
                ['visits', 'Site Visits'],
                ['interested', 'Interested Leads'],
              ].map(([key, label]) => (
                <th key={key} className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400">
                  <button type="button" onClick={() => toggleSort(key as SortKey)}>{label}</button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {pagedMetrics.map((metric) => {
              const rank = sortedMetrics.findIndex((item) => item.uid === metric.uid) + 1;
              return (
                <tr key={metric.uid} className="hover:bg-slate-50">
                  <td className="px-4 py-4 text-sm font-black text-slate-900">#{rank}</td>
                  <td className="px-4 py-4">
                    <button type="button" onClick={() => setDetailEmployee(metric)} className="text-sm font-black text-blue-600 hover:underline">{metric.name}</button>
                  </td>
                  <td className="px-4 py-4 text-sm font-bold text-slate-700">{metric.score.toFixed(2)}</td>
                  <td className="px-4 py-4 text-sm font-bold text-slate-700">{metric.deals}</td>
                  <td className="px-4 py-4 text-sm font-bold text-slate-700">{metric.visits}</td>
                  <td className="px-4 py-4 text-sm font-bold text-slate-700">{metric.interested}</td>
                </tr>
              );
            })}
            {pagedMetrics.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-sm font-medium text-slate-400">No employee performance data for selected filters.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex items-center justify-between">
        <p className="text-xs font-bold text-slate-400">Page {page} of {totalPages}</p>
        <div className="flex gap-2">
          <button type="button" disabled={page <= 1} onClick={() => setPage((prev) => Math.max(1, prev - 1))} className="rounded-xl border border-slate-200 p-2 text-slate-600 disabled:opacity-40"><ChevronLeft size={16} /></button>
          <button type="button" disabled={page >= totalPages} onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))} className="rounded-xl border border-slate-200 p-2 text-slate-600 disabled:opacity-40"><ChevronRight size={16} /></button>
        </div>
      </div>
    </section>
  );

  return (
    <div className="space-y-6 pb-20 print:bg-white">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-blue-700">
            <BarChart3 size={13} /> Sales Performance
          </div>
          <h2 className="mt-2 text-2xl sm:text-3xl font-black tracking-tight text-slate-900">Performance Dashboard</h2>
          <p className="mt-1 text-sm font-medium text-slate-500">
            Real-time sales KPIs, conversion analytics, employee ranking, and follow-up alerts.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <button onClick={() => exportDashboard('csv')} className="inline-flex items-center gap-2 rounded-xl bg-white border border-slate-200 px-3 py-2 text-xs font-black uppercase tracking-widest text-slate-700 hover:bg-slate-50">
            <Download size={14} /> CSV
          </button>
          <button onClick={() => exportDashboard('excel')} className="inline-flex items-center gap-2 rounded-xl bg-white border border-slate-200 px-3 py-2 text-xs font-black uppercase tracking-widest text-slate-700 hover:bg-slate-50">
            <FileSpreadsheet size={14} /> Excel
          </button>
          <button onClick={() => exportDashboard('pdf')} className="inline-flex items-center gap-2 rounded-xl bg-white border border-slate-200 px-3 py-2 text-xs font-black uppercase tracking-widest text-slate-700 hover:bg-slate-50">
            <FileText size={14} /> PDF
          </button>
        </div>
      </div>

      <section className="rounded-3xl border border-slate-100 bg-white p-4 sm:p-5 shadow-sm print:hidden">
        <div className="mb-4 flex items-center gap-2">
          <Filter size={16} className="text-blue-600" />
          <h3 className="text-xs font-black uppercase tracking-widest text-slate-700">Global Filters</h3>
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
          <div className="space-y-3">
            <MultiSelectDropdown
              label="Employees"
              values={employeeIds}
              options={visibleEmployees.map((employee) => ({
                value: employee.uid,
                label: employee.name,
                hint: employee.role === 'manager' ? 'Manager' : employee.managerName || 'Sales Executive',
              }))}
              onChange={(values) => {
                setEmployeeIds(values);
                setTeamManagerId('');
                setPage(1);
              }}
              placeholder="All Employees"
            />
            {managerOptions.length > 0 && scope !== 'employee' && (
              <select
                value={teamManagerId}
                onChange={(event) => {
                  setTeamManagerId(event.target.value);
                  setEmployeeIds([]);
                  setPage(1);
                }}
                className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-white text-sm font-bold text-slate-700"
              >
                <option value="">Team Wise Selection</option>
                {managerOptions.map((manager) => (
                  <option key={manager.uid} value={manager.uid}>{manager.name}'s Team</option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Timeline</label>
            <select
              value={preset}
              onChange={(event) => setPreset(event.target.value as DatePreset)}
              className="w-full min-h-[46px] px-4 py-3 rounded-2xl border border-slate-200 bg-white text-sm font-bold text-slate-700"
            >
              {PRESETS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
            {preset === 'custom' && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <input type="date" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold" />
                <input type="date" value={customTo} onChange={(event) => setCustomTo(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold" />
              </div>
            )}
          </div>

          <MultiSelectDropdown
            label="Lead Source"
            values={sourceValues}
            options={sourceOptions}
            onChange={(values) => {
              setSourceValues(values);
              setPage(1);
            }}
            placeholder="All Sources"
          />

          <div className="rounded-2xl bg-slate-50 border border-slate-100 px-4 py-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Active Scope</p>
            <p className="mt-1 text-sm font-black text-slate-800 capitalize">{scope === 'admin' ? 'Super Admin' : scope === 'manager' ? 'Sales Manager' : 'Sales Executive'}</p>
            <p className="mt-1 text-xs font-medium text-slate-500">{from.toLocaleDateString()} - {to.toLocaleDateString()}</p>
          </div>
        </div>
      </section>

      {topPerformerSection}

      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-4">
        {(Object.keys(kpiLabels) as KpiKey[]).map((key) => {
          const value = summary[key];
          const previous = previousSummary[key];
          const growth = previous === 0 ? (value > 0 ? 100 : 0) : ((value - previous) / previous) * 100;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setLeadList({ title: kpiLabels[key], leads: kpiLeadSets[key] })}
              className="rounded-3xl border border-slate-100 bg-white p-5 text-left shadow-sm hover:border-blue-200 hover:shadow-md transition-all"
            >
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{kpiLabels[key]}</p>
              <p className="mt-3 text-3xl font-black text-slate-900">{value}</p>
              <p className={cn("mt-2 text-[10px] font-black uppercase tracking-widest", growth >= 0 ? "text-emerald-600" : "text-rose-600")}>
                {growth >= 0 ? '+' : ''}{growth.toFixed(1)}% vs previous
              </p>
            </button>
          );
        })}
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
          <p className="text-xs font-black uppercase tracking-widest text-slate-400">Average Response Time</p>
          <p className="mt-3 text-3xl font-black text-slate-900">{formatDuration(summary.avgResponseMs)}</p>
          <span className={cn("mt-3 inline-flex rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest", responseColor)}>
            {summary.avgResponseMs === null ? 'No Responses' : summary.avgResponseMs < 5 * 60000 ? 'Green' : summary.avgResponseMs <= 15 * 60000 ? 'Yellow' : 'Red'}
          </span>
        </div>
        <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
          <p className="text-xs font-black uppercase tracking-widest text-slate-400">Lead to Interested</p>
          <p className="mt-3 text-3xl font-black text-slate-900">{percentage(summary.interested, summary.total).toFixed(1)}%</p>
        </div>
        <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
          <p className="text-xs font-black uppercase tracking-widest text-slate-400">Lead to Site Visit</p>
          <p className="mt-3 text-3xl font-black text-slate-900">{percentage(summary.visits, summary.total).toFixed(1)}%</p>
        </div>
        <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
          <p className="text-xs font-black uppercase tracking-widest text-slate-400">Lead to Deal</p>
          <p className="mt-3 text-3xl font-black text-slate-900">{percentage(summary.deals, summary.total).toFixed(1)}%</p>
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-800">Sales Funnel</h3>
          <div className="mt-5 space-y-3">
            {[
              ['Lead Received', summary.total],
              ['Contacted', filteredLeads.filter((lead) => Boolean(getFirstActionDate(lead))).length],
              ['Interested', summary.interested],
              ['Site Visit', summary.visits],
              ['Negotiation', filteredLeads.filter((lead) => lead.status === 'deal_pending').length],
              ['Closed Deal', summary.deals],
            ].map(([label, count]) => {
              const width = summary.total ? Math.max(8, (Number(count) / summary.total) * 100) : 0;
              return (
                <div key={label as string}>
                  <div className="mb-1 flex justify-between text-xs font-bold text-slate-500">
                    <span>{label}</span>
                    <span>{count}</span>
                  </div>
                  <div className="h-8 rounded-xl bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-xl bg-blue-600" style={{ width: `${width}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-800">Lead Source Distribution</h3>
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-5 items-center">
            <div className="mx-auto h-40 w-40 rounded-full border-[18px] border-white shadow-inner" style={{ background: `conic-gradient(${pieGradient})` }} />
            <div className="space-y-2">
              {sourceDistribution.slice(0, 7).map((item, index) => (
                <div key={item.source} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600">
                  <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: ['#2563eb', '#16a34a', '#f59e0b', '#db2777', '#7c3aed', '#0891b2', '#64748b'][index % 7] }} />{item.source}</span>
                  <span>{item.count}</span>
                </div>
              ))}
              {sourceDistribution.length === 0 && <p className="text-sm font-medium text-slate-400">No source data.</p>}
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-800">Conversion Trend</h3>
          <div className="mt-5 h-56 rounded-2xl bg-slate-50 p-4">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full">
              <polyline points={linePoints} fill="none" stroke="#2563eb" strokeWidth="3" vectorEffect="non-scaling-stroke" />
            </svg>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-800">Employee Performance</h3>
          <div className="mt-5 space-y-3">
            {sortedMetrics.slice(0, 6).map((metric) => {
              const maxScore = Math.max(1, ...sortedMetrics.map((item) => item.score));
              return (
                <div key={metric.uid}>
                  <div className="mb-1 flex justify-between text-xs font-bold text-slate-500">
                    <span>{metric.name}</span>
                    <span>{metric.score.toFixed(2)}</span>
                  </div>
                  <div className="h-7 rounded-xl bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-xl bg-emerald-500" style={{ width: `${(metric.score / maxScore) * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <AlertTriangle size={18} className="text-amber-500" />
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-800">Real-Time Alerts</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {alerts.slice(0, 9).map((alert, index) => (
            <div key={`${alert.title}-${index}`} className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
              <p className="text-xs font-black uppercase tracking-widest text-amber-700">{alert.title}</p>
              <p className="mt-1 text-sm font-medium text-amber-800">{alert.detail}</p>
            </div>
          ))}
          {alerts.length === 0 && <p className="text-sm font-medium text-slate-400">No active alerts for selected filters.</p>}
        </div>
      </section>

      {detailEmployee && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
            <div className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-white p-5">
              <div>
                <h3 className="text-xl font-black text-slate-900">{detailEmployee.name}</h3>
                <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Detailed Analytics</p>
              </div>
              <button type="button" onClick={() => setDetailEmployee(null)} className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                <X size={20} />
              </button>
            </div>
            <div className="space-y-5 p-5">
              {[
                ['Lead Analytics', [
                  ['Total Leads', detailEmployee.total],
                  ['Pending Leads', detailEmployee.pending],
                  ['Interested Leads', detailEmployee.interested],
                  ['Closed Leads', detailEmployee.deals],
                  ['Lost Leads', detailEmployee.lost],
                ]],
                ['Activity Analytics', [
                  ['Total Calls', detailEmployee.calls],
                  ['Follow-Ups Done', detailEmployee.followupsDone],
                  ['Missed Follow-Ups', detailEmployee.missedFollowups],
                  ['Meetings Scheduled', detailEmployee.meetingsScheduled],
                  ['Site Visits Completed', detailEmployee.visits],
                ]],
                ['Productivity Analytics', [
                  ['Average Response Time', formatDuration(detailEmployee.avgResponseMs)],
                  ['Login Hours', detailEmployee.loginHours.toFixed(1)],
                  ['Attendance Days', detailEmployee.attendanceCount],
                  ['Daily Activity Score', detailEmployee.dailyActivityScore],
                ]],
                ['Conversion Analytics', [
                  ['Lead to Interested', `${detailEmployee.leadToInterested.toFixed(1)}%`],
                  ['Lead to Site Visit', `${detailEmployee.leadToVisit.toFixed(1)}%`],
                  ['Lead to Deal', `${detailEmployee.leadToDeal.toFixed(1)}%`],
                ]],
                ['Revenue Analytics', [
                  ['Total Deal Value', 'Pending deal value data'],
                  ['Revenue Generated', 'Pending revenue data'],
                  ['Commission Earned', 'Pending commission data'],
                ]],
              ].map(([section, rows]) => (
                <div key={section as string} className="rounded-2xl border border-slate-100 p-4">
                  <h4 className="mb-3 text-xs font-black uppercase tracking-widest text-slate-700">{section as string}</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {(rows as Array<[string, string | number]>).map(([label, value]) => (
                      <div key={label} className="rounded-xl bg-slate-50 p-3">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
                        <p className="mt-1 text-sm font-black text-slate-800">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              <div className="rounded-2xl border border-slate-100 p-4">
                <h4 className="mb-3 text-xs font-black uppercase tracking-widest text-slate-700">Source Performance</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-slate-50">
                        {['Source', 'Total', 'Interested', 'Visits', 'Deals'].map((header) => (
                          <th key={header} className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400">{header}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {detailEmployee.sourceRows.map((row) => (
                        <tr key={row.source} className="border-t border-slate-50">
                          <td className="px-3 py-2 text-sm font-bold text-slate-700">{row.source}</td>
                          <td className="px-3 py-2 text-sm font-bold text-slate-700">{row.total}</td>
                          <td className="px-3 py-2 text-sm font-bold text-slate-700">{row.interested}</td>
                          <td className="px-3 py-2 text-sm font-bold text-slate-700">{row.visits}</td>
                          <td className="px-3 py-2 text-sm font-bold text-slate-700">{row.deals}</td>
                        </tr>
                      ))}
                      {detailEmployee.sourceRows.length === 0 && (
                        <tr><td colSpan={5} className="px-3 py-8 text-center text-sm text-slate-400">No source data.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {leadList && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="max-h-[86vh] w-full max-w-3xl overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 p-5">
              <div>
                <h3 className="text-xl font-black text-slate-900">{leadList.title}</h3>
                <p className="text-xs font-bold uppercase tracking-widest text-slate-400">{leadList.leads.length} leads</p>
              </div>
              <button type="button" onClick={() => setLeadList(null)} className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                <X size={20} />
              </button>
            </div>
            <div className="max-h-[68vh] overflow-y-auto divide-y divide-slate-50">
              {leadList.leads.map((lead) => (
                <div key={lead.id} className="p-4">
                  {onOpenLead ? (
                    <button
                      type="button"
                      onClick={() => {
                        setLeadList(null);
                        onOpenLead(lead);
                      }}
                      className="text-left font-black text-blue-600 hover:underline"
                    >
                      {lead.name}
                    </button>
                  ) : (
                    <p className="font-black text-slate-900">{lead.name}</p>
                  )}
                  <p className="text-sm font-medium text-slate-500">{lead.phone} | {normalizeSource(lead.source)} | {lead.status.replace('_', ' ')}</p>
                </div>
              ))}
              {leadList.leads.length === 0 && <p className="p-10 text-center text-sm font-medium text-slate-400">No leads in this KPI.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

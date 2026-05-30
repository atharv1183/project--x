import { Building2, ClipboardList, CreditCard, DatabaseBackup, LayoutDashboard, Repeat2, Ticket, TimerReset, LucideIcon, Inbox } from 'lucide-react';
import { SuperAdminModule } from './types';

export const MODULES: Array<{ id: SuperAdminModule; label: string; icon: LucideIcon }> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'add_client', label: 'Add Client', icon: Building2 },
  { id: 'status', label: 'Status', icon: ClipboardList },
  { id: 'payments', label: 'Payments', icon: CreditCard },
  { id: 'transactions', label: 'Transactions', icon: Repeat2 },
  { id: 'followups', label: 'Followups', icon: TimerReset },
  { id: 'tickets', label: 'Tickets', icon: Ticket },
  { id: 'demo_requests', label: 'Demo Requests', icon: Inbox },
  { id: 'backup_restore', label: 'Backup & Restore (Full Data)', icon: DatabaseBackup },
];

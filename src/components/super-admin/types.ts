export type SuperAdminModule =
  | 'dashboard'
  | 'add_client'
  | 'status'
  | 'payments'
  | 'transactions'
  | 'followups'
  | 'tickets'
  | 'demo_requests'
  | 'blogs'
  | 'certificates'
  | 'backup_restore';

export type NewClientCredentials = {
  companyName: string;
  email: string;
  tempPassword: string;
};

export type AddClientFormState = {
  companyLogoUrl: string;
  companyLogoFile: File | null;
  companyName: string;
  personName: string;
  contactNumber: string;
  email: string;
  address: string;
  gstn: string;
};

export type EditClientFormState = {
  name: string;
  contactPerson: string;
  mobileNumber: string;
  email: string;
  address: string;
  gstn: string;
  state: string;
  trialDays: string;
  subscriptionExpiryDate: string;
};

export type PaymentFormState = {
  clientId: string;
  extendedMonths: string;
  amount: string;
};

export type PlatformClient = {
  id: string;
  name?: string;
  contactPerson?: string;
  mobileNumber?: string;
  email?: string;
  address?: string;
  gstn?: string;
  state?: string;
  trialDays?: number;
  subscriptionExpiryDate?: string | null;
  subscriptionStartDate?: string | null;
  paymentStatus?: string;
  billingCycle?: string;
  lastPaymentAmount?: number;
  lastPaymentAt?: any;
  tempPassword?: string;
  adminEmail?: string;
};

export type PaymentTransaction = {
  id: string;
  clientId: string;
  companyName: string;
  personName: string;
  contactNo: string;
  previousStatus: string;
  newStatus: string;
  previousExpiryDate?: string | null;
  subscriptionExpiryDate: string;
  extendedMonths: number;
  amount: number;
  createdBy: string;
  createdByName: string;
  createdAt?: any;
  updatedAt?: any;
};

export type SupportTicket = {
  id: string;
  clientId?: string;
  companyName?: string;
  contactPerson?: string;
  issueRaisedBy?: string;
  raisedPersonName?: string;
  raisedPersonContact?: string;
  title: string;
  message: string;
  status: 'open' | 'closed';
  userId: string;
  userName?: string;
  attachments?: Array<{ name: string; dataUrl: string; type: string; size: number }>;
  createdAt?: any;
  closedAt?: any;
  updatedAt?: any;
};

export type DemoRequest = {
  id: string;
  name: string;
  email: string;
  phone: string;
  company?: string;
  role?: string;
  message?: string;
  status?: 'new' | 'contacted' | 'closed';
  source?: string;
  pagePath?: string;
  submittedAt?: any;
  updatedAt?: any;
};

export type TicketFormState = {
  clientId: string;
  issueRaisedBy: string;
  raisedPersonName: string;
  raisedPersonContact: string;
  title: string;
  message: string;
  attachments: Array<{ name: string; dataUrl: string; type: string; size: number }>;
};

export type StatusSort = {
  key: string;
  dir: 'asc' | 'desc';
};

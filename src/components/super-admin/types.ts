export type SuperAdminModule =
  | 'dashboard'
  | 'add_client'
  | 'status'
  | 'payments'
  | 'transactions'
  | 'followups'
  | 'tickets'
  | 'backup_restore';

export type NewClientCredentials = {
  companyName: string;
  email: string;
  tempPassword: string;
};

export type AddClientFormState = {
  companyLogoUrl: string;
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
  billingCycle?: string;
};

export type StatusSort = {
  key: string;
  dir: 'asc' | 'desc';
};

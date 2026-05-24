export type TenantStatus = 'active' | 'suspended' | 'archived';

export interface Tenant {
  id: string;
  name: string;
  status: TenantStatus;
  adminUid?: string;
  adminEmail?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface TenantMemberContext {
  uid: string;
  tenantId: string;
  role: 'super_admin' | 'admin' | 'client_admin' | 'manager' | 'employee';
}


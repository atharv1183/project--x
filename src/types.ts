export type LeadStatus = 'pending' | 'interested' | 'not_interested' | 'deal_pending' | 'deal_approved';

export interface Location {
  latitude: number;
  longitude: number;
}

export interface Lead {
  id: string;
  clientId?: string;
  clientName?: string | null;
  name: string;
  phone: string;
  status: LeadStatus;
  source: string;
  assignedTo: string;
  addedById?: string;
  addedByName?: string;
  addedByRole?: 'admin' | 'manager' | 'employee';
  assignedAt: any;
  createdAt: any;
  updatedAt?: any;
  lastInteractionAt?: any;
  nextFollowupAt?: any;
  lastRemark?: string;
  siteVisitPhoto?: string;
  siteVisitLocation?: Location;
  siteVisitAt?: any;
  siteVisitVerifiedAt?: any;
  siteVisitVerifiedBy?: string;
  kycAadhaarUrl?: string;
  kycAadhaarName?: string;
  kycPanUrl?: string;
  kycPanName?: string;
  kycUploadedAt?: any;
}

export interface Followup {
  id: string;
  date: any;
  remark: string;
  employeeId: string;
}

export interface Attendance {
  id?: string;
  uid: string;
  employeeName: string;
  timestamp: any;
  type: 'clock_in' | 'clock_out';
  location: {
    latitude: number;
    longitude: number;
    address?: string;
  };
}

export type AttendanceCorrectionStatus = 'pending' | 'approved' | 'rejected';

export interface AttendanceCorrectionRequest {
  id: string;
  uid: string;
  employeeName: string;
  dateKey: string;
  date: any;
  requestedLoginTime?: any;
  requestedLogoutTime?: any;
  remark: string;
  status: AttendanceCorrectionStatus;
  requestedBy: string;
  requestedByName: string;
  requestedAt: any;
  reviewedBy?: string;
  reviewedAt?: any;
  reviewRemark?: string;
}

export interface User {
  uid: string;
  clientId?: string;
  clientName?: string;
  name: string;
  email: string;
  phone: string;
  profileImageUrl?: string;
  brandLogoUrl?: string;
  brandCompanyName?: string;
  brandTagline?: string;
  role: 'super_admin' | 'admin' | 'client_admin' | 'manager' | 'employee' | 'suspended' | 'deleted';
  managerId?: string;
  managerName?: string;
  createdAt: any;
}

export type ClientLifecycleState = 'active' | 'suspended' | 'archived' | 'deleted_permanently';

export interface PlatformClient {
  id: string;
  name: string;
  adminEmail?: string;
  state: ClientLifecycleState;
  logoUrl?: string;
  primaryColor?: string;
  customDomain?: string;
  subdomain?: string;
  whiteLabelEnabled?: boolean;
  sandboxEnabled?: boolean;
  createdAt?: any;
  updatedAt?: any;
}

export interface FeatureToggle {
  id: string;
  label: string;
  enabled: boolean;
  description?: string;
  updatedAt?: any;
  updatedBy?: string;
}

export interface PlatformAnnouncement {
  id: string;
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  targetType: 'all' | 'selected';
  targetClientIds?: string[];
  active: boolean;
  createdAt?: any;
  createdBy?: string;
}

export interface AuditLogEntry {
  id: string;
  action: string;
  actorId: string;
  actorName: string;
  actorRole?: string;
  targetType?: string;
  targetId?: string;
  description?: string;
  oldValue?: any;
  newValue?: any;
  meta?: Record<string, any>;
  createdAt?: any;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  leadId?: string;
  read: boolean;
  createdAt: any;
}

export interface Requirement {
  id: string;
  name: string;
  phone: string;
  type: string; // 'zeemen' | 'plot' | 'house'
  specializations?: string[];
  brokerState?: string;
  brokerCity?: string;
  brokerLocality?: string;
  area: string;
  budget: string;
  location: string;
  remark: string;
  employeeId: string;
  employeeName: string;
  createdAt: any;
}

export interface LeadTransfer {
  id: string;
  clientId?: string;
  leadId: string;
  leadName: string;
  fromUid: string;
  fromName: string;
  toUid: string;
  toName: string;
  transferredByUid: string;
  transferredByName: string;
  transferredByRole?: User['role'];
  createdAt: any;
}

export type InventoryType = 'zameen' | 'house' | 'others' | 'plot';
export type HouseType = 'simplex' | 'semi-duplex' | 'duplex';
export type InventoryStatus = 'draft' | 'pending_approval' | 'approved' | 'rejected';
export type ListingMode = 'single' | 'project';
export type InventoryVisibility = 'internal' | 'all';

export interface ProjectUnit {
  id: string;
  title: string;
  type: InventoryType;
  subType?: string;
  areaValue?: number;
  areaUnit?: 'acre' | 'sqft' | 'sqyard' | 'sqmtr' | 'hectare';
  areaAcre?: number;
  areaSqft?: number;
  areaSqYard?: number;
  areaSqMtr?: number;
  areaHectare?: number;
  rate: number;
  rateUnit: string;
  houseType?: HouseType;
  bhk?: number;
  bathrooms?: number;
  kitchenType?: string;
  photos: string[];
}

export interface Broker {
  id: string;
  name: string;
  phone: string;
  email?: string;
  company?: string;
  state?: string;
  city?: string;
  locality?: string;
  specializations?: string[];
  createdAt: any;
  updatedAt?: any;
  createdBy?: string;
}

export interface InventoryItem {
  id: string;
  title: string;
  description?: string;
  brokerId?: string;
  brokerName?: string;
  brokerPhone?: string;
  visibilityScope?: InventoryVisibility;
  listingMode?: ListingMode;
  isProject?: boolean;
  projectUnitCount?: number;
  projectUnits?: ProjectUnit[];
  type: InventoryType;
  subType?: string;
  // Area in different units
  areaValue?: number;
  areaUnit?: 'acre' | 'sqft' | 'sqyard' | 'sqmtr' | 'hectare';
  areaAcre?: number;
  areaSqft?: number;
  areaSqYard?: number;
  areaSqMtr?: number;
  areaHectare?: number;
  
  rate: number;
  rateUnit: string; // e.g., 'per_sqft', 'total'
  
  location: string;
  nearbyLocation?: string;
  landmark?: string;
  locationLink?: string;
  latitude: number;
  longitude: number;
  
  photos: string[]; // URLs
  videos?: string[]; // URLs
  attachments: { name: string; url: string }[];
  
  // House specific
  houseType?: HouseType;
  bhk?: number;
  bathrooms?: number;
  kitchenType?: string;
  features?: string[];
  
  status: InventoryStatus;
  submitterId: string;
  submitterName: string;
  createdAt: any;
  updatedAt: any;
  approvedBy?: string;
  approvalAt?: any;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

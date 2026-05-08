export type LeadStatus = 'pending' | 'interested' | 'not_interested' | 'deal_pending' | 'deal_approved';

export interface Location {
  latitude: number;
  longitude: number;
}

export interface Lead {
  id: string;
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

export interface User {
  uid: string;
  name: string;
  email: string;
  phone: string;
  role: 'admin' | 'manager' | 'employee' | 'suspended' | 'deleted';
  managerId?: string;
  managerName?: string;
  createdAt: any;
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
  area: string;
  budget: string;
  location: string;
  remark: string;
  employeeId: string;
  employeeName: string;
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

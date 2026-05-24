export function tenantRootPath(tenantId: string): string {
  return `tenants/${tenantId}`;
}

export function tenantCollectionPath(tenantId: string, collectionName: string): string {
  return `${tenantRootPath(tenantId)}/${collectionName}`;
}

export function tenantDocumentPath(tenantId: string, collectionName: string, docId: string): string {
  return `${tenantCollectionPath(tenantId, collectionName)}/${docId}`;
}

export const tenantCollections = {
  users: 'users',
  leads: 'leads',
  requirements: 'requirements',
  inventory: 'inventory',
  notifications: 'notifications',
  attendance: 'attendance',
  attendanceCorrections: 'attendanceCorrections',
  leadTransfers: 'leadTransfers',
  brokers: 'brokers',
  auditLogs: 'auditLogs',
} as const;


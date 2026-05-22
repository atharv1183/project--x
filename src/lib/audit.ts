import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';

export type AuditLogPayload = {
  action: string;
  actorId: string;
  actorName: string;
  actorRole?: string;
  targetType?: string;
  targetId?: string;
  description: string;
  oldValue?: any;
  newValue?: any;
  meta?: Record<string, any>;
};

export async function addAuditLog(db: Firestore, payload: AuditLogPayload): Promise<void> {
  try {
    await addDoc(collection(db, 'auditLogs'), {
      action: payload.action,
      actorId: payload.actorId,
      actorName: payload.actorName,
      actorRole: payload.actorRole || null,
      targetType: payload.targetType || null,
      targetId: payload.targetId || null,
      description: payload.description,
      oldValue: payload.oldValue ?? null,
      newValue: payload.newValue ?? null,
      meta: payload.meta ?? null,
      createdAt: serverTimestamp(),
    });
  } catch {
    // Audit logging failures should never block core user operations.
  }
}


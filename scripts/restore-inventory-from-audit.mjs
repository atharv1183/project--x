import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { initializeApp, applicationDefault, cert, getApps } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const TARGET_IDS = [
  'mPFjEBQBIKWSluLUdeVm',
  'wSISKtFyEKBesFmPTvsY',
  'cVPVAtTmhq49wiTuKTPr',
  'mRI07ZCnUxjSW4OBUAfl',
];

async function loadLocalEnv() {
  const dotenv = await import('dotenv');
  const cwd = process.cwd();
  dotenv.config({ path: path.join(cwd, '.env.local'), override: false });
  dotenv.config({ path: path.join(cwd, '.env'), override: false });
}

async function readAppletConfig() {
  try {
    const raw = await fs.readFile(path.join(process.cwd(), 'firebase-applet-config.json'), 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function resolveCredential() {
  const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (serviceAccountRaw) return cert(JSON.parse(serviceAccountRaw));
  return applicationDefault();
}

function parseFlags() {
  const args = process.argv.slice(2);
  const get = (name) => {
    const index = args.findIndex((arg) => arg === name);
    return index >= 0 ? args[index + 1] : '';
  };
  return {
    write: args.includes('--write'),
    refreshStatus: args.includes('--refresh-status'),
    clientId: get('--client-id') || '',
    clientName: get('--client-name') || 'Apna Ghar Consultants',
  };
}

function toMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  return new Date(value).getTime() || 0;
}

function toDateText(value) {
  const ms = toMillis(value);
  return ms ? new Date(ms).toISOString() : '-';
}

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function hasRestorablePayload(entry) {
  const payload = entry.newValue || {};
  return Boolean(payload.title && payload.location && payload.status);
}

function latestStatusPatch(logs) {
  const statusLog = logs.find((entry) => entry.newValue?.status);
  if (!statusLog) return null;
  const patch = {
    status: statusLog.newValue.status,
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (statusLog.newValue.approvedBy) patch.approvedBy = statusLog.newValue.approvedBy;
  if (statusLog.newValue.status === 'approved') patch.approvalAt = statusLog.createdAt || FieldValue.serverTimestamp();
  return patch;
}

async function findClient(db, flags) {
  if (flags.clientId) {
    const snap = await db.collection('platformClients').doc(flags.clientId).get();
    if (snap.exists) return { id: snap.id, ...(snap.data() || {}) };
  }

  const clientsSnap = await db.collection('platformClients').get();
  const lowered = flags.clientName.toLowerCase();
  const match = clientsSnap.docs.find((docSnap) => {
    const data = docSnap.data() || {};
    return text(data.name).toLowerCase().includes(lowered) || lowered.includes(text(data.name).toLowerCase());
  });
  if (!match) throw new Error(`Could not find client ${flags.clientName}`);
  return { id: match.id, ...(match.data() || {}) };
}

async function main() {
  await loadLocalEnv();
  const appletConfig = await readAppletConfig();
  const flags = parseFlags();
  const projectId = process.env.FIREBASE_PROJECT_ID || appletConfig.projectId;
  const databaseId = process.env.FIRESTORE_DATABASE_ID || appletConfig.firestoreDatabaseId || '(default)';

  if (!projectId) throw new Error('Missing FIREBASE_PROJECT_ID');
  if (!process.env.GOOGLE_CLOUD_QUOTA_PROJECT) process.env.GOOGLE_CLOUD_QUOTA_PROJECT = projectId;

  const app =
    getApps()[0] ||
    initializeApp({
      projectId,
      credential: resolveCredential(),
    });
  const db = databaseId === '(default)' ? getFirestore(app) : getFirestore(app, databaseId);
  const client = await findClient(db, flags);

  const auditSnap = await db.collection('auditLogs').get();
  const logsByTarget = new Map();
  auditSnap.docs.forEach((docSnap) => {
    const entry = { id: docSnap.id, ...(docSnap.data() || {}) };
    const targetId = text(entry.targetId);
    if (!TARGET_IDS.includes(targetId)) return;
    if (!logsByTarget.has(targetId)) logsByTarget.set(targetId, []);
    logsByTarget.get(targetId).push(entry);
  });

  console.log(flags.write ? 'WRITE MODE: restoring inventory documents.' : 'DRY RUN: no data changed.');
  console.log(`Restoring to client: ${text(client.name)} (${client.id})`);

  const restorePlan = [];
  for (const targetId of TARGET_IDS) {
    const liveDoc = await db.collection('inventory').doc(targetId).get();
    const logs = (logsByTarget.get(targetId) || []).sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
    const restorable = logs.find(hasRestorablePayload);
    const statusPatch = latestStatusPatch(logs);

    console.log(`\n${targetId}`);
    console.log(`- live: ${liveDoc.exists ? 'exists' : 'missing'}`);
    console.log(`- audit events: ${logs.length}`);
    logs.forEach((entry) => {
      const payload = entry.newValue || entry.oldValue || {};
      console.log(`  ${toDateText(entry.createdAt)} | ${text(entry.action)} | actor=${text(entry.actorName)} | title=${text(payload.title || entry.description)} | keys=${Object.keys(payload).length}`);
    });

    if (liveDoc.exists) {
      if (flags.refreshStatus && statusPatch) {
        restorePlan.push({ targetId, payload: statusPatch, sourceLog: logs[0], statusOnly: true });
        console.log(`- status refresh: ready status=${statusPatch.status}`);
      }
      continue;
    }
    if (!restorable) {
      console.log('- restore: skipped, no full payload found');
      continue;
    }

    const payload = {
      ...(restorable.newValue || {}),
      ...(statusPatch || {}),
      clientId: client.id,
      clientName: text(client.name) || flags.clientName,
      status: statusPatch?.status || (restorable.newValue || {}).status || 'approved',
      visibilityScope: (restorable.newValue || {}).visibilityScope || 'internal',
      restoredFromAuditLogId: restorable.id,
      restoredAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (!payload.createdAt) {
      payload.createdAt = restorable.createdAt || FieldValue.serverTimestamp();
    }
    if (!payload.submitterId) {
      payload.submitterId = text(restorable.actorId) || text(client.adminUid) || 'restored';
    }
    if (!payload.submitterName) {
      payload.submitterName = text(restorable.actorName) || text(client.contactPerson) || text(client.name) || 'Restored';
    }

    restorePlan.push({ targetId, payload, sourceLog: restorable });
    console.log(`- restore: ready from ${restorable.id} (${toDateText(restorable.createdAt)}) title=${text(payload.title)} status=${text(payload.status)}`);
  }

  console.log(`\nPlanned writes: ${restorePlan.length}`);
  if (!flags.write) return;

  const batch = db.batch();
  restorePlan.forEach(({ targetId, payload }) => {
    batch.set(db.collection('inventory').doc(targetId), payload, { merge: true });
  });
  if (restorePlan.length > 0) await batch.commit();

  console.log(`Restored docs: ${restorePlan.length}`);
}

main().catch((error) => {
  console.error('Restore failed.');
  console.error(error);
  process.exit(1);
});

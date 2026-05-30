import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { initializeApp, applicationDefault, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

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

function toDateText(value) {
  if (!value) return '-';
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000).toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toISOString();
}

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

async function main() {
  await loadLocalEnv();
  const appletConfig = await readAppletConfig();
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

  console.log(`Project: ${projectId}`);
  console.log(`Database: ${databaseId}`);

  const clientsSnap = await db.collection('platformClients').get();
  console.log(`\nplatformClients (${clientsSnap.size})`);
  clientsSnap.docs.forEach((docSnap) => {
    const data = docSnap.data() || {};
    console.log(`- ${docSnap.id} | ${text(data.name)} | admin=${text(data.adminEmail)} | person=${text(data.contactPerson)}`);
  });

  const inventorySnap = await db.collection('inventory').get();
  console.log(`\ninventory (${inventorySnap.size})`);
  inventorySnap.docs.forEach((docSnap) => {
    const data = docSnap.data() || {};
    console.log(`- ${docSnap.id} | title=${text(data.title)} | client=${text(data.clientName)} (${text(data.clientId)}) | submitter=${text(data.submitterName)} (${text(data.submitterId)}) | status=${text(data.status)} | created=${toDateText(data.createdAt)}`);
  });

  const auditSnap = await db.collection('auditLogs').get();
  const inventoryLogs = auditSnap.docs
    .map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() || {}) }))
    .filter((entry) => text(entry.targetType).toLowerCase().includes('inventory') || text(entry.action).toLowerCase().includes('inventory'))
    .sort((a, b) => {
      const aMs = a.createdAt?.toMillis?.() || (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
      const bMs = b.createdAt?.toMillis?.() || (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
      return bMs - aMs;
    });

  console.log(`\ninventory audit logs (${inventoryLogs.length})`);
  inventoryLogs.slice(0, 80).forEach((entry) => {
    const oldTitle = text(entry.oldValue?.title);
    const newTitle = text(entry.newValue?.title);
    const title = newTitle || oldTitle || text(entry.description);
    const client = text(entry.newValue?.clientName || entry.oldValue?.clientName || entry.meta?.clientName);
    console.log(`- ${toDateText(entry.createdAt)} | ${text(entry.action)} | target=${text(entry.targetId)} | title=${title} | client=${client} | actor=${text(entry.actorName)} | ${text(entry.description)}`);
  });

  const liveInventoryIds = new Set(inventorySnap.docs.map((docSnap) => docSnap.id));
  const missingTargets = new Map();
  inventoryLogs.forEach((entry) => {
    const targetId = text(entry.targetId);
    if (!targetId || liveInventoryIds.has(targetId) || missingTargets.has(targetId)) return;
    missingTargets.set(targetId, entry);
  });

  console.log(`\ninventory log targets missing from live collection (${missingTargets.size})`);
  [...missingTargets.values()].forEach((entry) => {
    const payload = entry.newValue || entry.oldValue || {};
    console.log(`- ${text(entry.targetId)} | action=${text(entry.action)} | title=${text(payload.title || entry.description)} | actor=${text(entry.actorName)} | created=${toDateText(entry.createdAt)} | payloadKeys=${Object.keys(payload).join(',')}`);
  });
}

main().catch((error) => {
  console.error('Diagnosis failed.');
  console.error(error);
  process.exit(1);
});

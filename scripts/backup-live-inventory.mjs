import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { initializeApp, applicationDefault, cert, getApps } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

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
  const inventorySnap = await db.collection('inventory').get();
  let batch = db.batch();
  let ops = 0;
  let backedUp = 0;

  for (const docSnap of inventorySnap.docs) {
    const data = docSnap.data() || {};
    const backupRef = db.collection('inventoryBackups').doc(`${docSnap.id}_live_${Date.now()}`);
    batch.set(backupRef, {
      inventoryId: docSnap.id,
      action: 'live_inventory_backup',
      clientId: String(data.clientId || ''),
      clientName: String(data.clientName || ''),
      title: String(data.title || ''),
      snapshot: data,
      actorId: 'system',
      actorName: 'System',
      actorRole: 'system',
      createdAt: FieldValue.serverTimestamp(),
    });
    ops += 1;
    backedUp += 1;
    if (ops >= 450) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }

  if (ops > 0) await batch.commit();
  console.log(`Live inventory backups created: ${backedUp}`);
}

main().catch((error) => {
  console.error('Backup failed.');
  console.error(error);
  process.exit(1);
});

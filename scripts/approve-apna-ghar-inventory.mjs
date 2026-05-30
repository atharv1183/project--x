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
  const clientId = 'xRVautWTEXrhBI3OLbUK';
  const snap = await db.collection('inventory').where('clientId', '==', clientId).get();
  const batch = db.batch();
  let changed = 0;

  snap.docs.forEach((docSnap) => {
    const data = docSnap.data() || {};
    if (data.deletedAt || data.status === 'approved') return;
    batch.set(docSnap.ref, {
      status: 'approved',
      approvedBy: data.approvedBy || 'Platform Admin',
      approvalAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    changed += 1;
  });

  if (changed > 0) await batch.commit();
  console.log(`Apna Ghar inventory approved: ${changed}`);
}

main().catch((error) => {
  console.error('Approve failed.');
  console.error(error);
  process.exit(1);
});

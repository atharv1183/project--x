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
  const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
  try {
    const raw = await fs.readFile(configPath, 'utf8');
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
    diagnose: args.includes('--diagnose'),
    clientId: get('--client-id') || '',
    clientName: get('--client-name') || 'Apna Ghar',
    sourceClientId: get('--source-client-id') || '',
  };
}

function norm(value) {
  return String(value || '').trim().toLowerCase();
}

function hasText(value, target) {
  return norm(value).includes(norm(target));
}

async function commitInChunks(db, refs, payloadFactory) {
  let batch = db.batch();
  let ops = 0;
  let changed = 0;
  for (const ref of refs) {
    batch.set(ref, payloadFactory(ref), { merge: true });
    ops += 1;
    changed += 1;
    if (ops >= 450) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }
  if (ops > 0) await batch.commit();
  return changed;
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

  let clientDoc = null;
  if (flags.clientId) {
    const snap = await db.collection('platformClients').doc(flags.clientId).get();
    if (snap.exists) clientDoc = snap;
  }

  if (!clientDoc) {
    const clientsSnap = await db.collection('platformClients').get();
    clientDoc = clientsSnap.docs.find((docSnap) => {
      const data = docSnap.data() || {};
      return hasText(data.name, flags.clientName) || hasText(data.contactPerson, flags.clientName);
    });
  }

  if (!clientDoc) throw new Error(`Could not find platform client for ${flags.clientName}. Pass --client-id explicitly.`);

  const clientId = clientDoc.id;
  const clientData = clientDoc.data() || {};
  const clientName = String(clientData.name || flags.clientName);

  const usersSnap = await db.collection('users').get();
  const clientUserIds = new Set();
  const clientPhones = new Set();
  usersSnap.docs.forEach((docSnap) => {
    const data = docSnap.data() || {};
    const belongsToClient =
      String(data.clientId || '') === clientId ||
      hasText(data.clientName, clientName) ||
      hasText(data.brandCompanyName, clientName);
    if (!belongsToClient) return;
    clientUserIds.add(docSnap.id);
    const phone = String(data.phone || '').replace(/\D/g, '');
    if (phone) clientPhones.add(phone);
  });

  const inventorySnap = await db.collection('inventory').get();
  const targets = [];
  const alreadyMapped = [];
  const otherClientMatches = [];
  const inventoryByClient = new Map();
  const sampleInventory = [];

  inventorySnap.docs.forEach((docSnap) => {
    const data = docSnap.data() || {};
    const submitterId = String(data.submitterId || '');
    const brokerPhone = String(data.brokerPhone || '').replace(/\D/g, '');
    const currentClientId = String(data.clientId || '').trim();
    const bucket = currentClientId || '(missing)';
    inventoryByClient.set(bucket, (inventoryByClient.get(bucket) || 0) + 1);
    if (sampleInventory.length < 12) {
      sampleInventory.push({
        id: docSnap.id,
        title: String(data.title || ''),
        submitterId,
        submitterName: String(data.submitterName || ''),
        clientId: currentClientId || '(missing)',
        clientName: String(data.clientName || ''),
        status: String(data.status || ''),
      });
    }
    const looksLikeClientItem =
      currentClientId === clientId ||
      (flags.sourceClientId && currentClientId === flags.sourceClientId) ||
      hasText(data.clientName, clientName) ||
      hasText(data.companyName, clientName) ||
      clientUserIds.has(submitterId) ||
      (brokerPhone && clientPhones.has(brokerPhone));

    if (!looksLikeClientItem) return;
    if (currentClientId === clientId) {
      alreadyMapped.push(docSnap.id);
      return;
    }
    if (currentClientId && currentClientId !== clientId) {
      otherClientMatches.push(`${docSnap.id} currently=${currentClientId}`);
    }
    targets.push(docSnap.ref);
  });

  console.log(flags.write ? 'WRITE MODE: updating inventory.' : 'DRY RUN: no data changed.');
  console.log(`Resolved client: ${clientName} (${clientId})`);
  console.log(`Client users found: ${clientUserIds.size}`);
  console.log(`Total inventory docs: ${inventorySnap.size}`);
  console.log(`Inventory already mapped: ${alreadyMapped.length}`);
  console.log(`Inventory to repair: ${targets.length}`);
  if (otherClientMatches.length > 0) {
    console.log('Matching inventory currently mapped to another client:');
    otherClientMatches.forEach((line) => console.log(`- ${line}`));
  }

  if (flags.diagnose) {
    console.log('Inventory by clientId:');
    [...inventoryByClient.entries()]
      .sort((a, b) => b[1] - a[1])
      .forEach(([id, count]) => console.log(`- ${id}: ${count}`));
    console.log('Inventory sample:');
    sampleInventory.forEach((item) => console.log(`- ${JSON.stringify(item)}`));
  }

  if (!flags.write) return;

  const changed = await commitInChunks(db, targets, () => ({
    clientId,
    clientName,
    visibilityScope: 'internal',
    updatedAt: FieldValue.serverTimestamp(),
  }));

  console.log(`Inventory repaired: ${changed}`);
}

main().catch((error) => {
  console.error('Repair failed.');
  console.error(error);
  process.exit(1);
});

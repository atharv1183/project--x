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
    const i = args.findIndex((a) => a === name);
    return i >= 0 ? args[i + 1] : '';
  };
  return {
    write: args.includes('--write'),
    clientName: get('--client-name') || 'Apna Ghar',
    adminPhone: get('--admin-phone') || '8504899720',
  };
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
  if (!projectId) throw new Error('Missing FIREBASE_PROJECT_ID');
  if (!process.env.GOOGLE_CLOUD_QUOTA_PROJECT) {
    process.env.GOOGLE_CLOUD_QUOTA_PROJECT = projectId;
  }

  const app =
    getApps()[0] ||
    initializeApp({
      projectId,
      credential: resolveCredential(),
    });
  const db = getFirestore(app);

  const allUsersSnap = await db.collection('users').get();
  const legacyUsers = allUsersSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() || {}) }))
    .filter((u) => !String(u.clientId || '').trim())
    .filter((u) => u.role !== 'super_admin');

  const adminUser =
    legacyUsers.find((u) => String(u.phone || '').replace(/\D/g, '') === flags.adminPhone)
    || legacyUsers.find((u) => u.role === 'admin')
    || legacyUsers[0];

  if (!adminUser) {
    throw new Error('No legacy users found to restore.');
  }

  const existingClientSnap = await db.collection('platformClients').where('adminUid', '==', adminUser.id).limit(1).get();
  let clientRef = existingClientSnap.docs[0]?.ref;

  if (!clientRef) {
    const fallbackByEmail = await db
      .collection('platformClients')
      .where('adminEmail', '==', String(adminUser.email || ''))
      .limit(1)
      .get();
    clientRef = fallbackByEmail.docs[0]?.ref;
  }

  if (!clientRef && flags.write) {
    clientRef = db.collection('platformClients').doc();
    await clientRef.set({
      name: flags.clientName,
      contactPerson: String(adminUser.name || 'Platform Admin'),
      mobileNumber: String(adminUser.phone || ''),
      email: String(adminUser.email || ''),
      address: '',
      gstn: '',
      logoUrl: '',
      state: 'active',
      trialDays: 0,
      subscriptionStartDate: '',
      subscriptionExpiryDate: '',
      paymentStatus: 'n/a',
      adminUid: adminUser.id,
      adminEmail: String(adminUser.email || ''),
      createdBy: adminUser.id,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  if (!clientRef) {
    throw new Error('Client record not found. Re-run with --write to create.');
  }

  const clientId = clientRef.id;
  const clientName = flags.clientName;

  const legacyUserIds = new Set(legacyUsers.map((u) => u.id));

  const usersToFixRefs = legacyUsers.map((u) => db.collection('users').doc(u.id));
  const employeeDirectorySnap = await db.collection('employeeDirectory').get();
  const employeeDirectoryRefs = employeeDirectorySnap.docs
    .filter((d) => legacyUserIds.has(d.id))
    .map((d) => d.ref);

  const leadsSnap = await db.collection('leads').get();
  const leadRefs = leadsSnap.docs
    .filter((d) => {
      const data = d.data() || {};
      if (String(data.clientId || '').trim()) return false;
      return legacyUserIds.has(String(data.assignedTo || '')) || legacyUserIds.has(String(data.addedById || ''));
    })
    .map((d) => d.ref);

  const inventorySnap = await db.collection('inventory').get();
  const inventoryRefs = inventorySnap.docs
    .filter((d) => {
      const data = d.data() || {};
      if (String(data.clientId || '').trim()) return false;
      return legacyUserIds.has(String(data.submitterId || ''));
    })
    .map((d) => d.ref);

  if (!flags.write) {
    console.log('DRY RUN: no data changed.');
    console.log(`Resolved clientId: ${clientId}`);
    console.log(`Legacy users to map: ${usersToFixRefs.length}`);
    console.log(`Employee directory docs to map: ${employeeDirectoryRefs.length}`);
    console.log(`Leads to map: ${leadRefs.length}`);
    console.log(`Inventory docs to map: ${inventoryRefs.length}`);
    return;
  }

  const usersFixed = await commitInChunks(db, usersToFixRefs, () => ({
    clientId,
    clientName,
    updatedAt: FieldValue.serverTimestamp(),
  }));
  const employeeDirectoryFixed = await commitInChunks(db, employeeDirectoryRefs, () => ({
    clientId,
    clientName,
    updatedAt: FieldValue.serverTimestamp(),
  }));
  const leadsFixed = await commitInChunks(db, leadRefs, () => ({
    clientId,
    clientName,
    updatedAt: FieldValue.serverTimestamp(),
  }));
  const inventoryFixed = await commitInChunks(db, inventoryRefs, () => ({
    clientId,
    clientName,
    updatedAt: FieldValue.serverTimestamp(),
  }));

  await clientRef.set(
    {
      name: clientName,
      adminUid: adminUser.id,
      adminEmail: String(adminUser.email || ''),
      mobileNumber: String(adminUser.phone || ''),
      contactPerson: String(adminUser.name || 'Platform Admin'),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  console.log('WRITE MODE: restoration applied.');
  console.log(`clientId: ${clientId}`);
  console.log(`Users mapped: ${usersFixed}`);
  console.log(`EmployeeDirectory mapped: ${employeeDirectoryFixed}`);
  console.log(`Leads mapped: ${leadsFixed}`);
  console.log(`Inventory mapped: ${inventoryFixed}`);
}

main().catch((error) => {
  console.error('Restore failed.');
  console.error(error);
  process.exit(1);
});

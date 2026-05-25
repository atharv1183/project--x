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
  if (serviceAccountRaw) {
    return cert(JSON.parse(serviceAccountRaw));
  }
  return applicationDefault();
}

function requiredEnv(name, fallback) {
  const value = process.env[name] || fallback;
  if (!value) {
    throw new Error(`Missing required value: ${name}`);
  }
  return value;
}

function parseFlags() {
  const args = process.argv.slice(2);
  return {
    write: args.includes('--write'),
    includeBrokers: !args.includes('--only-employee-directory'),
    includeEmployeeDirectory: !args.includes('--only-brokers'),
    includeLeads: !args.includes('--skip-leads'),
  };
}

async function backfillClientIds() {
  await loadLocalEnv();
  const appletConfig = await readAppletConfig();
  const flags = parseFlags();

  const projectId = requiredEnv('FIREBASE_PROJECT_ID', appletConfig.projectId);
  const databaseId = process.env.FIRESTORE_DATABASE_ID || appletConfig.firestoreDatabaseId || '(default)';

  if (!process.env.GOOGLE_CLOUD_QUOTA_PROJECT) {
    process.env.GOOGLE_CLOUD_QUOTA_PROJECT = projectId;
  }

  const app =
    getApps()[0] ||
    initializeApp({
      projectId,
      credential: resolveCredential(),
    });

  const db = databaseId === '(default)' ? getFirestore(app) : getFirestore(app, databaseId);

  const usersSnapshot = await db.collection('users').get();
  const usersByUid = new Map();
  const usersByPhone = new Map();
  usersSnapshot.docs.forEach((docSnap) => {
    const data = docSnap.data() || {};
    usersByUid.set(docSnap.id, data);
    const phone = String(data.phone || '').replace(/\D/g, '');
    if (phone) usersByPhone.set(phone, data);
  });

  let updatedEmployeeDirectory = 0;
  let updatedBrokers = 0;
  let updatedLeads = 0;
  const unresolved = [];

  if (flags.includeEmployeeDirectory) {
    const employeeSnapshot = await db.collection('employeeDirectory').get();
    const employeeTargets = employeeSnapshot.docs.filter((docSnap) => {
      const data = docSnap.data() || {};
      return !(typeof data.clientId === 'string' && data.clientId.trim());
    });

    if (flags.write && employeeTargets.length > 0) {
      let batch = db.batch();
      let ops = 0;
      for (const docSnap of employeeTargets) {
        const userData = usersByUid.get(docSnap.id);
        const clientId = String(userData?.clientId || '').trim();
        const clientName = String(userData?.clientName || '').trim();
        if (!clientId) {
          unresolved.push(`employeeDirectory/${docSnap.id} (missing clientId in users/${docSnap.id})`);
          continue;
        }
        batch.set(
          docSnap.ref,
          {
            clientId,
            clientName: clientName || null,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
        updatedEmployeeDirectory += 1;
        ops += 1;
        if (ops >= 450) {
          await batch.commit();
          batch = db.batch();
          ops = 0;
        }
      }
      if (ops > 0) await batch.commit();
    } else {
      for (const docSnap of employeeTargets) {
        const userData = usersByUid.get(docSnap.id);
        const clientId = String(userData?.clientId || '').trim();
        if (!clientId) unresolved.push(`employeeDirectory/${docSnap.id} (missing clientId in users/${docSnap.id})`);
      }
      updatedEmployeeDirectory = employeeTargets.filter((docSnap) => {
        const userData = usersByUid.get(docSnap.id);
        return Boolean(String(userData?.clientId || '').trim());
      }).length;
    }

    console.log(`employeeDirectory missing clientId: ${employeeTargets.length}`);
  }

  if (flags.includeBrokers) {
    const brokerSnapshot = await db.collection('brokers').get();
    const brokerTargets = brokerSnapshot.docs.filter((docSnap) => {
      const data = docSnap.data() || {};
      return !(typeof data.clientId === 'string' && data.clientId.trim());
    });

    if (flags.write && brokerTargets.length > 0) {
      let batch = db.batch();
      let ops = 0;
      for (const docSnap of brokerTargets) {
        const data = docSnap.data() || {};
        const createdBy = String(data.createdBy || '').trim();
        const normalizedPhone = String(data.phone || '').replace(/\D/g, '');
        const userFromCreator = createdBy ? usersByUid.get(createdBy) : null;
        const userFromPhone = normalizedPhone ? usersByPhone.get(normalizedPhone) : null;
        const sourceUser = userFromCreator || userFromPhone;
        const clientId = String(sourceUser?.clientId || '').trim();
        const clientName = String(sourceUser?.clientName || '').trim();
        if (!clientId) {
          unresolved.push(`brokers/${docSnap.id} (no clientId via createdBy/phone mapping)`);
          continue;
        }
        batch.set(
          docSnap.ref,
          {
            clientId,
            clientName: clientName || null,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
        updatedBrokers += 1;
        ops += 1;
        if (ops >= 450) {
          await batch.commit();
          batch = db.batch();
          ops = 0;
        }
      }
      if (ops > 0) await batch.commit();
    } else {
      for (const docSnap of brokerTargets) {
        const data = docSnap.data() || {};
        const createdBy = String(data.createdBy || '').trim();
        const normalizedPhone = String(data.phone || '').replace(/\D/g, '');
        const userFromCreator = createdBy ? usersByUid.get(createdBy) : null;
        const userFromPhone = normalizedPhone ? usersByPhone.get(normalizedPhone) : null;
        const sourceUser = userFromCreator || userFromPhone;
        if (!String(sourceUser?.clientId || '').trim()) {
          unresolved.push(`brokers/${docSnap.id} (no clientId via createdBy/phone mapping)`);
        }
      }
      updatedBrokers = brokerTargets.filter((docSnap) => {
        const data = docSnap.data() || {};
        const createdBy = String(data.createdBy || '').trim();
        const normalizedPhone = String(data.phone || '').replace(/\D/g, '');
        const userFromCreator = createdBy ? usersByUid.get(createdBy) : null;
        const userFromPhone = normalizedPhone ? usersByPhone.get(normalizedPhone) : null;
        return Boolean(String((userFromCreator || userFromPhone)?.clientId || '').trim());
      }).length;
    }

    console.log(`brokers missing clientId: ${brokerTargets.length}`);
  }

  if (flags.includeLeads) {
    const leadsSnapshot = await db.collection('leads').get();
    const leadTargets = leadsSnapshot.docs.filter((docSnap) => {
      const data = docSnap.data() || {};
      return !(typeof data.clientId === 'string' && data.clientId.trim());
    });

    if (flags.write && leadTargets.length > 0) {
      let batch = db.batch();
      let ops = 0;
      for (const docSnap of leadTargets) {
        const data = docSnap.data() || {};
        const assignedTo = String(data.assignedTo || '').trim();
        const addedById = String(data.addedById || '').trim();
        const ownerUser = usersByUid.get(assignedTo) || usersByUid.get(addedById);
        const clientId = String(ownerUser?.clientId || '').trim();
        const clientName = String(ownerUser?.clientName || '').trim();
        if (!clientId) {
          unresolved.push(`leads/${docSnap.id} (no clientId via assignedTo/addedById mapping)`);
          continue;
        }
        batch.set(
          docSnap.ref,
          {
            clientId,
            clientName: clientName || null,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
        updatedLeads += 1;
        ops += 1;
        if (ops >= 450) {
          await batch.commit();
          batch = db.batch();
          ops = 0;
        }
      }
      if (ops > 0) await batch.commit();
    } else {
      for (const docSnap of leadTargets) {
        const data = docSnap.data() || {};
        const assignedTo = String(data.assignedTo || '').trim();
        const addedById = String(data.addedById || '').trim();
        const ownerUser = usersByUid.get(assignedTo) || usersByUid.get(addedById);
        if (!String(ownerUser?.clientId || '').trim()) {
          unresolved.push(`leads/${docSnap.id} (no clientId via assignedTo/addedById mapping)`);
        }
      }
      updatedLeads = leadTargets.filter((docSnap) => {
        const data = docSnap.data() || {};
        const assignedTo = String(data.assignedTo || '').trim();
        const addedById = String(data.addedById || '').trim();
        const ownerUser = usersByUid.get(assignedTo) || usersByUid.get(addedById);
        return Boolean(String(ownerUser?.clientId || '').trim());
      }).length;
    }

    console.log(`leads missing clientId: ${leadTargets.length}`);
  }

  console.log('');
  console.log(flags.write ? 'WRITE MODE: updates applied.' : 'DRY RUN: no data changed.');
  console.log(`Resolvable employeeDirectory updates: ${updatedEmployeeDirectory}`);
  console.log(`Resolvable brokers updates: ${updatedBrokers}`);
  console.log(`Resolvable leads updates: ${updatedLeads}`);
  console.log(`Unresolved docs: ${unresolved.length}`);
  if (unresolved.length > 0) {
    console.log('Unresolved list:');
    unresolved.forEach((line) => console.log(`- ${line}`));
  }
}

backfillClientIds().catch((error) => {
  console.error('Backfill failed.');
  console.error(error);
  process.exit(1);
});

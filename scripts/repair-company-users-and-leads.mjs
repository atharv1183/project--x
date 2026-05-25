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

function requiredEnv(name, fallback) {
  const value = process.env[name] || fallback;
  if (!value) throw new Error(`Missing required value: ${name}`);
  return value;
}

function parseFlags() {
  const args = process.argv.slice(2);
  const get = (name) => {
    const i = args.findIndex((a) => a === name);
    return i >= 0 ? args[i + 1] : '';
  };
  return {
    write: args.includes('--write'),
    clientId: get('--client-id') || '',
    clientName: get('--client-name') || '',
    phones: (get('--phones') || '')
      .split(',')
      .map((x) => x.replace(/\D/g, '').trim())
      .filter(Boolean),
  };
}

async function main() {
  await loadLocalEnv();
  const appletConfig = await readAppletConfig();
  const flags = parseFlags();

  if (!flags.clientId) throw new Error('Pass --client-id <platformClientId>');
  if (flags.phones.length === 0) throw new Error('Pass --phones "9999999999,8888888888"');

  const projectId = requiredEnv('FIREBASE_PROJECT_ID', appletConfig.projectId);
  const databaseId = process.env.FIRESTORE_DATABASE_ID || appletConfig.firestoreDatabaseId || '(default)';
  if (!process.env.GOOGLE_CLOUD_QUOTA_PROJECT) process.env.GOOGLE_CLOUD_QUOTA_PROJECT = projectId;

  const app =
    getApps()[0] ||
    initializeApp({
      projectId,
      credential: resolveCredential(),
    });
  const db = databaseId === '(default)' ? getFirestore(app) : getFirestore(app, databaseId);

  let fixedUsers = 0;
  let fixedEmployeeDirectory = 0;
  let fixedLeads = 0;
  const unresolved = [];

  for (const phone of flags.phones) {
    const userSn = await db.collection('users').where('phone', '==', phone).limit(1).get();
    if (userSn.empty) {
      unresolved.push(`phone ${phone}: user not found`);
      continue;
    }
    const userDoc = userSn.docs[0];
    const uid = userDoc.id;
    const userData = userDoc.data() || {};
    const chosenClientName = flags.clientName || String(userData.clientName || '').trim() || null;

    if (flags.write) {
      await userDoc.ref.set(
        {
          clientId: flags.clientId,
          clientName: chosenClientName,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }
    fixedUsers += 1;

    const edRef = db.collection('employeeDirectory').doc(uid);
    const edSn = await edRef.get();
    if (edSn.exists) {
      if (flags.write) {
        await edRef.set(
          {
            clientId: flags.clientId,
            clientName: chosenClientName,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      }
      fixedEmployeeDirectory += 1;
    }

    const [assignedLeads, addedLeads] = await Promise.all([
      db.collection('leads').where('assignedTo', '==', uid).get(),
      db.collection('leads').where('addedById', '==', uid).get(),
    ]);

    const uniqueLeads = new Map();
    assignedLeads.docs.forEach((d) => uniqueLeads.set(d.id, d));
    addedLeads.docs.forEach((d) => uniqueLeads.set(d.id, d));

    if (flags.write && uniqueLeads.size > 0) {
      let batch = db.batch();
      let ops = 0;
      for (const leadDoc of uniqueLeads.values()) {
        batch.set(
          leadDoc.ref,
          {
            clientId: flags.clientId,
            clientName: chosenClientName,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
        fixedLeads += 1;
        ops += 1;
        if (ops >= 450) {
          await batch.commit();
          batch = db.batch();
          ops = 0;
        }
      }
      if (ops > 0) await batch.commit();
    } else {
      fixedLeads += uniqueLeads.size;
    }
  }

  console.log(flags.write ? 'WRITE MODE: updates applied.' : 'DRY RUN: no data changed.');
  console.log(`Users to fix: ${fixedUsers}`);
  console.log(`EmployeeDirectory docs to fix: ${fixedEmployeeDirectory}`);
  console.log(`Leads to fix: ${fixedLeads}`);
  if (unresolved.length > 0) {
    console.log('Unresolved:');
    unresolved.forEach((x) => console.log(`- ${x}`));
  }
}

main().catch((error) => {
  console.error('Repair failed.');
  console.error(error);
  process.exit(1);
});


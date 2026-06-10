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
    return JSON.parse(await fs.readFile(configPath, 'utf8'));
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
    adminUid: get('--admin-uid'),
    adminEmail: get('--admin-email'),
    clientId: get('--client-id'),
  };
}

async function main() {
  await loadLocalEnv();
  const appletConfig = await readAppletConfig();
  const flags = parseFlags();
  const projectId = process.env.FIREBASE_PROJECT_ID || appletConfig.projectId;
  const databaseId = process.env.FIRESTORE_DATABASE_ID || appletConfig.firestoreDatabaseId || '(default)';

  if (!flags.adminUid && !flags.adminEmail) {
    throw new Error('Pass --admin-uid <uid> and/or --admin-email <email>');
  }

  const app =
    getApps()[0] ||
    initializeApp({
      projectId,
      credential: resolveCredential(),
    });
  const db = databaseId === '(default)' ? getFirestore(app) : getFirestore(app, databaseId);

  let clientRef = null;
  if (flags.clientId) {
    const snap = await db.collection('platformClients').doc(flags.clientId).get();
    if (!snap.exists) throw new Error(`platformClients/${flags.clientId} not found`);
    clientRef = snap;
  } else if (flags.adminUid) {
    const byUid = await db.collection('platformClients').where('adminUid', '==', flags.adminUid).limit(1).get();
    if (!byUid.empty) clientRef = byUid.docs[0];
  }
  if (!clientRef && flags.adminEmail) {
    const byEmail = await db.collection('platformClients').where('adminEmail', '==', flags.adminEmail).limit(1).get();
    if (!byEmail.empty) clientRef = byEmail.docs[0];
  }
  if (!clientRef && flags.adminUid) {
    const userSnap = await db.collection('users').doc(flags.adminUid).get();
    const phone = String(userSnap.data()?.phone || '').replace(/\D/g, '');
    if (phone) {
      const byMobile = await db.collection('platformClients').where('mobileNumber', '==', phone).limit(1).get();
      if (!byMobile.empty) clientRef = byMobile.docs[0];
    }
  }
  if (!clientRef) {
    throw new Error('No matching platformClients document found.');
  }

  const clientId = clientRef.id;
  const clientData = clientRef.data() || {};
  const adminUid = flags.adminUid || String(clientData.adminUid || '');
  const adminEmail = flags.adminEmail || String(clientData.adminEmail || '');

  console.log('Matched client:', clientId, clientData.name || '(no name)');
  console.log('Current adminUid:', clientData.adminUid || '(missing)');
  console.log('Current adminEmail:', clientData.adminEmail || '(missing)');
  console.log('Target adminUid:', adminUid || '(missing)');
  console.log('Target adminEmail:', adminEmail || '(missing)');

  if (!flags.write) {
    console.log('\nDRY RUN: pass --write to apply fixes.');
    return;
  }

  const now = FieldValue.serverTimestamp();
  await clientRef.ref.set(
    {
      adminUid: adminUid || null,
      adminEmail: adminEmail || null,
      updatedAt: now,
    },
    { merge: true },
  );

  if (adminUid) {
    await db.collection('users').doc(adminUid).set(
      {
        clientId,
        clientName: clientData.name || null,
        updatedAt: now,
      },
      { merge: true },
    );
    await db.collection('clientAdmins').doc(adminUid).set({ clientId }, { merge: true });
  }

  console.log('\nWRITE MODE: client admin link repaired.');
}

main().catch((error) => {
  console.error('Link repair failed.');
  console.error(error);
  process.exit(1);
});

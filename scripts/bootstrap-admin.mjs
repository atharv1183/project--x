import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { initializeApp, applicationDefault, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
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

async function bootstrapAdmin() {
  await loadLocalEnv();
  const appletConfig = await readAppletConfig();

  const projectId = requiredEnv('FIREBASE_PROJECT_ID', appletConfig.projectId);
  const databaseId = process.env.FIRESTORE_DATABASE_ID || appletConfig.firestoreDatabaseId || '(default)';
  const adminPhone = requiredEnv('ADMIN_PHONE', null).replace(/\D/g, '');
  const adminName = requiredEnv('ADMIN_NAME', 'Platform Admin');
  const adminPassword = requiredEnv('ADMIN_PASSWORD', null);
  const adminEmail = process.env.ADMIN_EMAIL || `${adminPhone}@estatepulse.com`;

  // Keep API quota/billing aligned with the Firebase project when ADC is used.
  if (!process.env.GOOGLE_CLOUD_QUOTA_PROJECT) {
    process.env.GOOGLE_CLOUD_QUOTA_PROJECT = projectId;
  }

  if (adminPhone.length < 10 || adminPhone.length > 15) {
    throw new Error('ADMIN_PHONE must contain 10 to 15 digits.');
  }
  if (adminPassword.length < 8) {
    throw new Error('ADMIN_PASSWORD must be at least 8 characters.');
  }

  const app = getApps()[0] || initializeApp({
    projectId,
    credential: resolveCredential(),
  });

  const auth = getAuth(app);
  const db = databaseId === '(default)' ? getFirestore(app) : getFirestore(app, databaseId);

  let userRecord;
  try {
    userRecord = await auth.getUserByEmail(adminEmail);
    await auth.updateUser(userRecord.uid, {
      displayName: adminName,
      password: adminPassword,
    });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'auth/user-not-found') {
      userRecord = await auth.createUser({
        email: adminEmail,
        password: adminPassword,
        displayName: adminName,
      });
    } else {
      throw error;
    }
  }

  await auth.setCustomUserClaims(userRecord.uid, { role: 'admin' });

  const userRef = db.collection('users').doc(userRecord.uid);
  const userSnap = await userRef.get();

  if (userSnap.exists) {
    await userRef.set(
      {
        name: adminName,
        email: adminEmail,
        phone: adminPhone,
        role: 'admin',
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  } else {
    await userRef.set({
      name: adminName,
      email: adminEmail,
      phone: adminPhone,
      role: 'admin',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  // Keep admin out of employeeDirectory if stale data exists.
  await db.collection('employeeDirectory').doc(userRecord.uid).delete().catch(() => {});

  console.log('Admin bootstrap complete.');
  console.log(`Project: ${projectId}`);
  console.log(`Database: ${databaseId}`);
  console.log(`Admin UID: ${userRecord.uid}`);
  console.log(`Admin Email: ${adminEmail}`);
}

bootstrapAdmin().catch((error) => {
  console.error('Failed to bootstrap admin account.');
  console.error(error);
  process.exit(1);
});

import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { initializeApp, applicationDefault, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

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

function requiredEnv(name, fallback = null) {
  const value = process.env[name] || fallback;
  if (!value) {
    throw new Error(`Missing required value: ${name}`);
  }
  return value;
}

function resolveAdminRole() {
  const rawRole = (process.env.ADMIN_ROLE || 'admin').trim().toLowerCase();
  const allowedRoles = new Set(['admin', 'super_admin']);
  if (!allowedRoles.has(rawRole)) {
    throw new Error('ADMIN_ROLE must be either "admin" or "super_admin".');
  }
  return rawRole;
}

async function resetAdminPassword() {
  await loadLocalEnv();
  const appletConfig = await readAppletConfig();

  const projectId = requiredEnv('FIREBASE_PROJECT_ID', appletConfig.projectId);
  const adminPhone = process.env.ADMIN_PHONE?.replace(/\D/g, '') || '';
  const adminEmail = process.env.ADMIN_EMAIL || (adminPhone ? `${adminPhone}@estatepulse.com` : null);
  const newPassword = requiredEnv('ADMIN_PASSWORD', null);
  const adminRole = resolveAdminRole();

  // Keep API quota/billing aligned with the Firebase project when ADC is used.
  if (!process.env.GOOGLE_CLOUD_QUOTA_PROJECT) {
    process.env.GOOGLE_CLOUD_QUOTA_PROJECT = projectId;
  }

  if (!adminEmail) {
    throw new Error('Set ADMIN_EMAIL or ADMIN_PHONE to identify the admin account.');
  }
  if (newPassword.length < 8) {
    throw new Error('ADMIN_PASSWORD must be at least 8 characters.');
  }

  const app = getApps()[0] || initializeApp({
    projectId,
    credential: resolveCredential(),
  });

  const auth = getAuth(app);
  const userRecord = await auth.getUserByEmail(adminEmail);
  await auth.updateUser(userRecord.uid, { password: newPassword });
  await auth.setCustomUserClaims(userRecord.uid, { role: adminRole });

  console.log('Admin password reset complete.');
  console.log(`Project: ${projectId}`);
  console.log(`Role: ${adminRole}`);
  console.log(`Admin UID: ${userRecord.uid}`);
  console.log(`Admin Email: ${adminEmail}`);
}

resetAdminPassword().catch((error) => {
  console.error('Failed to reset admin password.');
  console.error(error);
  process.exit(1);
});

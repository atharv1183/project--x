import { initializeApp, deleteApp, type FirebaseApp } from 'firebase/app';
import { createUserWithEmailAndPassword, inMemoryPersistence, initializeAuth, signOut } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import { auth } from './firebase';
import firebaseConfig from '../../firebase-applet-config.json';

type MemberRole = 'employee' | 'manager';

export function isCallableUnavailable(error: unknown): boolean {
  const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: string }).code) : '';
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  const normalizedCode = code.replace(/^functions\//, '');
  return (
    normalizedCode === 'internal' ||
    normalizedCode === 'unavailable' ||
    normalizedCode === 'not-found' ||
    normalizedCode === 'deadline-exceeded' ||
    normalizedCode === 'cancelled' ||
    message === 'internal' ||
    message.includes('cors') ||
    message.includes('failed to fetch') ||
    message.includes('err_failed') ||
    message.includes('network error') ||
    message.includes('cloud function')
  );
}

// Cloud Functions need the Blaze plan. Use direct Firestore provisioning instead.
export function shouldUseLocalProvisioning(): boolean {
  return true;
}

export async function syncTenantMapping(
  db: Firestore,
  userId: string,
  tenantClientId: string,
  clientName: string | null,
) {
  if (!tenantClientId) return;
  try {
    await setDoc(doc(db, 'clientAdmins', userId), { clientId: tenantClientId }, { merge: true });
  } catch {
    // platformClients ownership rules can still authorize team-member writes.
  }
  try {
    await updateDoc(doc(db, 'users', userId), {
      clientId: tenantClientId,
      ...(clientName ? { clientName } : {}),
      updatedAt: serverTimestamp(),
    });
  } catch {
    // platformClients ownership rules can still authorize team-member writes.
  }
}

export async function createAuthUserRest(email: string, initialPassword: string): Promise<{ uid: string; idToken: string }> {
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${firebaseConfig.apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password: initialPassword,
      returnSecureToken: true,
    }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    const message = errData?.error?.message || 'Failed to create auth user via REST API';
    if (message === 'EMAIL_EXISTS') {
      throw Object.assign(new Error('This mobile number is tied to an old login account. Restore that member from Team if visible, or contact super admin.'), {
        code: 'auth/email-already-in-use',
      });
    }
    if (message.includes('WEAK_PASSWORD')) {
      throw Object.assign(new Error('Unable to set initial password. Please use a valid mobile number.'), {
        code: 'auth/weak-password',
      });
    }
    throw new Error(message);
  }

  const data = await response.json();
  return {
    uid: data.localId,
    idToken: data.idToken,
  };
}

export async function deleteAuthUserRest(idToken: string): Promise<void> {
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${firebaseConfig.apiKey}`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  }).catch(() => {});
}

/**
 * Sign in an existing Auth user via REST to retrieve their UID and idToken.
 * Used to recover from EMAIL_EXISTS when the Auth account already exists
 * (e.g. after a previous incomplete deletion).
 */
export async function signInAuthUserRest(email: string, password: string): Promise<{ uid: string; idToken: string }> {
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${firebaseConfig.apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      returnSecureToken: true,
    }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData?.error?.message || 'Failed to sign in existing auth user via REST');
  }

  const data = await response.json();
  return {
    uid: data.localId,
    idToken: data.idToken,
  };
}

export async function provisionTeamMemberLocally(params: {
  db: Firestore;
  actorUid: string;
  actorEmail?: string | null;
  actorRole: string;
  tenantClientId: string;
  clientName: string | null;
  name: string;
  phone: string;
  memberRole: MemberRole;
  managerId: string | null;
  managerName: string | null;
}): Promise<{ uid: string; restored: boolean }> {
  const {
    db,
    actorUid,
    actorEmail,
    actorRole,
    tenantClientId,
    clientName,
    name,
    phone,
    memberRole,
    managerId,
    managerName,
  } = params;
  const email = `${phone}@estatepulse.com`;
  const initialPassword = phone;

  await syncTenantMapping(db, actorUid, tenantClientId, clientName);

  const clientSnap = await getDoc(doc(db, 'platformClients', tenantClientId));
  if (!clientSnap.exists()) {
    throw Object.assign(new Error('Company record not found. Please contact super admin.'), {
      code: 'failed-precondition',
    });
  }
  const clientData = clientSnap.data() as { adminUid?: string; adminEmail?: string };
  const ownsClient =
    clientData.adminUid === actorUid ||
    (typeof clientData.adminEmail === 'string' &&
      typeof actorEmail === 'string' &&
      clientData.adminEmail === actorEmail);
  if (!ownsClient) {
    throw Object.assign(
      new Error('Your login is not linked to this company in platformClients. Ask super admin to run link-client-admin repair.'),
      { code: 'failed-precondition' },
    );
  }

  const existingUsersSnapshot = await getDocs(
    query(
      collection(db, 'users'),
      where('phone', '==', phone),
      where('clientId', '==', tenantClientId),
      limit(1),
    ),
  );
  if (!existingUsersSnapshot.empty) {
    const existingUserDoc = existingUsersSnapshot.docs[0];
    const existingUser = existingUserDoc.data();
    if (existingUser.role !== 'deleted' && existingUser.role !== 'suspended') {
      throw Object.assign(new Error('A member account with this mobile number already exists.'), {
        code: 'already-exists',
      });
    }

    const batch = writeBatch(db);
    batch.update(existingUserDoc.ref, {
      name,
      email,
      role: memberRole,
      phone,
      clientId: tenantClientId,
      clientName,
      managerId: memberRole === 'employee' ? managerId : null,
      managerName: memberRole === 'employee' ? managerName : null,
      updatedAt: serverTimestamp(),
    });
    if (memberRole === 'employee') {
      batch.set(doc(db, 'employeeDirectory', existingUserDoc.id), {
        name,
        phone,
        role: 'employee',
        clientId: tenantClientId,
        managerId,
        managerName,
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.delete(doc(db, 'employeeDirectory', existingUserDoc.id));
    }

    console.log('[PROVISION DEBUG] Firestore Write (Restore/Batch) Attempt:', {
      currentAuthenticatedUid: auth.currentUser?.uid || null,
      currentUserRole: actorRole,
      targetRoleBeingCreated: memberRole,
      collectionDocumentPath: `users/${existingUserDoc.id} and possibly employeeDirectory/${existingUserDoc.id}`,
    });

    try {
      await batch.commit();
      console.log('[PROVISION DEBUG] Firestore Write (Restore/Batch) Success:', {
        response: 'SUCCESS'
      });
    } catch (error) {
      console.error('[PROVISION DEBUG] Firestore Write (Restore/Batch) Error:', {
        error: error instanceof Error ? error.message : String(error),
        response: error
      });
      throw error;
    }

    return { uid: existingUserDoc.id, restored: true };
  }

  let idTokenToClean: string | null = null;
  try {
    const { uid: newUid, idToken } = await createAuthUserRest(email, initialPassword);
    idTokenToClean = idToken;

    const userDoc = {
      name,
      email,
      role: memberRole,
      phone,
      clientId: tenantClientId,
      clientName,
      managerId: memberRole === 'employee' ? managerId : null,
      managerName: memberRole === 'employee' ? managerName : null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    console.log('[PROVISION DEBUG] Firestore Write (New User - users) Attempt:', {
      currentAuthenticatedUid: auth.currentUser?.uid || null,
      currentUserRole: actorRole,
      targetRoleBeingCreated: memberRole,
      collectionDocumentPath: `users/${newUid}`,
    });

    await setDoc(doc(db, 'users', newUid), userDoc);
    console.log('[PROVISION DEBUG] Firestore Write (New User - users) Success:', {
      response: 'SUCCESS'
    });

    if (memberRole === 'employee') {
      console.log('[PROVISION DEBUG] Firestore Write (New User - employeeDirectory) Attempt:', {
        currentAuthenticatedUid: auth.currentUser?.uid || null,
        currentUserRole: actorRole,
        targetRoleBeingCreated: memberRole,
        collectionDocumentPath: `employeeDirectory/${newUid}`,
      });
      await setDoc(doc(db, 'employeeDirectory', newUid), {
        name,
        phone,
        role: 'employee',
        clientId: tenantClientId,
        managerId,
        managerName,
        updatedAt: serverTimestamp(),
      });
      console.log('[PROVISION DEBUG] Firestore Write (New User - employeeDirectory) Success:', {
        response: 'SUCCESS'
      });
    }

    return { uid: newUid, restored: false };
  } catch (error) {
    console.error('[PROVISION DEBUG] Firestore Write/Auth Creation Error:', {
      error: error instanceof Error ? error.message : String(error),
      response: error
    });
    if (idTokenToClean) {
      await deleteAuthUserRest(idTokenToClean).catch(() => {});
    }
    throw error;
  }
}


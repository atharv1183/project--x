const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

async function getUserRole(uid) {
  const snap = await db.collection('users').doc(uid).get();
  if (!snap.exists) return null;
  return snap.data().role || null;
}

async function writeAuditLog(payload) {
  await db.collection('auditLogs').add({
    ...payload,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

exports.startImpersonationSession = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const actorUid = request.auth.uid;
  const actorRole = await getUserRole(actorUid);
  if (!['super_admin', 'admin'].includes(actorRole || '')) throw new HttpsError('permission-denied', 'Super admin only.');

  const clientId = String(request.data?.clientId || '').trim();
  if (!clientId) throw new HttpsError('invalid-argument', 'clientId is required.');

  const clientDoc = await db.collection('platformClients').doc(clientId).get();
  if (!clientDoc.exists) throw new HttpsError('not-found', 'Client not found.');
  const clientData = clientDoc.data() || {};

  let targetUid = clientData.adminUid || null;
  if (!targetUid) {
    const userQuery = await db
      .collection('users')
      .where('clientId', '==', clientId)
      .where('role', 'in', ['client_admin', 'admin'])
      .limit(1)
      .get();
    if (!userQuery.empty) targetUid = userQuery.docs[0].id;
  }
  if (!targetUid) throw new HttpsError('failed-precondition', 'No client admin mapped for this client.');

  const targetToken = await admin.auth().createCustomToken(targetUid, {
    impersonatedBy: actorUid,
    impersonationClientId: clientId,
  });
  const actorRestoreToken = await admin.auth().createCustomToken(actorUid);

  await writeAuditLog({
    action: 'impersonation_started',
    actorId: actorUid,
    actorName: request.auth.token.name || request.auth.token.email || actorUid,
    targetType: 'client',
    targetId: clientId,
    newValue: { targetUid },
  });

  return {
    targetToken,
    actorRestoreToken,
    clientId,
    clientName: clientData.name || clientId,
    targetUid,
  };
});

exports.endImpersonationSession = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const actorUid = request.auth.uid;
  const actorRole = await getUserRole(actorUid);
  if (!['super_admin', 'admin'].includes(actorRole || '')) throw new HttpsError('permission-denied', 'Super admin only.');

  const clientId = String(request.data?.clientId || '').trim();
  await writeAuditLog({
    action: 'impersonation_ended',
    actorId: actorUid,
    actorName: request.auth.token.name || request.auth.token.email || actorUid,
    targetType: 'client',
    targetId: clientId || null,
  });

  return { ok: true };
});

exports.forceLogoutUser = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const actorUid = request.auth.uid;
  const actorRole = await getUserRole(actorUid);
  if (!['super_admin', 'admin'].includes(actorRole || '')) throw new HttpsError('permission-denied', 'Super admin only.');

  const targetUid = String(request.data?.targetUid || '').trim();
  if (!targetUid) throw new HttpsError('invalid-argument', 'targetUid is required.');

  await admin.auth().revokeRefreshTokens(targetUid);
  await db.collection('sessionRevocations').add({
    targetUid,
    revokedBy: actorUid,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  await writeAuditLog({
    action: 'force_logout_user',
    actorId: actorUid,
    actorName: request.auth.token.name || request.auth.token.email || actorUid,
    targetType: 'user',
    targetId: targetUid,
  });

  return { ok: true };
});

exports.resetUserPassword = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const actorUid = request.auth.uid;
  const actorRole = await getUserRole(actorUid);
  if (!['super_admin', 'admin', 'manager'].includes(actorRole || '')) {
    throw new HttpsError('permission-denied', 'Only admin/manager can reset passwords.');
  }

  const targetUid = String(request.data?.targetUid || '').trim();
  const targetPhone = String(request.data?.targetPhone || '').replace(/\D/g, '');
  const requestedPassword = String(request.data?.newPassword || '').trim();
  if (!targetUid) throw new HttpsError('invalid-argument', 'targetUid is required.');

  const fallbackPassword = targetPhone || '';
  const newPassword = requestedPassword || fallbackPassword;
  if (!newPassword || newPassword.length < 8) {
    throw new HttpsError('invalid-argument', 'Password must be at least 8 characters.');
  }

  await admin.auth().updateUser(targetUid, { password: newPassword });
  await writeAuditLog({
    action: 'user_password_reset',
    actorId: actorUid,
    actorName: request.auth.token.name || request.auth.token.email || actorUid,
    targetType: 'user',
    targetId: targetUid,
    meta: {
      mode: requestedPassword ? 'manual' : 'mobile_fallback',
    },
  });

  return { ok: true };
});

async function resolveActorClientId(actorUid, actor, authEmail) {
  let clientId = String(actor.clientId || '').trim();
  if (clientId) return clientId;

  const linkSnap = await db.collection('clientAdmins').doc(actorUid).get();
  if (linkSnap.exists) {
    clientId = String(linkSnap.data().clientId || '').trim();
    if (clientId) return clientId;
  }

  const byUid = await db.collection('platformClients').where('adminUid', '==', actorUid).limit(1).get();
  if (!byUid.empty) return byUid.docs[0].id;

  const email = String(authEmail || '').trim();
  if (email) {
    const byEmail = await db.collection('platformClients').where('adminEmail', '==', email).limit(1).get();
    if (!byEmail.empty) return byEmail.docs[0].id;
  }

  return '';
}

exports.provisionTeamMember = onCall({ cors: true, region: 'us-central1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');

  const actorUid = request.auth.uid;
  const actorSnap = await db.collection('users').doc(actorUid).get();
  if (!actorSnap.exists) throw new HttpsError('permission-denied', 'User profile not found.');

  const actor = actorSnap.data() || {};
  const actorRole = String(actor.role || '');
  const isAdminLike = ['super_admin', 'admin', 'client_admin', 'manager'].includes(actorRole);
  if (!isAdminLike) throw new HttpsError('permission-denied', 'Only admin roles can add team members.');

  const name = String(request.data?.name || '').trim();
  const phone = String(request.data?.phone || '').replace(/\D/g, '');
  const memberRole = request.data?.role === 'manager' ? 'manager' : 'employee';
  const managerId = String(request.data?.managerId || '').trim() || null;
  const managerName = String(request.data?.managerName || '').trim() || null;
  const clientName = String(request.data?.clientName || actor.clientName || '').trim() || null;

  if (!name) throw new HttpsError('invalid-argument', 'Member name is required.');
  if (phone.length < 10 || phone.length > 15) {
    throw new HttpsError('invalid-argument', 'Enter a valid mobile number (10 to 15 digits).');
  }
  if (memberRole === 'manager' && !['super_admin', 'admin', 'client_admin'].includes(actorRole)) {
    throw new HttpsError('permission-denied', 'Only admin can add managers.');
  }

  let clientId = '';
  if (actorRole === 'super_admin') {
    clientId = String(request.data?.clientId || actor.clientId || '').trim();
  } else {
    clientId = await resolveActorClientId(actorUid, actor, request.auth.token.email || '');
    if (!clientId) {
      throw new HttpsError('failed-precondition', 'Company mapping missing for your account. Please contact super admin.');
    }
  }

  const email = `${phone}@estatepulse.com`;
  const initialPassword = phone;
  const now = admin.firestore.FieldValue.serverTimestamp();

  if (clientId && ['client_admin', 'admin'].includes(actorRole)) {
    await db.collection('clientAdmins').doc(actorUid).set({ clientId }, { merge: true });
    if (!String(actor.clientId || '').trim()) {
      await db.collection('users').doc(actorUid).set({ clientId, clientName, updatedAt: now }, { merge: true });
    }
  }

  const existingQuery = await db.collection('users').where('phone', '==', phone).limit(1).get();
  if (!existingQuery.empty) {
    const existingDoc = existingQuery.docs[0];
    const existing = existingDoc.data() || {};
    if (existing.role !== 'deleted' && existing.role !== 'suspended') {
      throw new HttpsError('already-exists', 'A member account with this mobile number already exists.');
    }

    const batch = db.batch();
    batch.update(existingDoc.ref, {
      name,
      email,
      role: memberRole,
      phone,
      clientId,
      clientName,
      managerId: memberRole === 'employee' ? managerId : null,
      managerName: memberRole === 'employee' ? managerName : null,
      updatedAt: now,
    });
    if (memberRole === 'employee') {
      batch.set(db.collection('employeeDirectory').doc(existingDoc.id), {
        name,
        phone,
        role: 'employee',
        clientId,
        managerId,
        managerName,
        updatedAt: now,
      }, { merge: true });
    } else {
      batch.delete(db.collection('employeeDirectory').doc(existingDoc.id));
    }
    await batch.commit();

    await writeAuditLog({
      action: 'employee_added',
      actorId: actorUid,
      actorName: actor.name || request.auth.token.email || actorUid,
      actorRole,
      targetType: 'user',
      targetId: existingDoc.id,
      description: `${memberRole === 'manager' ? 'Manager' : 'Executive'} restored: ${name}`,
      newValue: { name, phone, role: memberRole, managerId },
    });

    return { uid: existingDoc.id, restored: true };
  }

  let provisionedUser;
  try {
    provisionedUser = await admin.auth().createUser({ email, password: initialPassword });
  } catch (error) {
    if (error.code === 'auth/email-already-in-use') {
      throw new HttpsError(
        'already-exists',
        'This mobile number is tied to an old login account. Restore that member from Team if visible, or contact super admin.',
      );
    }
    if (error.code === 'auth/weak-password') {
      throw new HttpsError('invalid-argument', 'Unable to set initial password. Please use a valid mobile number.');
    }
    throw new HttpsError('internal', error.message || 'Failed to create login account.');
  }

  const uid = provisionedUser.uid;
  const batch = db.batch();
  batch.set(db.collection('users').doc(uid), {
    name,
    email,
    role: memberRole,
    phone,
    clientId,
    clientName,
    managerId: memberRole === 'employee' ? managerId : null,
    managerName: memberRole === 'employee' ? managerName : null,
    createdAt: now,
    updatedAt: now,
  });
  if (memberRole === 'employee') {
    batch.set(db.collection('employeeDirectory').doc(uid), {
      name,
      phone,
      role: 'employee',
      clientId,
      managerId,
      managerName,
      updatedAt: now,
    });
  }

  try {
    await batch.commit();
  } catch (error) {
    await admin.auth().deleteUser(uid).catch(() => {});
    throw new HttpsError('internal', error.message || 'Failed to save team member profile.');
  }

  await writeAuditLog({
    action: 'employee_added',
    actorId: actorUid,
    actorName: actor.name || request.auth.token.email || actorUid,
    actorRole,
    targetType: 'user',
    targetId: uid,
    description: `${memberRole === 'manager' ? 'Manager' : 'Executive'} added: ${name}`,
    newValue: { name, phone, role: memberRole, managerId },
  });

  return { uid, restored: false };
});

exports.createInventoryListing = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');

  const uid = request.auth.uid;
  const userSnap = await db.collection('users').doc(uid).get();
  if (!userSnap.exists) throw new HttpsError('permission-denied', 'User profile not found.');

  const user = userSnap.data() || {};
  const role = String(user.role || '');
  const userClientId = String(user.clientId || '');
  const isAdminLike = ['super_admin', 'admin', 'client_admin', 'manager'].includes(role);
  if (!isAdminLike) throw new HttpsError('permission-denied', 'Only admin roles can create listings.');

  const input = request.data || {};
  const payload = (input.payload && typeof input.payload === 'object') ? input.payload : null;
  if (!payload) throw new HttpsError('invalid-argument', 'payload is required.');

  const title = String(payload.title || '').trim();
  const location = String(payload.location || '').trim();
  const type = String(payload.type || '').trim();
  const status = String(payload.status || '').trim();
  const submitterId = String(payload.submitterId || '').trim();
  const submitterName = String(payload.submitterName || '').trim();
  const clientId = String(payload.clientId || '').trim();
  const clientName = String(payload.clientName || '').trim();

  if (!title || !location || !type) {
    throw new HttpsError('invalid-argument', 'title, location and type are required.');
  }
  if (!['draft', 'pending_approval', 'approved', 'rejected'].includes(status)) {
    throw new HttpsError('invalid-argument', 'Invalid status.');
  }
  if (!submitterId || submitterId !== uid) {
    throw new HttpsError('permission-denied', 'submitterId mismatch.');
  }
  if (!clientId) throw new HttpsError('invalid-argument', 'clientId is required.');
  if (role !== 'super_admin' && clientId !== userClientId) {
    throw new HttpsError('permission-denied', 'Cross-company create is not allowed.');
  }

  const now = admin.firestore.FieldValue.serverTimestamp();
  const docRef = await db.collection('inventory').add({
    ...payload,
    title,
    location,
    type,
    status,
    submitterId: uid,
    submitterName: submitterName || String(user.name || request.auth.token.name || request.auth.token.email || uid),
    clientId,
    clientName,
    createdAt: now,
    updatedAt: now,
  });

  const autoApprove = Boolean(input.autoApprove);
  if (autoApprove) {
    await docRef.update({
      status: 'approved',
      approvedBy: String(user.name || request.auth.token.name || request.auth.token.email || uid),
      approvalAt: now,
      updatedAt: now,
    });
  }

  return { id: docRef.id, autoApproved: autoApprove };
});

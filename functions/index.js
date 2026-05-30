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

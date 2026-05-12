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
  if (actorRole !== 'super_admin') throw new HttpsError('permission-denied', 'Super admin only.');

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
  if (actorRole !== 'super_admin') throw new HttpsError('permission-denied', 'Super admin only.');

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
  if (actorRole !== 'super_admin') throw new HttpsError('permission-denied', 'Super admin only.');

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

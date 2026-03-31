const { FieldValue } = require('firebase-admin/firestore');
const { collection } = require('./firestoreService');

async function logAdminAction({
  action,
  officerEmail,
  status = 'success',
  officerId = null,
  evidenceId = null,
  details = null,
}) {
  try {
    await collection('admin_logs').add({
      action,
      officerEmail: officerEmail || null,
      officerId,
      evidenceId,
      status,
      details,
      timestamp: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    console.error('Failed to write admin log:', error.message || error);
  }
}

module.exports = {
  logAdminAction,
};

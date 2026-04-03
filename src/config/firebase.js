const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');
const path = require('path');

let db;

function buildServiceAccountFromFields() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    return null;
  }

  return {
    project_id: projectId,
    client_email: clientEmail,
    private_key: privateKey.replace(/\\n/g, '\n'),
  };
}

function buildCredential() {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (serviceAccountJson) {
    const parsed = JSON.parse(serviceAccountJson);

    if (parsed.private_key) {
      parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
    }

    return admin.credential.cert(parsed);
  }

  const fromFields = buildServiceAccountFromFields();

  if (fromFields) {
    return admin.credential.cert(fromFields);
  }

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const configuredPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    const candidatePaths = [
      configuredPath,
      path.join(process.cwd(), path.basename(configuredPath)),
      path.join('/app', path.basename(configuredPath)),
      path.join(process.cwd(), 'serviceAccountKey.json'),
    ];

    const resolvedPath = candidatePaths.find((candidate) => fs.existsSync(candidate));

    if (!resolvedPath) {
      throw new Error(
        `GOOGLE_APPLICATION_CREDENTIALS is set to "${configuredPath}", but that file is not present in this runtime. ` +
          'For container deployments, set FIREBASE_SERVICE_ACCOUNT_JSON (recommended) or mount a credentials file inside the container and point GOOGLE_APPLICATION_CREDENTIALS to that in-container path.'
      );
    }

    process.env.GOOGLE_APPLICATION_CREDENTIALS = resolvedPath;
    return admin.credential.applicationDefault();
  }

  const defaultServiceAccountPath = path.join(process.cwd(), 'serviceAccountKey.json');

  if (fs.existsSync(defaultServiceAccountPath)) {
    const serviceAccount = JSON.parse(fs.readFileSync(defaultServiceAccountPath, 'utf8'));

    if (serviceAccount.private_key) {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
    }

    return admin.credential.cert(serviceAccount);
  }

  throw new Error(
    'Missing Firebase Admin credentials. Set FIREBASE_SERVICE_ACCOUNT_JSON, or FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY + FIREBASE_PROJECT_ID, or GOOGLE_APPLICATION_CREDENTIALS. Firebase web config (apiKey/authDomain/appId) is not valid for Admin SDK.'
  );
}

function initializeFirebase() {
  if (admin.apps.length === 0) {
    admin.initializeApp({
      credential: buildCredential(),
      projectId: process.env.FIREBASE_PROJECT_ID || 'elira-1aac7',
    });
  }

  const databaseId = process.env.FIRESTORE_DATABASE_ID || 'default';
  db = getFirestore(databaseId);
  return db;
}

function getDb() {
  if (!db) {
    return initializeFirebase();
  }

  return db;
}

module.exports = {
  initializeFirebase,
  getDb,
};

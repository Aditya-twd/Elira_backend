const dotenv = require('dotenv');
const bcrypt = require('bcrypt');
const { randomUUID } = require('crypto');
const { FieldValue } = require('firebase-admin/firestore');
const { initializeFirebase, getDb } = require('../src/config/firebase');
const { sha256 } = require('../src/utils/hash');

dotenv.config();
initializeFirebase();

const db = getDb();

async function seed() {
  const userRef = db.collection('users').doc();
  const officerRef = db.collection('users').doc();
  const defaultOfficerEmail = 'officer@test.com';
  const officerAuthRef = db.collection('officers').doc(defaultOfficerEmail);
  const caseRef = db.collection('cases').doc();
  const evidenceRef = db.collection('evidence').doc();
  const keyRef = db.collection('keys').doc();

  const now = FieldValue.serverTimestamp();

  const userDoc = {
    phone: '+919900000001',
    role: 'citizen',
    profile: {
      name: 'Asha Nair',
      location: {
        state: 'Karnataka',
        district: 'Bengaluru Urban',
      },
    },
    settings: {
      biometricEnabled: true,
      anonymityMode: false,
      locationConsent: true,
    },
    createdAt: now,
    updatedAt: now,
  };

  const officerDoc = {
    phone: '+919900000999',
    role: 'officer',
    profile: {
      name: 'Officer R. Kumar',
      location: {
        state: 'Karnataka',
        district: 'Bengaluru Urban',
      },
    },
    settings: {
      biometricEnabled: false,
      anonymityMode: false,
      locationConsent: true,
    },
    createdAt: now,
    updatedAt: now,
  };

  const officerAuthDoc = {
    id: officerAuthRef.id,
    email: defaultOfficerEmail,
    password: await bcrypt.hash('123456', 10),
    role: 'officer',
    createdAt: now,
  };

  const caseDoc = {
    userId: userRef.id,
    title: 'Harassment incident near transit hub',
    description: 'User reported repeated harassment while commuting home.',
    status: 'open',
    priority: 'high',
    assignedOfficerId: officerRef.id,
    location: {
      state: 'Karnataka',
      district: 'Bengaluru Urban',
    },
    timestamps: {
      createdAt: now,
      updatedAt: now,
      closedAt: null,
    },
  };

  const evidenceDoc = {
    caseId: caseRef.id,
    userId: userRef.id,
    type: 'audio',
    title: 'Voice recording from incident',
    arweave: {
      txId: randomUUID(),
      url: 'https://arweave.net/sample-evidence-tx',
    },
    blockchain: {
      fileHash: sha256('sample-evidence-file-content'),
      polygonTxHash: '0xsamplepolygontxhash',
    },
    encryption: {
      keyId: keyRef.id,
      status: 'encrypted',
    },
    metadata: {
      timestamp: now,
      location: {
        lat: 12.9716,
        lng: 77.5946,
      },
      duration: 95,
      size: 234567,
    },
    ai: {
      transcript: 'Sample transcript generated for the recording.',
      summary: 'Incident audio captured distress and nearby witness voices.',
      entities: ['Transit Hub', 'Witness 1'],
    },
    status: 'uploaded',
    createdAt: now,
  };

  const sosDoc = {
    userId: userRef.id,
    caseId: caseRef.id,
    location: {
      lat: 12.9716,
      lng: 77.5946,
    },
    contactsNotified: ['+919900000777', '+919900000888'],
    triggeredAt: now,
  };

  const adminLogDoc = {
    officerId: officerRef.id,
    officerEmail: defaultOfficerEmail,
    action: 'CASE_ASSIGNED',
    caseId: caseRef.id,
    evidenceId: evidenceRef.id,
    ipAddress: '127.0.0.1',
    timestamp: now,
  };

  const keyDoc = {
    userId: userRef.id,
    encryptedKey: sha256('encryption-key-placeholder'),
    status: 'active',
    createdAt: now,
  };

  const batch = db.batch();
  batch.set(userRef, userDoc);
  batch.set(officerRef, officerDoc);
  batch.set(officerAuthRef, officerAuthDoc);
  batch.set(caseRef, caseDoc);
  batch.set(evidenceRef, evidenceDoc);
  batch.set(db.collection('sos_logs').doc(), sosDoc);
  batch.set(db.collection('admin_logs').doc(), adminLogDoc);
  batch.set(keyRef, keyDoc);

  await batch.commit();

  console.log('Seed completed successfully.');
  console.log('Created documents:');
  console.log('users:', userRef.id, officerRef.id);
  console.log('officers:', officerAuthRef.id, defaultOfficerEmail);
  console.log('cases:', caseRef.id);
  console.log('evidence:', evidenceRef.id);
  console.log('keys:', keyRef.id);
}

seed().catch((error) => {
  if (error && error.code === 5) {
    console.error(
      'Firestore database not found for this project. Open Firebase Console -> Firestore Database -> Create database (Native mode), then run npm run seed again.'
    );
  }

  console.error('Seed failed:', error);
  process.exit(1);
});

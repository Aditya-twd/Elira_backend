const { collection } = require('./firestoreService');
const { randomUUID } = require('crypto');

const evidenceById = Object.create(null);
const evidenceIds = [];

function generateEvidenceId() {
  if (typeof randomUUID === 'function') {
    return randomUUID();
  }

  return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function persistRecord(record) {
  const { sourceContent, ...safeRecord } = record;
  return collection('evidence').doc(String(record.id)).set(safeRecord, { merge: true });
}

function persistPartial(id, data) {
  return collection('evidence').doc(String(id)).set(data, { merge: true });
}

function normalizeRecord(raw = {}) {
  return {
    id: String(raw.id || ''),
    userId: String(raw.userId || ''),
    fileHash: raw.fileHash || '',
    arweaveTxId: raw.arweaveTxId || '',
    polygonTxHash: raw.polygonTxHash || null,
    storageMode: raw.storageMode || 'arweave',
    arweaveFallbackReason: raw.arweaveFallbackReason || null,
    keyHex: raw.keyHex || '',
    ivHex: raw.ivHex || '',
    sourceContent: raw.sourceContent || null,
    fileType: raw.fileType || 'application/octet-stream',
    consentGiven: Boolean(raw.consentGiven),
    consentedAt: raw.consentedAt || null,
    consentBy: raw.consentBy || null,
    createdAt: raw.createdAt || new Date().toISOString(),
    ai: {
      transcript: raw.ai?.transcript ?? null,
      summary: raw.ai?.summary ?? null,
      sentiment: raw.ai?.sentiment ?? null,
      riskLevel: raw.ai?.riskLevel ?? null,
      keywords: Array.isArray(raw.ai?.keywords) ? raw.ai.keywords : [],
      extractedData: {
        title: raw.ai?.extractedData?.title ?? null,
        date: raw.ai?.extractedData?.date ?? null,
        description: raw.ai?.extractedData?.description ?? null,
        personName: raw.ai?.extractedData?.personName ?? null,
      },
    },
  };
}

async function createEvidenceMetadata(metadata) {
  const id = generateEvidenceId();

  const record = {
    id,
    userId: metadata.userId || '',
    fileHash: metadata.fileHash,
    arweaveTxId: metadata.arweaveTxId,
    polygonTxHash: metadata.polygonTxHash || null,
    storageMode: metadata.storageMode || 'arweave',
    arweaveFallbackReason: metadata.arweaveFallbackReason || null,
    keyHex: metadata.keyHex,
    ivHex: metadata.ivHex,
    sourceContent: metadata.sourceContent || null,
    fileType: metadata.fileType || 'application/octet-stream',
    consentGiven: Boolean(metadata.consentGiven),
    consentedAt: metadata.consentGiven ? new Date().toISOString() : null,
    consentBy: metadata.consentBy || null,
    createdAt: new Date().toISOString(),
    ai: {
      transcript: null,
      summary: null,
      sentiment: null,
      riskLevel: null,
      keywords: [],
      extractedData: {
        title: null,
        date: null,
        description: null,
        personName: null,
      },
    },
  };

  evidenceById[id] = record;
  evidenceIds.push(id);
  await persistRecord(record);

  return record;
}

function setEvidencePolygonTxHash(id, polygonTxHash) {
  const record = evidenceById[String(id)];
  if (!record) {
    return null;
  }

  record.polygonTxHash = polygonTxHash;
  persistPartial(id, { polygonTxHash }).catch(() => {});
  return record;
}

function listEvidenceMetadata(options = {}) {
  const { onlyConsented = false } = options;

  return evidenceIds.map((id) => {
    const record = evidenceById[id];

    if (onlyConsented && !record.consentGiven) {
      return null;
    }

    return {
      id: record.id,
      userId: record.userId,
      fileHash: record.fileHash,
      arweaveTxId: record.arweaveTxId,
      keyHex: record.keyHex,
      ivHex: record.ivHex,
      fileType: record.fileType,
      storageMode: record.storageMode,
      consentGiven: record.consentGiven,
      consentedAt: record.consentedAt,
      createdAt: record.createdAt,
    };
  }).filter(Boolean);
}

function getEvidenceMetadataById(id) {
  return evidenceById[String(id)] || null;
}

function setEvidenceConsent(id, consentGiven, consentBy = null) {
  const record = evidenceById[String(id)];
  if (!record) {
    return null;
  }

  record.consentGiven = Boolean(consentGiven);
  record.consentedAt = record.consentGiven ? new Date().toISOString() : null;
  record.consentBy = consentBy;
  persistPartial(id, {
    consentGiven: record.consentGiven,
    consentedAt: record.consentedAt,
    consentBy: record.consentBy,
  }).catch(() => {});
  return record;
}

function setEvidenceAITranscript(id, transcript) {
  const record = evidenceById[String(id)];
  if (!record) {
    return null;
  }

  record.ai.transcript = transcript;
  return record;
}

function setEvidenceAIAnalysis(id, analysis) {
  const record = evidenceById[String(id)];
  if (!record) {
    return null;
  }

  record.ai.summary = analysis.summary || null;
  record.ai.sentiment = analysis.sentiment || null;
  record.ai.riskLevel = analysis.riskLevel || null;
  record.ai.keywords = Array.isArray(analysis.keywords) ? analysis.keywords : [];
  return record;
}

function setEvidenceAIExtractedData(id, extractedData) {
  const record = evidenceById[String(id)];
  if (!record) {
    return null;
  }

  record.ai.extractedData = {
    title: extractedData.title || null,
    date: extractedData.date || null,
    description: extractedData.description || null,
    personName: extractedData.personName || null,
  };
  return record;
}

/**
 * Generic update function for AI fields
 * @param {string} id - Evidence ID
 * @param {Object} aiData - AI data to update (can include transcript, summary, sentiment, riskLevel, keywords, extractedData)
 */
async function updateEvidenceAI(id, aiData) {
  const record = evidenceById[String(id)];
  if (!record) {
    return null;
  }

  if (aiData.transcript !== undefined) {
    record.ai.transcript = aiData.transcript;
  }
  if (aiData.summary !== undefined) {
    record.ai.summary = aiData.summary;
  }
  if (aiData.sentiment !== undefined) {
    record.ai.sentiment = aiData.sentiment;
  }
  if (aiData.riskLevel !== undefined) {
    record.ai.riskLevel = aiData.riskLevel;
  }
  if (aiData.keywords !== undefined) {
    record.ai.keywords = Array.isArray(aiData.keywords) ? aiData.keywords : [];
  }
  if (aiData.extractedData !== undefined) {
    record.ai.extractedData = {
      title: aiData.extractedData.title || null,
      date: aiData.extractedData.date || null,
      description: aiData.extractedData.description || null,
      personName: aiData.extractedData.personName || null,
    };
  }

  const aiSnapshot = JSON.parse(JSON.stringify(record.ai));
  await persistPartial(id, { ai: aiSnapshot });

  return record;
}

async function listEvidenceMetadataFromFirestore(options = {}) {
  const { onlyConsented = false, userId = null } = options;

  let query = collection('evidence');
  if (onlyConsented) {
    query = query.where('consentGiven', '==', true);
  }
  if (userId) {
    query = query.where('userId', '==', String(userId));
  }

  const snapshot = await query.get();
  return snapshot.docs.map((doc) => normalizeRecord({ id: doc.id, ...doc.data() }));
}

async function getEvidenceMetadataByIdFromFirestore(id) {
  const doc = await collection('evidence').doc(String(id)).get();
  if (!doc.exists) return null;
  return normalizeRecord({ id: doc.id, ...doc.data() });
}

module.exports = {
  createEvidenceMetadata,
  listEvidenceMetadata,
  listEvidenceMetadataFromFirestore,
  getEvidenceMetadataById,
  getEvidenceMetadataByIdFromFirestore,
  setEvidencePolygonTxHash,
  setEvidenceConsent,
  setEvidenceAITranscript,
  setEvidenceAIAnalysis,
  setEvidenceAIExtractedData,
  updateEvidenceAI,
};

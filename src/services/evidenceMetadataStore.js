const evidenceById = Object.create(null);
const evidenceIds = [];
let evidenceCounter = 0;

function createEvidenceMetadata(metadata) {
  evidenceCounter += 1;
  const id = String(evidenceCounter);

  const record = {
    id,
    fileHash: metadata.fileHash,
    arweaveTxId: metadata.arweaveTxId,
    polygonTxHash: metadata.polygonTxHash || null,
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

  return record;
}

function setEvidencePolygonTxHash(id, polygonTxHash) {
  const record = evidenceById[String(id)];
  if (!record) {
    return null;
  }

  record.polygonTxHash = polygonTxHash;
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
      fileHash: record.fileHash,
      arweaveTxId: record.arweaveTxId,
      fileType: record.fileType,
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
function updateEvidenceAI(id, aiData) {
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

  return record;
}

module.exports = {
  createEvidenceMetadata,
  listEvidenceMetadata,
  getEvidenceMetadataById,
  setEvidencePolygonTxHash,
  setEvidenceConsent,
  setEvidenceAITranscript,
  setEvidenceAIAnalysis,
  setEvidenceAIExtractedData,
  updateEvidenceAI,
};

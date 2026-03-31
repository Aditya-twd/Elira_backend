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
    fileType: metadata.fileType || 'application/octet-stream',
    consentGiven: Boolean(metadata.consentGiven),
    consentedAt: metadata.consentGiven ? new Date().toISOString() : null,
    consentBy: metadata.consentBy || null,
    createdAt: new Date().toISOString(),
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

module.exports = {
  createEvidenceMetadata,
  listEvidenceMetadata,
  getEvidenceMetadataById,
  setEvidencePolygonTxHash,
  setEvidenceConsent,
};

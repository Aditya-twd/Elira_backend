const { sha256 } = require('../utils/hash');
const { encryptContent, decryptBuffer } = require('../utils/encryption');
const { uploadToArweave } = require('../services/arweaveService');
const {
  createEvidenceMetadata,
  listEvidenceMetadata,
  getEvidenceMetadataById,
  setEvidencePolygonTxHash,
  setEvidenceConsent,
} = require('../services/evidenceMetadataStore');
const { storeEvidenceOnChain } = require('../services/blockchainService');
const { logAdminAction } = require('../services/adminLogService');

async function uploadEvidence(req, res, next) {
  try {
    const { fileContent, fileType } = req.body;

    if (!fileContent) {
      return res.status(400).json({
        success: false,
        message: 'fileContent is required',
      });
    }

    const fileHash = sha256(fileContent);
    const { encryptedBuffer, keyHex, ivHex } = encryptContent(fileContent);
    const arweaveTxId = await uploadToArweave(encryptedBuffer);

    const evidence = createEvidenceMetadata({
      fileHash,
      keyHex,
      ivHex,
      arweaveTxId,
      fileType,
    });

    // Blockchain step is executed after hash generation and Arweave upload.
    const polygonTxHash = await storeEvidenceOnChain(fileHash, arweaveTxId);
    setEvidencePolygonTxHash(evidence.id, polygonTxHash);

    return res.status(201).json({
      success: true,
      data: {
        id: evidence.id,
        fileHash,
        arweaveTxId,
        polygonTxHash,
        consentGiven: false,
      },
    });
  } catch (error) {
    return next(error);
  }
}

function listEvidence(req, res) {
  return res.status(200).json(
    listEvidenceMetadata({
      onlyConsented: true,
    })
  );
}

async function getEvidenceById(req, res, next) {
  try {
    const { id } = req.params;

    if (!id) {
      await logAdminAction({
        action: 'VIEW_EVIDENCE',
        officerEmail: req.officer?.email,
        officerId: req.officer?.id,
        evidenceId: null,
        status: 'failed',
        details: 'invalid id',
      });

      return res.status(400).json({
        success: false,
        message: 'invalid id',
      });
    }

    const metadata = getEvidenceMetadataById(id);

    if (!metadata) {
      await logAdminAction({
        action: 'VIEW_EVIDENCE',
        officerEmail: req.officer?.email,
        officerId: req.officer?.id,
        evidenceId: id,
        status: 'failed',
        details: 'missing metadata',
      });

      return res.status(404).json({
        success: false,
        message: 'missing metadata',
      });
    }

    if (!metadata.consentGiven) {
      await logAdminAction({
        action: 'VIEW_EVIDENCE',
        officerEmail: req.officer?.email,
        officerId: req.officer?.id,
        evidenceId: metadata.id,
        status: 'failed',
        details: 'consent required',
      });

      return res.status(403).json({
        success: false,
        message: 'consent required',
      });
    }

    const fileResponse = await fetch(`https://arweave.net/${metadata.arweaveTxId}`);

    if (!fileResponse.ok) {
      await logAdminAction({
        action: 'VIEW_EVIDENCE',
        officerEmail: req.officer?.email,
        officerId: req.officer?.id,
        evidenceId: metadata.id,
        status: 'failed',
        details: 'failed fetch/decryption',
      });

      return res.status(502).json({
        success: false,
        message: 'failed fetch/decryption',
      });
    }

    const encryptedArrayBuffer = await fileResponse.arrayBuffer();
    const encryptedBuffer = Buffer.from(encryptedArrayBuffer);

    let decryptedBuffer;
    try {
      decryptedBuffer = decryptBuffer(encryptedBuffer, metadata.keyHex, metadata.ivHex);
    } catch (error) {
      await logAdminAction({
        action: 'VIEW_EVIDENCE',
        officerEmail: req.officer?.email,
        officerId: req.officer?.id,
        evidenceId: metadata.id,
        status: 'failed',
        details: 'failed fetch/decryption',
      });

      return res.status(500).json({
        success: false,
        message: 'failed fetch/decryption',
      });
    }

    await logAdminAction({
      action: 'VIEW_EVIDENCE',
      officerEmail: req.officer?.email,
      officerId: req.officer?.id,
      evidenceId: metadata.id,
      status: 'success',
    });

    res.setHeader('Content-Type', metadata.fileType || 'application/octet-stream');
    return res.status(200).send(decryptedBuffer);
  } catch (error) {
    return next(error);
  }
}

async function verifyEvidenceById(req, res, next) {
  try {
    const { id } = req.params;

    if (!id) {
      await logAdminAction({
        action: 'VERIFY_EVIDENCE',
        officerEmail: req.officer?.email,
        officerId: req.officer?.id,
        evidenceId: null,
        status: 'failed',
        details: 'invalid id',
      });

      return res.status(400).json({
        success: false,
        message: 'invalid id',
      });
    }

    const metadata = getEvidenceMetadataById(id);

    if (!metadata) {
      await logAdminAction({
        action: 'VERIFY_EVIDENCE',
        officerEmail: req.officer?.email,
        officerId: req.officer?.id,
        evidenceId: id,
        status: 'failed',
        details: 'missing metadata',
      });

      return res.status(404).json({
        success: false,
        message: 'missing metadata',
      });
    }

    if (!metadata.consentGiven) {
      await logAdminAction({
        action: 'VERIFY_EVIDENCE',
        officerEmail: req.officer?.email,
        officerId: req.officer?.id,
        evidenceId: metadata.id,
        status: 'failed',
        details: 'consent required',
      });

      return res.status(403).json({
        success: false,
        message: 'consent required',
      });
    }

    await logAdminAction({
      action: 'VERIFY_EVIDENCE',
      officerEmail: req.officer?.email,
      officerId: req.officer?.id,
      evidenceId: metadata.id,
      status: 'success',
    });

    return res.status(200).json({
      fileHash: metadata.fileHash,
      arweaveTxId: metadata.arweaveTxId,
      polygonTxHash: metadata.polygonTxHash,
      status: 'verified',
    });
  } catch (error) {
    return next(error);
  }
}

async function giveEvidenceConsent(req, res, next) {
  try {
    const { id } = req.params;
    const { consentGiven = true, consentBy = 'victim' } = req.body || {};

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'invalid id',
      });
    }

    const updated = setEvidenceConsent(id, consentGiven, consentBy);
    if (!updated) {
      return res.status(404).json({
        success: false,
        message: 'missing metadata',
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        id: updated.id,
        consentGiven: updated.consentGiven,
        consentedAt: updated.consentedAt,
      },
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  uploadEvidence,
  listEvidence,
  getEvidenceById,
  verifyEvidenceById,
  giveEvidenceConsent,
};

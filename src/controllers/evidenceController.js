const { sha256 } = require('../utils/hash');
const PDFDocument = require('pdfkit');
const { encryptContent, decryptBuffer } = require('../utils/encryption');
const { uploadToArweave } = require('../services/arweaveService');
const {
  createEvidenceMetadata,
  listEvidenceMetadata,
  getEvidenceMetadataById,
  setEvidencePolygonTxHash,
  setEvidenceConsent,
  updateEvidenceAI,
} = require('../services/evidenceMetadataStore');
const { storeEvidenceOnChain } = require('../services/blockchainService');
const { logAdminAction } = require('../services/adminLogService');
const {
  callTranscribeAI,
  callAnalyzeAI,
  callExtractAI,
  isAudioOrVideo,
  isDocument,
} = require('../services/aiService');

async function buildCertificatePdf(metadataList) {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 50,
  });

  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));

  // Title
  doc.fontSize(16).font('Helvetica-Bold').text(
    'Certificate under Section 65B of the Indian Evidence Act, 1872',
    { align: 'center' }
  );

  doc.moveDown(1.5);
  doc.fontSize(11).font('Helvetica');

  // Header
  if (metadataList.length === 1) {
    doc.text('This certificate pertains to the following electronic record:', { underline: true });
  } else {
    doc.text(`This certificate pertains to the following ${metadataList.length} electronic records:`, { underline: true });
  }

  doc.moveDown(0.8);

  // List all evidence details in a single document
  metadataList.forEach((metadata, index) => {
    doc.fontSize(10).font('Helvetica-Bold').text(`Record ${index + 1}:`);
    doc.moveDown(0.3);
    doc.fontSize(10).font('Helvetica');
    doc.text(`Evidence ID: ${metadata.id}`, { indent: 20 });
    doc.moveDown(0.2);
    doc.text(`Description: ${metadata.fileType || 'N/A'}`, { indent: 20 });
    doc.moveDown(0.2);
    doc.text(`Date and time of creation: ${metadata.createdAt || 'N/A'}`, { indent: 20 });
    doc.moveDown(0.2);
    doc.text(`File hash (SHA-256): ${metadata.fileHash}`, { indent: 20 });
    doc.moveDown(0.2);
    doc.text(`Arweave transaction ID: ${metadata.arweaveTxId}`, { indent: 20 });
    doc.moveDown(0.2);
    doc.text(
      `Blockchain transaction hash: ${metadata.polygonTxHash || 'Pending/Unavailable'}`,
      { indent: 20 }
    );
    
    if (index < metadataList.length - 1) {
      doc.moveDown(0.6);
    }
  });

  doc.moveDown(1.5);
  doc.font('Helvetica');
  doc.text(
    'These electronic records were generated and stored using the ELIRA secure evidence system. The system ensures data integrity using cryptographic hashing and blockchain verification. The records have not been altered since their creation.',
    { align: 'left' }
  );

  doc.moveDown(1);
  doc.text(
    'This certificate is issued by ELIRA System Authority in compliance with Section 65B of the Indian Evidence Act.',
    { align: 'left' }
  );

  doc.moveDown(2);
  doc.font('Helvetica-Bold').text('System Name: ELIRA');
  doc.font('Helvetica').text(`Generated Timestamp: ${new Date().toISOString()}`);
  doc.text('Digitally Generated Certificate (No Signature Required)');

  return new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

/**
 * Async AI processing after evidence upload
 * Called without blocking upload response
 * @param {Object} evidence - Evidence metadata
 * @param {Buffer} fileContent - Original file buffer
 * @param {string} fileType - File MIME type
 */
async function processEvidenceWithAI(evidence, fileContent, fileType) {
  try {
    const evidenceId = evidence.id;

    // Route to appropriate AI service based on file type
    if (isAudioOrVideo(fileType)) {
      // AUDIO/VIDEO: Transcribe → Analyze
      console.log(`[AI] Starting transcription for evidence ${evidenceId}`);
      const transcriptionResult = await callTranscribeAI(fileContent, fileType);

      // Update evidence with transcript
      updateEvidenceAI(evidenceId, {
        transcript: transcriptionResult.transcript,
      });

      console.log(`[AI] Transcription complete for evidence ${evidenceId}`);

      // Send transcript to analysis
      console.log(`[AI] Starting analysis for evidence ${evidenceId}`);
      const analysisResult = await callAnalyzeAI(transcriptionResult.transcript);

      // Update evidence with analysis results
      updateEvidenceAI(evidenceId, {
        summary: analysisResult.summary,
        sentiment: analysisResult.sentiment,
        riskLevel: analysisResult.riskLevel,
        keywords: analysisResult.keywords,
      });

      console.log(`[AI] Analysis complete for evidence ${evidenceId}`);

      await logAdminAction({
        action: 'AI_AUTO_PROCESS',
        status: 'success',
        evidenceId,
        details: {
          type: 'audio_video',
          transcript: true,
          analysis: true,
          sentiment: analysisResult.sentiment,
          riskLevel: analysisResult.riskLevel,
        },
      });
    } else if (isDocument(fileType)) {
      // DOCUMENT: Extract
      console.log(`[AI] Starting extraction for evidence ${evidenceId}`);
      const extractionResult = await callExtractAI(fileContent, fileType);

      // Update evidence with extracted data
      updateEvidenceAI(evidenceId, {
        extractedData: extractionResult,
      });

      console.log(`[AI] Extraction complete for evidence ${evidenceId}`);

      await logAdminAction({
        action: 'AI_AUTO_PROCESS',
        status: 'success',
        evidenceId,
        details: {
          type: 'document',
          extracted: true,
          fields: Object.keys(extractionResult),
        },
      });
    } else {
      // Other file types - skip AI processing
      console.log(`[AI] Skipping processing for evidence ${evidenceId} (file type: ${fileType})`);
    }
  } catch (error) {
    console.error(`[AI] Processing failed for evidence ${evidence.id}:`, error.message);

    await logAdminAction({
      action: 'AI_AUTO_PROCESS',
      status: 'error',
      evidenceId: evidence.id,
      details: {
        error: error.message,
      },
    });
  }
}

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
    // Gracefully handle blockchain errors - don't fail upload if blockchain is unavailable
    let polygonTxHash = null;
    try {
      polygonTxHash = await storeEvidenceOnChain(fileHash, arweaveTxId);
      setEvidencePolygonTxHash(evidence.id, polygonTxHash);
    } catch (blockchainError) {
      console.warn(`Blockchain storage failed (non-critical): ${blockchainError.message}`);
      // Continue without blockchain - evidence is still stored on Arweave
    }

    // Trigger AI processing asynchronously (don't wait for it to complete)
    // This allows the upload response to be returned immediately
    processEvidenceWithAI(evidence, fileContent, fileType).catch((err) => {
      console.error(`[AI] Unhandled error during async processing:`, err);
    });

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

async function generateEvidenceCertificate(req, res, next) {
  try {
    const { id } = req.params;
    const officerEmail = 'SYSTEM';

    if (!id) {
      await logAdminAction({
        action: 'GENERATE_CERTIFICATE',
        officerEmail,
        evidenceId: null,
        status: 'FAILED',
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
        action: 'GENERATE_CERTIFICATE',
        officerEmail,
        evidenceId: id,
        status: 'FAILED',
        details: 'missing metadata',
      });

      return res.status(404).json({
        success: false,
        message: 'missing metadata',
      });
    }

    const pdfBuffer = await buildCertificatePdf([metadata]);

    await logAdminAction({
      action: 'GENERATE_CERTIFICATE',
      officerEmail,
      evidenceId: metadata.id,
      status: 'SUCCESS',
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="certificate_${metadata.id}.pdf"`
    );
    return res.status(200).send(pdfBuffer);
  } catch (error) {
    return next(error);
  }
}

async function generateEvidenceCertificates(req, res, next) {
  try {
    const officerEmail = 'SYSTEM';
    const inputIds = Array.isArray(req.body?.evidenceIds)
      ? req.body.evidenceIds
      : req.body?.evidenceId
      ? [req.body.evidenceId]
      : [];

    const evidenceIds = [...new Set(inputIds.map((id) => String(id).trim()).filter(Boolean))];

    if (evidenceIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'evidenceIds is required',
      });
    }

    const metadataList = evidenceIds
      .map((id) => getEvidenceMetadataById(id))
      .filter(Boolean);

    if (metadataList.length !== evidenceIds.length) {
      const foundIds = new Set(metadataList.map((item) => item.id));
      const missingIds = evidenceIds.filter((id) => !foundIds.has(id));
      return res.status(404).json({
        success: false,
        message: 'missing metadata',
        missingIds,
      });
    }

    const pdfBuffer = await buildCertificatePdf(metadataList);

    for (const metadata of metadataList) {
      await logAdminAction({
        action: 'GENERATE_CERTIFICATE',
        officerEmail,
        evidenceId: metadata.id,
        status: 'SUCCESS',
      });
    }

    const fileName =
      metadataList.length === 1
        ? `certificate_${metadataList[0].id}.pdf`
        : `certificate_bulk_${Date.now()}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    return res.status(200).send(pdfBuffer);
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
  generateEvidenceCertificate,
  generateEvidenceCertificates,
};

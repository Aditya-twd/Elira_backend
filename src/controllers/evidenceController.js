const { sha256 } = require('../utils/hash');
const PDFDocument = require('pdfkit');
const { encryptContent, decryptBuffer } = require('../utils/encryption');
const { uploadToArweave } = require('../services/arweaveService');
const {
  createEvidenceMetadata,
  listEvidenceMetadata,
  listEvidenceMetadataFromFirestore,
  getEvidenceMetadataById,
  getEvidenceMetadataByIdFromFirestore,
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

const USE_MOCK_AI_DATA =
  String(process.env.AI_USE_MOCK_DATA || 'true').toLowerCase() === 'true';

function inferContentLength(fileContent) {
  if (Buffer.isBuffer(fileContent)) {
    return fileContent.length;
  }
  return String(fileContent || '').length;
}

function buildMockTranscript(evidenceId, fileType, fileContent) {
  const bytes = inferContentLength(fileContent);
  return [
    `Mock transcript generated for evidence ${evidenceId}.`,
    `Detected media type: ${fileType || 'unknown'}.`,
    `Approximate payload size: ${bytes} bytes.`,
    'This is placeholder AI output and not from live inference.',
  ].join(' ');
}

function buildMockAnalysis(transcript, fileType) {
  const lowercase = String(transcript || '').toLowerCase();
  const sentiment = lowercase.includes('urgent') || lowercase.includes('help')
    ? 'distressed'
    : 'neutral';
  const riskLevel = sentiment === 'distressed' ? 'MEDIUM' : 'LOW';

  return {
    summary: `Mock analysis for ${fileType || 'evidence'}: this item has been processed using simulated AI output.`,
    sentiment,
    riskLevel,
    keywords: ['mock', 'evidence', fileType || 'file'].filter(Boolean),
  };
}

function buildMockExtraction(evidenceId, fileType) {
  return {
    title: `Mock ${fileType || 'document'} evidence`,
    date: new Date().toISOString().slice(0, 10),
    description: `Simulated extraction for evidence ${evidenceId}.`,
    personName: 'Sample Person',
  };
}

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
      let transcript;
      let analysisResult;

      if (USE_MOCK_AI_DATA) {
        transcript = buildMockTranscript(evidenceId, fileType, fileContent);
        analysisResult = buildMockAnalysis(transcript, fileType);
        console.log(`[AI] Mock transcription+analysis generated for evidence ${evidenceId}`);
      } else {
        console.log(`[AI] Starting transcription for evidence ${evidenceId}`);
        const transcriptionResult = await callTranscribeAI(fileContent, fileType);
        transcript = transcriptionResult.transcript;

        console.log(`[AI] Transcription complete for evidence ${evidenceId}`);
        console.log(`[AI] Starting analysis for evidence ${evidenceId}`);
        analysisResult = await callAnalyzeAI(transcript);
      }

      // Update evidence with transcript
      await updateEvidenceAI(evidenceId, {
        transcript,
      });

      // Update evidence with analysis results
      await updateEvidenceAI(evidenceId, {
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
      let extractionResult;
      if (USE_MOCK_AI_DATA) {
        extractionResult = buildMockExtraction(evidenceId, fileType);
        console.log(`[AI] Mock extraction generated for evidence ${evidenceId}`);
      } else {
        console.log(`[AI] Starting extraction for evidence ${evidenceId}`);
        extractionResult = await callExtractAI(fileContent, fileType);
      }

      const documentAiPayload = {
        extractedData: extractionResult,
      };

      // Update evidence with extracted data
      await updateEvidenceAI(evidenceId, documentAiPayload);

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
    console.warn(`[AI] Processing failed for evidence ${evidence.id}:`, error.message);

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

async function withTimeout(promise, timeoutMs, label) {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId);
  }
}

// Calculate timeout based on file size
// Accounts for Irys devnet retries (1s + 2s = 3s) plus upload time
// Irys devnet: ~100KB/s average throughput = 52s for 5MB (6.99MB encrypted)
// Use 20s base + 15s per MB for safety with retries
function calculateArweaveTimeout(fileSizeBytes) {
  const sizeInMB = fileSizeBytes / (1024 * 1024);
  const calculatedTimeout = 20000 + (sizeInMB * 15000);
  // Min 40s (account for retry delays), max 180s
  return Math.max(40000, Math.min(180000, calculatedTimeout));
}

async function uploadEvidence(req, res, next) {
  try {
    const { fileContent, fileType, userId } = req.body;

    if (!fileContent) {
      return res.status(400).json({
        success: false,
        message: 'fileContent is required',
      });
    }

    if (!userId || !String(userId).trim()) {
      return res.status(400).json({
        success: false,
        message: 'userId is required',
      });
    }

    const fileHash = sha256(fileContent);
    const { encryptedBuffer, keyHex, ivHex } = encryptContent(fileContent);
    let arweaveTxId = null;
    let arweaveFallbackReason = null;

    const arweaveTimeout = calculateArweaveTimeout(encryptedBuffer.length);
    console.log(`Encrypting file for Arweave (${encryptedBuffer.length} bytes, ${arweaveTimeout}ms timeout)...`);

    try {
      arweaveTxId = await withTimeout(
        uploadToArweave(encryptedBuffer),
        arweaveTimeout,
        'Arweave upload'
      );
      console.log(`✓ Arweave upload successful: ${arweaveTxId}`);
    } catch (arweaveError) {
      arweaveFallbackReason = arweaveError.message;
      if (arweaveError.code === 'IRYS_INSUFFICIENT_BALANCE') {
        console.warn(`Irys wallet underfunded, using local fallback: ${arweaveFallbackReason}`);
      } else {
        console.warn(`Arweave upload failed, using local fallback: ${arweaveFallbackReason}`);
      }
    }

    const evidence = await createEvidenceMetadata({
      userId: String(userId).trim(),
      fileHash,
      keyHex,
      ivHex,
      arweaveTxId,
      sourceContent: fileContent,
      fileType,
      storageMode: arweaveTxId ? 'arweave' : 'local',
      arweaveFallbackReason,
    });

    // Blockchain step is executed after hash generation and Arweave upload.
    // Gracefully handle blockchain errors - don't fail upload if blockchain is unavailable
    let polygonTxHash = null;
    if (arweaveTxId) {
      try {
        polygonTxHash = await withTimeout(
          storeEvidenceOnChain(fileHash, arweaveTxId),
          25000,
          'Blockchain storage'
        );
        setEvidencePolygonTxHash(evidence.id, polygonTxHash);
      } catch (blockchainError) {
        console.warn(`Blockchain storage failed (non-critical): ${blockchainError.message}`);
        // Continue without blockchain - evidence is still stored locally/Arweave-backed
      }
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
        userId: evidence.userId,
        fileHash,
        keyHex,
        ivHex,
        arweaveTxId,
        polygonTxHash,
        storageMode: arweaveTxId ? 'arweave' : 'local',
        arweaveFallbackReason,
        consentGiven: false,
      },
    });
  } catch (error) {
    const message = String(error?.message || '').toLowerCase();
    if (
      message.includes('maximum') ||
      message.includes('document') && message.includes('size') ||
      message.includes('invalid_argument')
    ) {
      return res.status(413).json({
        success: false,
        message:
          'Evidence metadata exceeds storage limits. The raw file payload is no longer stored in Firestore metadata. Please retry upload.',
      });
    }

    return next(error);
  }
}

function toFallbackBuffer(sourceContent) {
  if (!sourceContent) {
    return null;
  }

  const contentString = String(sourceContent);
  const compactBase64 = contentString.replace(/\s+/g, '');

  if (/^[A-Za-z0-9+/=]+$/.test(compactBase64)) {
    const decoded = Buffer.from(compactBase64, 'base64');
    if (decoded.length > 0) {
      return decoded;
    }
  }

  return Buffer.from(contentString, 'utf8');
}

async function listEvidence(req, res, next) {
  try {
    const data = await listEvidenceMetadataFromFirestore({
      onlyConsented: true,
    });

    return res.status(200).json(data);
  } catch (error) {
    return next(error);
  }
}

async function listEvidenceForCitizen(req, res, next) {
  try {
    const userId = String(req.query.userId || '').trim();
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'userId query parameter is required',
      });
    }

    const data = await listEvidenceMetadataFromFirestore({
      onlyConsented: false,
      userId,
    });

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return next(error);
  }
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

    let metadata = await getEvidenceMetadataByIdFromFirestore(id);
    if (!metadata) {
      metadata = getEvidenceMetadataById(id);
    }

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

    let decryptedBuffer = null;

    try {
      const fileResponse = await fetch(`https://arweave.net/${metadata.arweaveTxId}`);

      if (fileResponse.ok) {
        const encryptedArrayBuffer = await fileResponse.arrayBuffer();
        const encryptedBuffer = Buffer.from(encryptedArrayBuffer);
        decryptedBuffer = decryptBuffer(encryptedBuffer, metadata.keyHex, metadata.ivHex);
      }
    } catch (error) {
      decryptedBuffer = null;
    }

    if (!decryptedBuffer) {
      decryptedBuffer = toFallbackBuffer(metadata.sourceContent);
    }

    if (!decryptedBuffer) {
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

    let metadata = await getEvidenceMetadataByIdFromFirestore(id);
    if (!metadata) {
      metadata = getEvidenceMetadataById(id);
    }

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
    const officerEmail = req.officer?.email || 'SYSTEM';
    const inputIds = Array.isArray(req.body?.evidenceIds)
      ? req.body.evidenceIds
      : req.body?.evidenceId
      ? [req.body.evidenceId]
      : req.params?.id
      ? [req.params.id]
      : [];

    const evidenceIds = [...new Set(inputIds.map((id) => String(id).trim()).filter(Boolean))];

    if (evidenceIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'evidenceIds or evidenceId is required',
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
  listEvidenceForCitizen,
  getEvidenceById,
  verifyEvidenceById,
  giveEvidenceConsent,
  generateEvidenceCertificate,
  generateEvidenceCertificates,
};

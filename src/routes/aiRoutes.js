const express = require('express');
const multer = require('multer');
const {
  transcribeAudio,
  analyzeText,
  extractDocumentData,
  detectKeywords,
} = require('../controllers/aiController');

const router = express.Router();

// Configure multer for file upload (memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB limit for large video files
  },
});

/**
 * POST /ai/transcribe
 * Transcribe audio/video file to text
 */
router.post('/transcribe', upload.single('file'), transcribeAudio);

/**
 * POST /ai/analyze
 * Analyze text for summary, sentiment, risk level, and keywords
 */
router.post('/analyze', analyzeText);

/**
 * POST /ai/extract
 * Extract structured data from document (PDF/image)
 */
router.post('/extract', upload.single('file'), extractDocumentData);

/**
 * POST /ai/detect-keywords
 * Detect keywords and trigger alerts
 */
router.post('/detect-keywords', detectKeywords);

module.exports = router;

const {
  callTranscribeAI,
  callAnalyzeAI,
  callExtractAI,
  callKeywordDetectAI,
} = require('../services/aiService');
const { logAdminAction } = require('../services/adminLogService');

/**
 * POST /ai/transcribe
 * Transcribe audio/video file
 */
async function transcribeAudio(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file provided',
      });
    }

    const fileBuffer = req.file.buffer;
    const mimeType = req.file.mimetype;

    // Call AI service with file buffer
    const result = await callTranscribeAI(fileBuffer, mimeType);

    // Log action
    await logAdminAction({
      action: 'AI_TRANSCRIBE',
      status: 'success',
      details: {
        fileSize: fileBuffer.length,
        mimeType,
        transcriptLength: result.transcript.length,
      },
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Transcribe error:', error.message);

    await logAdminAction({
      action: 'AI_TRANSCRIBE',
      status: 'error',
      details: { error: error.message },
    });

    return res.status(500).json({
      success: false,
      message: error.message || 'Transcription failed',
    });
  }
}

/**
 * POST /ai/analyze
 * Analyze transcript/text for summary, sentiment, risk level, keywords
 */
async function analyzeText(req, res, next) {
  try {
    const { transcript } = req.body;

    if (!transcript) {
      return res.status(400).json({
        success: false,
        message: 'transcript is required in request body',
      });
    }

    if (typeof transcript !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'transcript must be a string',
      });
    }

    // Call AI service with text
    const result = await callAnalyzeAI(transcript);

    // Log action
    await logAdminAction({
      action: 'AI_ANALYZE',
      status: 'success',
      details: {
        textLength: transcript.length,
        sentiment: result.sentiment,
        riskLevel: result.riskLevel,
        keywordCount: result.keywords.length,
      },
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Analyze error:', error.message);

    await logAdminAction({
      action: 'AI_ANALYZE',
      status: 'error',
      details: { error: error.message },
    });

    return res.status(500).json({
      success: false,
      message: error.message || 'Analysis failed',
    });
  }
}

/**
 * POST /ai/extract
 * Extract structured data from document (PDF/image)
 */
async function extractDocumentData(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file provided',
      });
    }

    const fileBuffer = req.file.buffer;
    const mimeType = req.file.mimetype;

    // Call AI service with file buffer
    const result = await callExtractAI(fileBuffer, mimeType);

    // Log action
    await logAdminAction({
      action: 'AI_EXTRACT',
      status: 'success',
      details: {
        fileSize: fileBuffer.length,
        mimeType,
        extractedFields: Object.keys(result),
      },
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Extract error:', error.message);

    await logAdminAction({
      action: 'AI_EXTRACT',
      status: 'error',
      details: { error: error.message },
    });

    return res.status(500).json({
      success: false,
      message: error.message || 'Extraction failed',
    });
  }
}

/**
 * POST /ai/detect-keywords
 * Detect keywords in text (real-time alert system)
 */
async function detectKeywords(req, res, next) {
  try {
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({
        success: false,
        message: 'text is required in request body',
      });
    }

    if (typeof text !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'text must be a string',
      });
    }

    // Call AI service for keyword detection
    const result = await callKeywordDetectAI(text);

    // Log action (more detailed if alert triggered)
    await logAdminAction({
      action: 'AI_KEYWORD_ALERT',
      status: result.alert ? 'alert' : 'success',
      details: {
        alert: result.alert,
        matchedKeyword: result.matchedKeyword,
        confidence: result.confidence,
        textLength: text.length,
      },
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Keyword detection error:', error.message);

    await logAdminAction({
      action: 'AI_KEYWORD_ALERT',
      status: 'error',
      details: { error: error.message },
    });

    return res.status(500).json({
      success: false,
      message: error.message || 'Keyword detection failed',
    });
  }
}

module.exports = {
  transcribeAudio,
  analyzeText,
  extractDocumentData,
  detectKeywords,
};

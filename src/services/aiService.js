const axios = require('axios');
const FormData = require('form-data');

const AI_BASE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';

/**
 * Call AI transcribe endpoint
 * Sends file buffer directly to AI service
 * @param {Buffer} fileBuffer - Audio/video file buffer
 * @param {string} mimeType - File MIME type
 * @returns {Promise<{transcript: string}>}
 */
async function callTranscribeAI(fileBuffer, mimeType) {
  try {
    const form = new FormData();
    form.append('file', fileBuffer, {
      filename: 'audio_file',
      contentType: mimeType,
    });

    const response = await axios.post(`${AI_BASE_URL}/transcribe`, form, {
      headers: form.getHeaders(),
      timeout: 300000, // 5 minutes for long files
    });

    if (!response.data.transcript) {
      throw new Error('Invalid AI response: missing transcript field');
    }

    return {
      transcript: response.data.transcript,
    };
  } catch (error) {
    console.error('AI Transcribe Service Error:', error.message);
    throw new Error(`Transcription failed: ${error.message}`);
  }
}

/**
 * Call AI analyze endpoint
 * Sends text/transcript for analysis
 * @param {string} transcript - Text to analyze
 * @returns {Promise<{summary: string, sentiment: string, riskLevel: string, keywords: string[]}>}
 */
async function callAnalyzeAI(transcript) {
  try {
    const response = await axios.post(
      `${AI_BASE_URL}/analyze`,
      { transcript },
      { timeout: 60000 }
    );

    const requiredFields = ['summary', 'sentiment', 'riskLevel', 'keywords'];
    for (const field of requiredFields) {
      if (!(field in response.data)) {
        throw new Error(`Invalid AI response: missing ${field} field`);
      }
    }

    // Validate sentiment enum
    const validSentiments = ['positive', 'neutral', 'negative', 'distressed'];
    if (!validSentiments.includes(response.data.sentiment)) {
      throw new Error(
        `Invalid sentiment value: ${response.data.sentiment}. Must be one of: ${validSentiments.join(', ')}`
      );
    }

    // Validate risk level enum
    const validRiskLevels = ['LOW', 'MEDIUM', 'HIGH'];
    if (!validRiskLevels.includes(response.data.riskLevel)) {
      throw new Error(
        `Invalid riskLevel value: ${response.data.riskLevel}. Must be one of: ${validRiskLevels.join(', ')}`
      );
    }

    // Ensure keywords is an array
    if (!Array.isArray(response.data.keywords)) {
      throw new Error('Keywords must be an array');
    }

    return {
      summary: response.data.summary,
      sentiment: response.data.sentiment,
      riskLevel: response.data.riskLevel,
      keywords: response.data.keywords,
    };
  } catch (error) {
    console.error('AI Analyze Service Error:', error.message);
    throw new Error(`Analysis failed: ${error.message}`);
  }
}

/**
 * Call AI extract endpoint
 * Sends document file buffer for data extraction
 * @param {Buffer} fileBuffer - PDF/image file buffer
 * @param {string} mimeType - File MIME type
 * @returns {Promise<{title: string, date: string, description: string, personName: string}>}
 */
async function callExtractAI(fileBuffer, mimeType) {
  try {
    const form = new FormData();
    form.append('file', fileBuffer, {
      filename: 'document_file',
      contentType: mimeType,
    });

    const response = await axios.post(`${AI_BASE_URL}/extract`, form, {
      headers: form.getHeaders(),
      timeout: 120000,
    });

    const requiredFields = ['title', 'date', 'description', 'personName'];
    for (const field of requiredFields) {
      if (!(field in response.data)) {
        throw new Error(`Invalid AI response: missing ${field} field`);
      }
    }

    return {
      title: response.data.title,
      date: response.data.date,
      description: response.data.description,
      personName: response.data.personName,
    };
  } catch (error) {
    console.error('AI Extract Service Error:', error.message);
    throw new Error(`Extraction failed: ${error.message}`);
  }
}

/**
 * Call AI keyword detection endpoint
 * Sends text chunk for real-time keyword detection
 * @param {string} text - Text to analyze for keywords
 * @returns {Promise<{alert: boolean, matchedKeyword: string|null, confidence: number}>}
 */
async function callKeywordDetectAI(text) {
  try {
    const response = await axios.post(
      `${AI_BASE_URL}/detect-keywords`,
      { text },
      { timeout: 30000 }
    );

    if (typeof response.data.alert !== 'boolean') {
      throw new Error('Invalid AI response: alert must be boolean');
    }

    if (response.data.alert) {
      if (!response.data.matchedKeyword) {
        throw new Error('Invalid AI response: matchedKeyword required when alert is true');
      }
      if (typeof response.data.confidence !== 'number') {
        throw new Error('Invalid AI response: confidence must be number');
      }
    }

    return {
      alert: response.data.alert,
      matchedKeyword: response.data.matchedKeyword || null,
      confidence: response.data.confidence || 0,
    };
  } catch (error) {
    console.error('AI Keyword Detection Service Error:', error.message);
    throw new Error(`Keyword detection failed: ${error.message}`);
  }
}

/**
 * Check if file is audio/video based on MIME type
 * @param {string} mimeType - File MIME type
 * @returns {boolean}
 */
function isAudioOrVideo(mimeType) {
  return mimeType.startsWith('audio/') || mimeType.startsWith('video/');
}

/**
 * Check if file is document (PDF/image)
 * @param {string} mimeType - File MIME type
 * @returns {boolean}
 */
function isDocument(mimeType) {
  const documentTypes = [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/tiff',
  ];
  return documentTypes.includes(mimeType);
}

module.exports = {
  callTranscribeAI,
  callAnalyzeAI,
  callExtractAI,
  callKeywordDetectAI,
  isAudioOrVideo,
  isDocument,
};

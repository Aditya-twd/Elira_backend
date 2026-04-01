# AI INTEGRATION API DOCUMENTATION

## Architecture Overview

The ELIRA AI integration follows a **backend-driven architecture**:

```
Frontend/Client
    ↓
    └─→ Backend (Upload Evidence)
           ↓
           ├─→ Encrypt & Store (Arweave)
           ├─→ Verify on Blockchain (Polygon)
           │
           └─→ [ASYNC] Process with AI (Background)
                 ├─→ /ai/transcribe (if audio/video)
                 ├─→ /ai/analyze (transcript → insights)
                 └─→ /ai/extract (if document)
                 └─→ Store results in DB
```

### Key Architecture Rules

✅ **AI receives actual files**, NOT URLs
✅ **Backend sends file buffers** via `multipart/form-data`
✅ **AI is stateless** - has NO database access
✅ **Backend stores results** in evidence metadata
✅ **Upload doesn't block** - AI processing is async
✅ **Admin logging** tracks all AI operations

---

## IMPORTANT NOTES

⚠️ **File Transfer**: AI endpoints receive files via `multipart/form-data` with file buffer, NOT URLs

⚠️ **Stateless Processing**: AI services do not access the database. Backend is responsible for:
- Fetching encrypted files
- Decrypting content
- Sending to AI
- Storing processed results

⚠️ **Auto-Triggering**: When evidence is uploaded:
1. Backend immediately returns response (upload successful)
2. In the background, AI processing starts automatically
3. Results are stored in `evidence.ai` object as they complete
4. No manual API calls needed from frontend

---

## DATABASE SCHEMA UPDATE

### Evidence AI Fields

```javascript
evidence: {
  id: string,
  fileHash: string,
  arweaveTxId: string,
  polygonTxHash: string,
  fileType: string,
  createdAt: timestamp,
  
  // NEW: AI Processing Results
  ai: {
    transcript: string,           // From /ai/transcribe
    summary: string,              // From /ai/analyze
    sentiment: string,            // positive | neutral | negative | distressed
    riskLevel: string,            // LOW | MEDIUM | HIGH
    keywords: string[],           // From /ai/analyze
    extractedData: {              // From /ai/extract
      title: string,
      date: string,
      description: string,
      personName: string
    }
  }
}
```

---

## ENDPOINT: /ai/transcribe

**Purpose**: Convert audio/video files to text transcription

### Request

```
POST /ai/transcribe
Content-Type: multipart/form-data

Parameters:
  file (required): Audio/video file buffer
    - Audio formats: .mp3, .wav, .aac, .flac, .m4a
    - Video formats: .mp4, .avi, .mov, .mkv, .webm
    - Max size: 500MB
```

### Response (Success - 200)

```json
{
  "success": true,
  "data": {
    "transcript": "Hello, can you hear me? This is a test recording for the transcription service."
  }
}
```

### Response (Error - 500)

```json
{
  "success": false,
  "message": "Transcription failed: Invalid audio format"
}
```

### Backend Flow

```javascript
// Step 1: Frontend uploads evidence
POST /evidence/upload
{
  "fileContent": base64_audio,
  "fileType": "audio/mp3"
}

// Response (immediate)
{
  "success": true,
  "data": { "id": "1", "fileHash": "...", "arweaveTxId": "..." }
}

// Step 2: Backend (async - background)
// - Retrieve encrypted file from Arweave
// - Decrypt file buffer
// - Call /ai/transcribe with buffer
const transcriptResult = await callTranscribeAI(fileBuffer, 'audio/mp3');
// Result: { transcript: "Hello, can you hear me?..." }

// Step 3: Update DB
evidence.ai.transcript = transcriptResult.transcript;

// Step 4: Log action
admin_logs.add({
  action: 'AI_TRANSCRIBE',
  status: 'success',
  details: { fileSize: 5242880, transcriptLength: 250 }
})
```

### Example: cURL Request

```bash
curl -X POST http://localhost:5000/ai/transcribe \
  -F "file=@audio_evidence.mp3"
```

---

## ENDPOINT: /ai/analyze

**Purpose**: Analyze text for summary, sentiment, risk level, and keywords

### Request

```
POST /ai/analyze
Content-Type: application/json

Body:
{
  "transcript": "string (required) - Text to analyze"
}
```

### Response (Success - 200)

```json
{
  "success": true,
  "data": {
    "summary": "The witness describes suspicious activity near the warehouse between 10 PM and 11 PM on March 15th.",
    "sentiment": "distressed",
    "riskLevel": "HIGH",
    "keywords": ["warehouse", "suspicious", "night", "evidence", "witness"]
  }
}
```

### Response (Error - 400)

```json
{
  "success": false,
  "message": "transcript is required in request body"
}
```

### Valid Values

**sentiment**: `positive` | `neutral` | `negative` | `distressed`

**riskLevel**: `LOW` | `MEDIUM` | `HIGH`

### Backend Flow

```javascript
// Step 1: After transcription complete
const transcript = evidence.ai.transcript;

// Step 2: Backend calls /ai/analyze
const analysisResult = await callAnalyzeAI(transcript);
// Result: {
//   summary: "...",
//   sentiment: "distressed",
//   riskLevel: "HIGH",
//   keywords: ["..."]
// }

// Step 3: Update DB
evidence.ai.summary = analysisResult.summary;
evidence.ai.sentiment = analysisResult.sentiment;
evidence.ai.riskLevel = analysisResult.riskLevel;
evidence.ai.keywords = analysisResult.keywords;

// Step 4: Log action
admin_logs.add({
  action: 'AI_ANALYZE',
  status: 'success',
  details: {
    sentiment: 'distressed',
    riskLevel: 'HIGH',
    keywordCount: 5
  }
})
```

### Example: cURL Request

```bash
curl -X POST http://localhost:5000/ai/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "transcript": "I witnessed suspicious activity at the warehouse last night. Someone was breaking into the storage area."
  }'
```

---

## ENDPOINT: /ai/extract

**Purpose**: Extract structured data from documents (PDFs, images)

### Request

```
POST /ai/extract
Content-Type: multipart/form-data

Parameters:
  file (required): Document file buffer
    - Document formats: .pdf
    - Image formats: .jpg, .png, .gif, .tiff
    - Max size: 500MB
```

### Response (Success - 200)

```json
{
  "success": true,
  "data": {
    "title": "Witness Statement Form",
    "date": "2024-03-15",
    "description": "Official witness statement regarding incident at warehouse complex",
    "personName": "John Robert Smith"
  }
}
```

### Response (Error - 400)

```json
{
  "success": false,
  "message": "No file provided"
}
```

### Backend Flow

```javascript
// Step 1: Frontend uploads document evidence
POST /evidence/upload
{
  "fileContent": base64_pdf,
  "fileType": "application/pdf"
}

// Step 2: Backend (async - background)
// - Retrieve encrypted file from Arweave
// - Decrypt file buffer
// - Call /ai/extract with buffer
const extractResult = await callExtractAI(fileBuffer, 'application/pdf');
// Result: {
//   title: "Witness Statement",
//   date: "2024-03-15",
//   description: "...",
//   personName: "John Smith"
// }

// Step 3: Update DB
evidence.ai.extractedData = extractResult;

// Step 4: Log action
admin_logs.add({
  action: 'AI_EXTRACT',
  status: 'success',
  details: {
    fileSize: 1048576,
    extractedFields: ['title', 'date', 'description', 'personName']
  }
})
```

### Example: cURL Request

```bash
curl -X POST http://localhost:5000/ai/extract \
  -F "file=@document.pdf"
```

---

## ENDPOINT: /ai/detect-keywords

**Purpose**: Detect sensitive keywords in text (real-time alert system)

### Request

```
POST /ai/detect-keywords
Content-Type: application/json

Body:
{
  "text": "string (required) - Text to check for keywords"
}
```

### Response (No Alert - 200)

```json
{
  "success": true,
  "data": {
    "alert": false,
    "matchedKeyword": null,
    "confidence": 0
  }
}
```

### Response (Alert Triggered - 200)

```json
{
  "success": true,
  "data": {
    "alert": true,
    "matchedKeyword": "help",
    "confidence": 0.95
  }
}
```

### Response (Error - 400)

```json
{
  "success": false,
  "message": "text is required in request body"
}
```

### Use Cases

- Real-time transcription monitoring (call centers)
- SOS detection in emergency calls
- Harmful content flagging
- Automatic escalation triggers

### Backend Flow

```javascript
// Step 1: Real-time chunk from transcription
const chunk = "Help! Someone is attacking me...";

// Step 2: Send to keyword detection
const keywordResult = await callKeywordDetectAI(chunk);
// Result: {
//   alert: true,
//   matchedKeyword: "help",
//   confidence: 0.95
// }

// Step 3: If alert, trigger system action
if (keywordResult.alert) {
  // Trigger SOS alert
  // Notify dispatch
  // Log incident
}

// Step 4: Log action
admin_logs.add({
  action: 'AI_KEYWORD_ALERT',
  status: keywordResult.alert ? 'alert' : 'success',
  details: {
    alert: keywordResult.alert,
    matchedKeyword: keywordResult.matchedKeyword,
    confidence: keywordResult.confidence
  }
})
```

### Example: cURL Request

```bash
curl -X POST http://localhost:5000/ai/detect-keywords \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Help! Someone is attacking me right now!"
  }'
```

---

## ADMIN LOGGING

All AI operations are logged in the `admin_logs` collection:

### Log Actions

```
AI_TRANSCRIBE      - Audio/video transcription
AI_ANALYZE         - Transcript analysis
AI_EXTRACT         - Document extraction
AI_KEYWORD_ALERT   - Keyword detection (alert or normal)
AI_AUTO_PROCESS    - Automatic processing after upload
```

### Log Entry Example

```javascript
{
  action: 'AI_ANALYZE',
  officerEmail: 'officer@police.gov',
  officerId: 'OFF-123',
  evidenceId: '45',
  status: 'success',     // 'success' | 'error' | 'alert'
  details: {
    sentiment: 'distressed',
    riskLevel: 'HIGH',
    keywordCount: 8
  },
  timestamp: Timestamp(2024-03-15T14:30:00Z)
}
```

---

## ERROR HANDLING

### AI Service Unavailable

```json
{
  "success": false,
  "message": "Transcription failed: connect ECONNREFUSED 127.0.0.1:8000"
}
```

**Behavior**: Upload still succeeds, AI processing logs error and retries

### Invalid File Format

```json
{
  "success": false,
  "message": "Transcription failed: Invalid audio format"
}
```

**Behavior**: AI processes gracefully, logs error, evidence stored without AI data

### Timeout (Long Processing)

```json
{
  "success": false,
  "message": "Transcription failed: timeout of 300000ms exceeded"
}
```

**Behavior**: Request times out, logged as error, can be retried manually

---

## CONFIGURATION

Set AI service URL via environment variable:

```bash
# .env
AI_SERVICE_URL=http://ai-service:8000
```

Default: `http://localhost:8000`

---

## MANUAL TESTING

### Local Testing with Backend Only

If testing without AI service running, mock responses in `aiService.js`:

```javascript
// Development mode - mock responses
if (process.env.NODE_ENV === 'development' && process.env.MOCK_AI === 'true') {
  return {
    transcript: '[MOCK] Lorem ipsum dolor sit amet...'
  };
}
```

---

## API STATUS CODES

| Code | Meaning |
|------|---------|
| **200** | Successful AI processing |
| **201** | Evidence uploaded (AI processes in background) |
| **400** | Bad request (missing file or text) |
| **500** | AI service error or timeout |

---

## SUMMARY

### Audio/Video Upload Flow

```
1. User uploads audio/video
2. Backend: encrypt → store (Arweave) → blockchain
3. Backend (async): /ai/transcribe → /ai/analyze → store results
4. Evidence ready with transcript, summary, sentiment, risk level, keywords
```

### Document Upload Flow

```
1. User uploads PDF/image
2. Backend: encrypt → store (Arweave) → blockchain
3. Backend (async): /ai/extract → store results
4. Evidence ready with structured data (title, date, person, description)
```

### No Manual API Calls Needed

- Frontend uploads to `/evidence/upload`
- Backend handles all AI orchestration
- Results automatically appear in evidence metadata
- Admin sees all actions in logs

---

## SUPPORT

For integration issues:
1. Check `admin_logs` for error details
2. Verify AI service URL in `.env`
3. Review error response messages
4. Check backend console for detailed logs


# AI INTEGRATION ARCHITECTURE GUIDE

## System Design Overview

### Components

**1. AI Service Layer** (`backend/src/services/aiService.js`)
- Pure service module that communicates with AI provider
- No database dependencies
- Handles file streaming and error management
- Validates AI responses

**2. AI Controller** (`backend/src/controllers/aiController.js`)
- Express route handlers for AI endpoints
- Request validation
- Admin logging
- Error handling

**3. AI Routes** (`backend/src/routes/aiRoutes.js`)
- Express routing with multer for file uploads
- Defines 4 endpoints: /transcribe, /analyze, /extract, /detect-keywords

**4. Evidence Controller Integration** (`backend/src/controllers/evidenceController.js`)
- Auto-triggers AI processing after upload
- Async fire-and-forget pattern
- Updates evidence metadata with AI results

**5. Metadata Store** (`backend/src/services/evidenceMetadataStore.js`)
- Stores AI processing results
- Provides generic `updateEvidenceAI()` for flexible updates

---

## Architecture Pattern: Backend-Driven

### Why This Approach?

✅ **Security**: Files never exposed via URL to external services
✅ **Control**: Backend filters which files go to AI
✅ **Flexibility**: Can swap AI providers without frontend changes
✅ **Logging**: All AI operations audited in admin logs
✅ **Async**: Upload doesn't wait for AI processing
✅ **Resilience**: AI failures don't affect evidence storage

### Data Flow

```
Evidence Upload
    ↓
Backend encrypts & stores
    ↓
Response sent to frontend
    ↓
[ASYNC BACKGROUND]
    ├─→ Fetch file from Arweave
    ├─→ Decrypt locally
    ├─→ Send BUFFER to AI
    ├─→ Receive JSON response
    └─→ Update evidence.ai fields
```

---

## File Flow Details

### What Gets Sent to AI

❌ NOT: URLs, encryption keys, sensitive metadata
✅ YES: Raw file buffers via multipart/form-data

**Transcribe Endpoint**
```
POST http://ai-service:8000/transcribe

Content-Type: multipart/form-data
[binary audio data]
```

**Extract Endpoint**
```
POST http://ai-service:8000/extract

Content-Type: multipart/form-data
[binary PDF/image data]
```

**Analyze Endpoint**
```
POST http://ai-service:8000/analyze

Content-Type: application/json
{ "transcript": "text string" }
```

---

## Code Structure

### aiService.js Functions

```javascript
callTranscribeAI(fileBuffer, mimeType)
// Input: Buffer + mime type
// Output: { transcript: "..." }
// Used by: processEvidenceWithAI()

callAnalyzeAI(transcript)
// Input: Text string
// Output: { summary, sentiment, riskLevel, keywords }
// Used by: processEvidenceWithAI()

callExtractAI(fileBuffer, mimeType)
// Input: Buffer + mime type
// Output: { title, date, description, personName }
// Used by: processEvidenceWithAI()

callKeywordDetectAI(text)
// Input: Text string
// Output: { alert, matchedKeyword, confidence }
// Used by: Keyword monitoring, real-time alerts

isAudioOrVideo(mimeType)
// Helper: Check file type

isDocument(mimeType)
// Helper: Check file type
```

### evidenceController.js Functions

```javascript
processEvidenceWithAI(evidence, fileContent, fileType)
// Main async orchestrator
// Routes to transcribe, analyze, or extract based on file type
// Updates evidence.ai fields as results arrive
// Logs all operations

uploadEvidence(req, res, next)
// Modified to trigger processEvidenceWithAI() without blocking
// Uses fire-and-forget pattern with .catch() for errors
```

### Admin Logging

```javascript
await logAdminAction({
  action: 'AI_TRANSCRIBE|AI_ANALYZE|AI_EXTRACT|AI_KEYWORD_ALERT|AI_AUTO_PROCESS',
  status: 'success|error|alert',
  evidenceId: string,
  details: {
    // action-specific details
  }
});
```

---

## File Type Routing

### Audio/Video Files
```
fileType: audio/* or video/*
    ↓
isAudioOrVideo(fileType) = true
    ↓
Flow:
  1. callTranscribeAI(buffer)    → evidence.ai.transcript
  2. callAnalyzeAI(transcript)   → evidence.ai.summary, sentiment, riskLevel, keywords
```

### Document Files
```
fileType: application/pdf or image/*
    ↓
isDocument(fileType) = true
    ↓
Flow:
  1. callExtractAI(buffer)       → evidence.ai.extractedData
```

### Other Files
```
fileType: other
    ↓
Skip AI processing
    ↓
Log: "Skipping processing for evidence X (file type: Y)"
```

---

## Error Handling Strategy

### Non-Blocking Errors

AI processing never blocks evidence upload:

```javascript
try {
  const result = await callTranscribeAI(buffer, type);
  updateEvidenceAI(id, result);
} catch (error) {
  // Log error and continue
  console.error(`[AI] Processing failed:`, error);
  logAdminAction({ action: 'AI_TRANSCRIBE', status: 'error', ... });
}
```

### Timeout Values

```javascript
callTranscribeAI()  → 300s (5 min) for large files
callAnalyzeAI()     → 60s for text processing
callExtractAI()     → 120s (2 min) for document parsing
callKeywordDetectAI() → 30s for real-time detection
```

### Response Validation

Each AI call validates response structure:

```javascript
if (!response.data.transcript) {
  throw new Error('Invalid AI response: missing transcript field');
}
```

---

## Environment Configuration

### Required .env Variables

```bash
# AI Service URL (required)
AI_SERVICE_URL=http://ai-service:8000

# Optional - for testing/mocking
NODE_ENV=development
MOCK_AI=false
```

### Default Values

```javascript
const AI_BASE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';
```

---

## Extending the System

### Adding a New AI Endpoint

**1. Create service function** in `aiService.js`:
```javascript
async function callNewAI(input) {
  const response = await axios.post(`${AI_BASE_URL}/new-endpoint`, input);
  // Validate and return
  return response.data;
}
module.exports = { ..., callNewAI };
```

**2. Create controller handler** in `aiController.js`:
```javascript
async function handleNewAI(req, res) {
  try {
    const result = await callNewAI(req.body);
    await logAdminAction({ action: 'AI_NEW_ENDPOINT', status: 'success', ... });
    res.json({ success: true, data: result });
  } catch (error) {
    // Error handling and logging
  }
}
module.exports = { ..., handleNewAI };
```

**3. Add route** in `aiRoutes.js`:
```javascript
router.post('/new-endpoint', handleNewAI);
```

**4. Update evidenceMetadataStore** if new field needed:
```javascript
// In the ai object of evidence record
ai: {
  newField: null,
  ...
}
```

**5. Integrate in evidenceController** if auto-trigger needed:
```javascript
if (/* condition */) {
  const result = await callNewAI(data);
  updateEvidenceAI(id, { newField: result.value });
}
```

---

## Testing Endpoints Manually

### 1. Transcribe Audio
```bash
curl -X POST http://localhost:5000/ai/transcribe \
  -F "file=@sample.mp3"
```

### 2. Analyze Text
```bash
curl -X POST http://localhost:5000/ai/analyze \
  -H "Content-Type: application/json" \
  -d '{"transcript": "Sample text to analyze"}'
```

### 3. Extract Document
```bash
curl -X POST http://localhost:5000/ai/extract \
  -F "file=@document.pdf"
```

### 4. Detect Keywords
```bash
curl -X POST http://localhost:5000/ai/detect-keywords \
  -H "Content-Type: application/json" \
  -d '{"text": "Check this text for keywords"}'
```

---

## Debugging

### Enable Debug Logging

View backend logs:
```bash
tail -f logs/app.log | grep "\[AI\]"
```

### Check Admin Logs

Query Firebase:
```javascript
db.collection('admin_logs')
  .where('action', '==', 'AI_TRANSCRIBE')
  .orderBy('timestamp', 'desc')
  .limit(10)
  .get()
```

### Common Issues

**Issue**: "ECONNREFUSED" - AI service not running
**Fix**: Start AI service or update `AI_SERVICE_URL` in .env

**Issue**: Timeout errors
**Fix**: Increase timeout, check AI service performance, check network

**Issue**: Response validation failed
**Fix**: Check AI service response format matches documentation

---

## Performance Considerations

### Async Fire-and-Forget

```javascript
processEvidenceWithAI(evidence, content, type).catch(err => {
  console.error('Async error:', err);
});
```

Benefits:
- Upload response sent immediately
- Users don't wait for AI
- Server can handle multiple uploads concurrently

### Multer Configuration

```javascript
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 500 * 1024 * 1024,  // 500MB limit
  },
});
```

- Memory storage: No disk I/O
- 500MB limit: Support large video files

### Resource Management

- AI calls are isolated (one request per file)
- No connection pooling overhead
- Each promise resolves independently
- Error in one doesn't affect others

---

## Security Best Practices

✅ **Do**: Send file buffers only
❌ **Don't**: Send URLs or encryption keys

✅ **Do**: Validate all AI responses
❌ **Don't**: Trust AI data without checking

✅ **Do**: Log all operations
❌ **Don't**: Process silently

✅ **Do**: Handle errors gracefully
❌ **Don't**: Let errors crash the server

✅ **Do**: Use HTTPS in production
❌ **Don't**: Send files over HTTP

---

## Monitoring

### Key Metrics to Track

1. **AI Success Rate**: Count successful vs failed operations
2. **Processing Time**: How long does each operation take?
3. **File Sizes**: Distribution of processed files
4. **Error Types**: What errors happen most?
5. **Alert Frequency**: How many keyword alerts per day?

### Query Examples

```javascript
// Success rate
db.collection('admin_logs')
  .where('action', '==', 'AI_TRANSCRIBE')
  .get()
  .then(snapshot => {
    const success = snapshot.docs.filter(d => d.status === 'success').length;
    const total = snapshot.size;
    console.log(`Success rate: ${(success/total*100).toFixed(2)}%`);
  });
```

---

## Backward Compatibility

### Old Requests (No AI)

Evidence uploaded before AI integration won't have `ai` field populated.

Update query for backward compatibility:
```javascript
const ai = evidence.ai || {
  transcript: null,
  summary: null,
  sentiment: null,
  riskLevel: null,
  keywords: [],
  extractedData: {}
};
```

---

## Maintenance & Updates

### Updating AI Provider

1. Update `AI_BASE_URL` in .env
2. Update request/response format in `aiService.js`
3. Update validation in controller if response schema changes
4. Test with sample files
5. Deploy and monitor logs

### Adding New File Type Support

1. Add type check function: `isFileType()`
2. Create AI service function: `callServiceAI()`
3. Add routing logic in `processEvidenceWithAI()`
4. Update documentation

---

## Summary

The AI integration is designed for:
- **Security**: No URL exposure, buffer-based transfer
- **Scalability**: Async processing, non-blocking
- **Reliability**: Graceful error handling, admin logging
- **Flexibility**: Swappable AI providers, extensible design
- **Auditability**: Every operation logged with details

Maintain this architecture when extending the system!

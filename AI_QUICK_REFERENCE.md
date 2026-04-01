# AI INTEGRATION - QUICK REFERENCE

## 📋 Files Overview

| File | Purpose | Key Functions |
|------|---------|----------------|
| `aiService.js` | AI HTTP calls | `callTranscribeAI`, `callAnalyzeAI`, `callExtractAI`, `callKeywordDetectAI` |
| `aiController.js` | Endpoint handlers | `transcribeAudio`, `analyzeText`, `extractDocumentData`, `detectKeywords` |
| `aiRoutes.js` | Route definitions | 4 POST endpoints with multer file upload |
| `evidenceController.js` | Auto-trigger | `processEvidenceWithAI()` called after upload |
| `evidenceMetadataStore.js` | Data storage | `updateEvidenceAI()` for flexible updates |
| `index.js` | App setup | AI routes registered |

## 🚀 Core Flow

```
User uploads evidence
    ↓
Backend stores (Arweave + Blockchain)
    ↓
ASYNC: processEvidenceWithAI(evidence, buffer, fileType)
    ├─ Audio/Video:  transcribe → analyze
    ├─ Document:     extract
    └─ Other:        skip
    ↓
Update evidence.ai fields
```

## 🔗 API Endpoints

| Endpoint | Method | Input | Output |
|----------|--------|-------|--------|
| `/ai/transcribe` | POST | File (multipart) | `{ transcript }` |
| `/ai/analyze` | POST | JSON `{ transcript }` | `{ summary, sentiment, riskLevel, keywords }` |
| `/ai/extract` | POST | File (multipart) | `{ title, date, description, personName }` |
| `/ai/detect-keywords` | POST | JSON `{ text }` | `{ alert, matchedKeyword, confidence }` |

## 📊 Evidence AI Schema

```javascript
evidence.ai = {
  transcript: string,              // From transcribe
  summary: string,                 // From analyze
  sentiment: string,               // positive|neutral|negative|distressed
  riskLevel: string,               // LOW|MEDIUM|HIGH
  keywords: string[],              // From analyze
  extractedData: {                 // From extract
    title: string,
    date: string,
    description: string,
    personName: string
  }
}
```

## 🔧 Configuration

```bash
# .env
AI_SERVICE_URL=http://localhost:8000
```

## 📦 Dependencies to Install

```bash
npm install axios multer form-data
```

## 🧪 Quick Test

### Upload Evidence (Auto-Triggers AI)
```bash
curl -X POST http://localhost:5000/evidence/upload \
  -H "Content-Type: application/json" \
  -d '{"fileContent": "SGVsbG8gV29ybGQh", "fileType": "audio/mp3"}'
```

### Check Evidence with AI Data
```bash
curl http://localhost:5000/evidence/1
# Response includes evidence.ai object with processing results
```

## 🔍 Admin Logs

Query Firestore `admin_logs` collection:
- `AI_TRANSCRIBE` - Transcription completed
- `AI_ANALYZE` - Analysis completed
- `AI_EXTRACT` - Extraction completed
- `AI_KEYWORD_ALERT` - Keyword detected
- `AI_AUTO_PROCESS` - Auto-trigger completed

## ⚙️ Key Design Points

✅ **Files sent as buffers** (multipart/form-data), not URLs
✅ **AI is stateless** (no database access)
✅ **Backend manages storage** (fetch, decrypt, send, store)
✅ **Non-blocking** (upload returns before AI finishes)
✅ **Graceful errors** (AI failure doesn't break upload)
✅ **Fully logged** (every operation in admin_logs)

## 🐛 Troubleshooting

| Problem | Solution |
|---------|----------|
| "Cannot find module" | `npm install axios multer form-data` |
| ECONNREFUSED | Start AI service on configured port |
| Timeout errors | Increase timeout values in aiService.js |
| Files not processing | Check admin_logs for errors |
| Wrong response format | Validate AI response matches schema |

## 📈 Monitoring

Check success rate:
```javascript
const success = await db.collection('admin_logs')
  .where('action', '==', 'AI_TRANSCRIBE')
  .where('status', '==', 'success')
  .get();

const total = await db.collection('admin_logs')
  .where('action', '==', 'AI_TRANSCRIBE')
  .get();

console.log(`Success rate: ${(success.size/total.size*100).toFixed(2)}%`);
```

## 📚 Full Documentation

- **API Endpoints**: See `AI_API_DOCUMENTATION.md`
- **Architecture**: See `AI_ARCHITECTURE_GUIDE.md`
- **Setup**: See `AI_SETUP_GUIDE.md`
- **Implementation**: See `IMPLEMENTATION_SUMMARY.md`

## 🚨 Important Notes

⚠️ Always send file buffers to AI, never URLs
⚠️ AI service should never access database
⚠️ Backend is responsible for encryption/decryption
⚠️ Async processing doesn't block user upload
⚠️ All operations must be logged for audit trail

## 🔐 Security Checklist

- [ ] AI_SERVICE_URL environment variable set
- [ ] File size limits configured (500MB default)
- [ ] HTTPS enabled in production
- [ ] Authentication headers added if required
- [ ] Rate limiting configured
- [ ] Admin logs indexed for quick queries
- [ ] Error messages don't leak sensitive data
- [ ] Timeouts set appropriately

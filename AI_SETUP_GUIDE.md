# AI INTEGRATION - SETUP GUIDE

## Required Dependencies

The AI integration uses the following packages that need to be installed:

```bash
npm install axios multer form-data
```

### Why These Packages?

| Package | Purpose | Used In |
|---------|---------|----------|
| `axios` | HTTP client for AI API calls | `aiService.js` |
| `multer` | File upload middleware for Express | `aiRoutes.js` |
| `form-data` | Create multipart/form-data for file streaming | `aiService.js` |

## Installation Steps

### Step 1: Navigate to Backend Directory
```bash
cd d:\PlayGround\Hackathon\Elira\backend
```

### Step 2: Install Dependencies
```bash
npm install axios multer form-data
```

### Step 3: Verify Installation
```bash
npm list axios multer form-data
```

Expected output:
```
├── axios@latest
├── multer@latest
└── form-data@latest
```

## Configuration

### Step 1: Set Environment Variable

Create or update `.env` file in `backend/` directory:

```bash
# AI Service Configuration
AI_SERVICE_URL=http://localhost:8000

# Or for production/remote AI service:
# AI_SERVICE_URL=http://ai-service.example.com:8000
```

### Step 2: Verify Backend Loads

Start the backend and verify no errors:

```bash
npm start
```

Expected output:
```
Server running on port 5000
```

Check that AI routes are loaded by checking your logs or making a test request:

```bash
curl -X POST http://localhost:5000/ai/transcribe \
  -F "file=@test.mp3" \
  --verbose
```

You should get a response (likely an error from AI service not running, which is OK for now).

## Environment Variables Reference

```bash
# REQUIRED
AI_SERVICE_URL=http://localhost:8000

# Optional (will use defaults if not set)
NODE_ENV=development
PORT=5000
```

## Testing Setup

### Quick Connectivity Test

Before processing evidence, verify the backend can reach the AI service:

```bash
# Test if backend can connect to AI service
curl -X GET http://your-ai-service:8000/health
```

### Test Upload Endpoint

```bash
# Upload evidence (backend will auto-trigger AI)
curl -X POST http://localhost:5000/evidence/upload \
  -H "Content-Type: application/json" \
  -d '{
    "fileContent": "SGVsbG8gV29ybGQh",
    "fileType": "text/plain"
  }'
```

### Test AI Endpoints Directly

For manual testing (once AI service is running):

```bash
# 1. Transcribe audio
curl -X POST http://localhost:5000/ai/transcribe \
  -F "file=@sample.mp3"

# 2. Analyze text
curl -X POST http://localhost:5000/ai/analyze \
  -H "Content-Type: application/json" \
  -d '{"transcript": "Sample text to analyze"}'

# 3. Extract document
curl -X POST http://localhost:5000/ai/extract \
  -F "file=@document.pdf"

# 4. Detect keywords
curl -X POST http://localhost:5000/ai/detect-keywords \
  -H "Content-Type: application/json" \
  -d '{"text": "Help me please!"}'
```

## Troubleshooting

### Issue: "Cannot find module 'axios'"

**Solution**: Install missing dependencies
```bash
npm install axios multer form-data
```

### Issue: "ECONNREFUSED - AI Service Not Running"

**Solution**: Start AI service on the configured port
```bash
# Check current AI_SERVICE_URL in .env
cat .env | grep AI_SERVICE_URL

# Start your AI service accordingly
docker run -p 8000:8000 your-ai-service
# or
python ai_service.py  # if Python-based
# or
node ai-server.js    # if Node-based
```

### Issue: Backend Starts but AI Calls Timeout

**Reasons**:
1. AI service not running
2. Wrong AI_SERVICE_URL
3. AI service not responding
4. Network connectivity issue

**Debug**:
```bash
# Check if AI service is accessible
curl -v http://your-ai-service:8000/

# Check backend logs
tail -f backend.log | grep "[AI]"

# Check if port is listening
netstat -an | grep 8000
```

### Issue: "Multer: Unexpected end of form"

**Solution**: Ensure Content-Type header is correct
```bash
# ✅ Correct: with -F flag (automatic Content-Type)
curl -X POST http://localhost:5000/ai/transcribe \
  -F "file=@audio.mp3"

# ❌ Wrong: must include multipart/form-data
curl -X POST http://localhost:5000/ai/transcribe \
  -H "Content-Type: multipart/form-data" \
  -F "file=@audio.mp3"  # Don't manually set header with -F
```

## File Size Limits

Current configuration supports:
- Max file size: **500MB** (for large video files)
- Supported formats:
  - Audio: `.mp3`, `.wav`, `.aac`, `.flac`, `.m4a`
  - Video: `.mp4`, `.avi`, `.mov`, `.mkv`, `.webm`
  - Documents: `.pdf`, `.jpg`, `.png`, `.gif`, `.tiff`

To modify limits, edit `backend/src/routes/aiRoutes.js`:

```javascript
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 500 * 1024 * 1024,  // ← Change this value
  },
});
```

## Performance Tuning

### Increase Timeout for Large Files

Edit `backend/src/services/aiService.js`:

```javascript
async function callTranscribeAI(fileBuffer, mimeType) {
  const response = await axios.post(`${AI_BASE_URL}/transcribe`, form, {
    headers: form.getHeaders(),
    timeout: 600000, // ← Increase from 300000 (5 min to 10 min)
  });
  // ...
}
```

### Adjust Queue/Concurrency

Backend uses Node.js event loop (default to 4 concurrent async operations).

For more control, add Bull queue package:
```bash
npm install bull redis
```

Then update `processEvidenceWithAI()` to use queue instead of fire-and-forget.

## Monitoring & Logging

### Check Admin Logs

After processing, verify in Firestore:

```javascript
db.collection('admin_logs')
  .where('action', '==', 'AI_TRANSCRIBE')
  .where('status', '==', 'success')
  .orderBy('timestamp', 'desc')
  .limit(10)
  .get()
  .then(snapshot => {
    snapshot.docs.forEach(doc => {
      console.log(doc.data());
    });
  });
```

### View Evidence with AI Data

```javascript
db.collection('evidence').doc('1').get().then(doc => {
  console.log(doc.data().ai);
  // Should show:
  // {
  //   transcript: "...",
  //   summary: "...",
  //   sentiment: "...",
  //   riskLevel: "...",
  //   keywords: [...],
  //   extractedData: { title, date, description, personName }
  // }
});
```

## Production Deployment

### 1. Update Environment Variables

```bash
# .env.production
AI_SERVICE_URL=https://api.ai-service.example.com
NODE_ENV=production
PORT=5000
```

### 2. Security Best Practices

```javascript
// In aiService.js - add request signing (if required)
const signature = crypto.createHmac('sha256', process.env.AI_SECRET)
  .update(fileBuffer)
  .digest('hex');

headers['X-Signature'] = signature;
```

### 3. Rate Limiting

Add express-rate-limit:
```bash
npm install express-rate-limit
```

```javascript
const rateLimit = require('express-rate-limit');

const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

router.post('/transcribe', aiLimiter, transcribeAudio);
```

### 4. HTTPS Only

In production environment, ensure:
- AI_SERVICE_URL uses HTTPS
- Backend uses HTTPS
- Certificates are valid

## Database Backup

Before deploying, backup Firestore collections:

```bash
firebase firestore:export gs://your-bucket/backup --token=$FIREBASE_TOKEN
```

## Support

For issues:
1. Check documentation: `AI_API_DOCUMENTATION.md`
2. Review architecture: `AI_ARCHITECTURE_GUIDE.md`
3. Check implementation: `IMPLEMENTATION_SUMMARY.md`
4. Review backend logs
5. Check admin_logs in Firestore

const express = require('express');
const dotenv = require('dotenv');
const healthRoutes = require('./routes/healthRoutes');
const evidenceRoutes = require('./routes/evidenceRoutes');
const authRoutes = require('./routes/authRoutes');
const aiRoutes = require('./routes/aiRoutes');
const { initializeFirebase } = require('./config/firebase');
const { notFound } = require('./middlewares/notFound');
const { errorHandler } = require('./middlewares/errorHandler');

dotenv.config();

const requireFirebaseOnBoot = String(process.env.REQUIRE_FIREBASE_ON_BOOT || '').toLowerCase() === 'true';

try {
  initializeFirebase();
} catch (error) {
  if (requireFirebaseOnBoot) {
    throw error;
  }

  console.warn('[startup] Firebase initialization skipped:', error.message);
}

const app = express();
const port = process.env.PORT || 5000;

// Evidence upload sends base64 payloads, so allow larger JSON bodies.
// 200MB limit to handle large video files after base64 encoding
app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ extended: true, limit: '200mb' }));
app.use('/health', healthRoutes);
app.use('/auth', authRoutes);
app.use('/evidence', evidenceRoutes);
app.use('/ai', aiRoutes);
app.use(notFound);
app.use(errorHandler);

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});


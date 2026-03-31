const express = require('express');
const dotenv = require('dotenv');
const healthRoutes = require('./routes/healthRoutes');
const evidenceRoutes = require('./routes/evidenceRoutes');
const authRoutes = require('./routes/authRoutes');
const { initializeFirebase } = require('./config/firebase');
const { notFound } = require('./middlewares/notFound');
const { errorHandler } = require('./middlewares/errorHandler');

dotenv.config();
initializeFirebase();

const app = express();
const port = process.env.PORT || 5000;

app.use(express.json());
app.use('/health', healthRoutes);
app.use('/auth', authRoutes);
app.use('/evidence', evidenceRoutes);
app.use(notFound);
app.use(errorHandler);

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

const express = require('express');
const dotenv = require('dotenv');
const healthRoutes = require('./routes/healthRoutes');
const { initializeFirebase } = require('./config/firebase');
const { notFound } = require('./middlewares/notFound');
const { errorHandler } = require('./middlewares/errorHandler');

dotenv.config();
initializeFirebase();

const app = express();
const port = process.env.PORT || 5000;

app.use(express.json());
app.use('/health', healthRoutes);
app.use(notFound);
app.use(errorHandler);

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

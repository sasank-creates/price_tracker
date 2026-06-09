require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
const { apiLimiter } = require('./utils/rateLimiter');
const { startScheduler } = require('./services/scheduler');
const logger = require('./utils/logger');

// Routes
const productsRouter = require('./routes/products');
const adminRouter = require('./routes/admin');
const checksRouter = require('./routes/checks');

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors({
  origin: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(apiLimiter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/products', productsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/unsubscribe', checksRouter);

// Global error handler
app.use((err, req, res, next) => {
  logger.error(`Unhandled error: ${err.message}`, { stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
async function start() {
  try {
    await prisma.$connect();
    logger.info('Database connected');

    app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
    });

    // Start the background scheduler
    startScheduler();
    logger.info('Background scheduler started');
  } catch (error) {
    logger.error(`Failed to start server: ${error.message}`);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down...');
  const { closeBrowser } = require('./services/scraper');
  await closeBrowser();
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down...');
  const { closeBrowser } = require('./services/scraper');
  await closeBrowser();
  await prisma.$disconnect();
  process.exit(0);
});

start();

module.exports = app;

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const prisma = require('./utils/prisma'); // shared singleton
const { apiLimiter } = require('./utils/rateLimiter');
const { startScheduler } = require('./services/scheduler');
const { verifyTransporter } = require('./services/email');
const logger = require('./utils/logger');

// Routes
const productsRouter = require('./routes/products');
const adminRouter = require('./routes/admin');
const checksRouter = require('./routes/checks');

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors({
  origin: process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

// Request/Response Logger Middleware
app.use((req, res, next) => {
  const startTime = Date.now();
  const { method, originalUrl, query, body } = req;
  const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  console.log(`[HTTP] INCOMING ${method} ${originalUrl}`, {
    ip,
    query,
    body: method !== 'GET' ? body : undefined
  });

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    console.log(`[HTTP] OUTGOING ${method} ${originalUrl} - Status: ${res.statusCode} (${duration}ms)`);
  });

  next();
});

app.use(apiLimiter);

// Health check — also useful as a Render uptime ping target
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

    // Verify SMTP connection at startup so failures are visible in logs immediately
    // rather than being discovered silently when the first alert should fire.
    await verifyTransporter();

    // Start the background scheduler (in-process cron).
    // NOTE: On Render free tier this will die when the dyno sleeps.
    // Use the POST /api/admin/run-checks endpoint with an external cron
    // service (cron-job.org, Render Cron Job) as a more reliable alternative.
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

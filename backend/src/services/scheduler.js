const cron = require('node-cron');
const { PrismaClient } = require('@prisma/client');
const { scrapePrice } = require('./scraper');
const { sendPriceAlert } = require('./email');
const logger = require('../utils/logger');

const prisma = new PrismaClient();

// Track running checks to prevent duplicates
const runningChecks = new Set();

// Notification cooldown: 6 hours between notifications for the same product
const NOTIFICATION_COOLDOWN_MS = 6 * 60 * 60 * 1000;

// Max retries for temporary failures
const MAX_RETRIES = 3;

let cronJob = null;

/**
 * Start the scheduler
 * Runs at the configured CRON_INTERVAL (default: every 5 minutes)
 */
function startScheduler() {
  const interval = process.env.CRON_INTERVAL || '*/5 * * * *';
  logger.info(`Starting scheduler with interval: ${interval}`);

  cronJob = cron.schedule(interval, async () => {
    logger.info('Scheduler tick — checking products due for price check');
    await runScheduledChecks();
  });

  return cronJob;
}

/**
 * Stop the scheduler
 */
function stopScheduler() {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
    logger.info('Scheduler stopped');
  }
}

/**
 * Run checks for all products due for a price check
 */
async function runScheduledChecks() {
  try {
    const now = new Date();
    const products = await prisma.product.findMany({
      where: { isActive: true },
      include: { user: true },
    });

    const dueProducts = products.filter((p) => {
      if (!p.lastCheckedAt) return true;
      const nextCheck = new Date(p.lastCheckedAt.getTime() + p.checkInterval * 60 * 1000);
      return now >= nextCheck;
    });

    logger.info(`${dueProducts.length} products due for check out of ${products.length} total`);

    // Process sequentially to be respectful with scraping
    for (const product of dueProducts) {
      await checkProduct(product, product.user);
      // Small delay between requests for rate limiting
      await sleep(2000);
    }
  } catch (error) {
    logger.error(`Scheduler error: ${error.message}`, { stack: error.stack });
  }
}

/**
 * Check a single product's price
 * @param {Object} product - Product record from DB
 * @param {Object} user - User record from DB
 * @param {number} retryCount - Current retry attempt
 */
async function checkProduct(product, user, retryCount = 0) {
  // Prevent duplicate concurrent checks
  if (runningChecks.has(product.id)) {
    logger.debug(`Skipping duplicate check for product ${product.id}`);
    return;
  }

  runningChecks.add(product.id);

  try {
    logger.info(`Checking price for product ${product.id}: ${product.url}`);
    const result = await scrapePrice(product.url, product.id);

    if (result.price !== null) {
      // Successful scrape
      const status = result.price <= product.expectedPrice ? 'TARGET_REACHED' : 'ABOVE_TARGET';

      await prisma.product.update({
        where: { id: product.id },
        data: {
          currentPrice: result.price,
          name: result.name || product.name,
          status,
          lastCheckedAt: new Date(),
        },
      });

      await prisma.priceCheck.create({
        data: {
          productId: product.id,
          price: result.price,
          success: true,
        },
      });

      logger.info(`Price for ${product.id}: ₹${result.price} (${status})`, { source: result.source });

      // Send notification if price reached target
      if (status === 'TARGET_REACHED' && user.isSubscribed) {
        await handleNotification(product, user, result.price);
      }
    } else {
      // Scrape failed
      if (retryCount < MAX_RETRIES) {
        logger.warn(`Scrape failed for ${product.id}, retrying (${retryCount + 1}/${MAX_RETRIES})`);
        await sleep(5000);
        runningChecks.delete(product.id);
        return checkProduct(product, user, retryCount + 1);
      }

      await prisma.product.update({
        where: { id: product.id },
        data: { status: 'SCRAPE_FAILED', lastCheckedAt: new Date() },
      });

      await prisma.priceCheck.create({
        data: { productId: product.id, price: null, success: false, error: result.error || 'Price extraction failed' },
      });

      await prisma.failureLog.create({
        data: {
          productId: product.id,
          url: product.url,
          error: result.error || 'All scraping strategies failed',
          errorType: result.source === 'error' ? 'network' : 'selector',
        },
      });

      logger.error(`All retries failed for product ${product.id}`);
    }
  } catch (error) {
    logger.error(`Check error for product ${product.id}: ${error.message}`);
  } finally {
    runningChecks.delete(product.id);
  }
}

/**
 * Handle notification with cooldown logic
 */
async function handleNotification(product, user, currentPrice) {
  // Check cooldown
  const lastNotif = await prisma.notification.findFirst({
    where: { productId: product.id },
    orderBy: { sentAt: 'desc' },
  });

  if (lastNotif) {
    const timeSince = Date.now() - lastNotif.sentAt.getTime();
    if (timeSince < NOTIFICATION_COOLDOWN_MS) {
      logger.debug(`Notification cooldown active for product ${product.id}`);
      return;
    }
  }

  const emailResult = await sendPriceAlert({
    to: user.email,
    productName: product.name,
    productUrl: product.url,
    currentPrice,
    expectedPrice: product.expectedPrice,
    unsubscribeToken: user.unsubscribeToken,
  });

  if (emailResult.success) {
    await prisma.notification.create({
      data: { productId: product.id, price: currentPrice },
    });
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { startScheduler, stopScheduler, checkProduct, runScheduledChecks };

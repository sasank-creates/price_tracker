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
    console.log('[SCHEDULER] runScheduledChecks: Fetching active products from DB');
    const products = await prisma.product.findMany({
      where: { isActive: true },
      include: { user: true },
    });

    console.debug(`[SCHEDULER] Found ${products.length} active products to evaluate`);
    const dueProducts = products.filter((p) => {
      if (!p.lastCheckedAt) {
        console.debug(`[SCHEDULER] Product ${p.id} has never been checked; marking as due.`);
        return true;
      }
      const nextCheck = new Date(p.lastCheckedAt.getTime() + p.checkInterval * 60 * 1000);
      const isDue = now >= nextCheck;
      console.debug(`[SCHEDULER] Product ${p.id}: last checked = ${p.lastCheckedAt.toISOString()}, next check = ${nextCheck.toISOString()}. Is due = ${isDue}`);
      return isDue;
    });

    console.log(`[SCHEDULER] ${dueProducts.length} products due for check out of ${products.length} total`);

    // Process sequentially to be respectful with scraping
    for (let i = 0; i < dueProducts.length; i++) {
      const product = dueProducts[i];
      console.log(`[SCHEDULER] Processing due product [${i + 1}/${dueProducts.length}] - ID: ${product.id}`);
      await checkProduct(product, product.user);
      // Small delay between requests for rate limiting
      if (i < dueProducts.length - 1) {
        console.debug('[SCHEDULER] Sleeping 2000ms before processing next due product');
        await sleep(2000);
      }
    }
    console.log('[SCHEDULER] Scheduled checks processing cycle completed.');
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
  console.debug(`[SCHEDULER] checkProduct initiated for product ID: ${product.id} (Retry: ${retryCount})`);
  if (runningChecks.has(product.id)) {
    console.log(`[SCHEDULER] Skipping check for product ${product.id} — already running.`);
    return;
  }

  runningChecks.add(product.id);
  console.debug(`[SCHEDULER] Added product ID ${product.id} to running checks set`);

  try {
    console.log(`[SCHEDULER] Checking price for product ${product.id}: ${product.url}`);
    const result = await scrapePrice(product.url, product.id);

    console.debug(`[SCHEDULER] scrapePrice result for product ID ${product.id}:`, { price: result.price, source: result.source });

    if (result.price !== null) {
      // Successful scrape
      const status = result.price <= product.expectedPrice ? 'TARGET_REACHED' : 'ABOVE_TARGET';
      console.log(`[SCHEDULER] Scrape success for product ID ${product.id}. Price: ₹${result.price}, Target: ₹${product.expectedPrice}. Status: ${status}`);

      console.debug(`[SCHEDULER] Updating product ID ${product.id} in DB`);
      await prisma.product.update({
        where: { id: product.id },
        data: {
          currentPrice: result.price,
          name: result.name || product.name,
          status,
          lastCheckedAt: new Date(),
        },
      });

      console.debug(`[SCHEDULER] Recording PriceCheck entry in DB for product ID ${product.id}`);
      await prisma.priceCheck.create({
        data: {
          productId: product.id,
          price: result.price,
          success: true,
        },
      });

      logger.info(`Price for ${product.id}: ₹${result.price} (${status})`, { source: result.source });

      // Send notification if price reached target
      if (status === 'TARGET_REACHED') {
        if (user.isSubscribed) {
          console.log(`[SCHEDULER] Product ${product.id} target reached. Triggering notification handler for user ${user.email}`);
          await handleNotification(product, user, result.price);
        } else {
          console.log(`[SCHEDULER] Product ${product.id} target reached, but user ${user.email} is unsubscribed.`);
        }
      }
    } else {
      // Scrape failed
      console.warn(`[SCHEDULER] Scrape failed for product ID ${product.id}. Error: ${result.error || 'Unknown error'}`);
      if (retryCount < MAX_RETRIES) {
        console.log(`[SCHEDULER] Retrying scrape for product ID ${product.id} (${retryCount + 1}/${MAX_RETRIES}) in 5000ms`);
        await sleep(5000);
        runningChecks.delete(product.id);
        console.debug(`[SCHEDULER] Removed product ID ${product.id} from running checks before retry`);
        return checkProduct(product, user, retryCount + 1);
      }

      logger.error(`[SCHEDULER] All retries failed for product ID ${product.id}. Updating DB with SCRAPE_FAILED status.`);
      await prisma.product.update({
        where: { id: product.id },
        data: { status: 'SCRAPE_FAILED', lastCheckedAt: new Date() },
      });

      console.debug(`[SCHEDULER] Creating failed PriceCheck entry in DB for product ID ${product.id}`);
      await prisma.priceCheck.create({
        data: { productId: product.id, price: null, success: false, error: result.error || 'Price extraction failed' },
      });

      console.debug(`[SCHEDULER] Creating FailureLog in DB for product ID ${product.id}`);
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
    logger.error(`Check error for product ${product.id}: ${error.message}`, { stack: error.stack });
  } finally {
    runningChecks.delete(product.id);
    console.debug(`[SCHEDULER] Removed product ID ${product.id} from running checks in finally block`);
  }
}

/**
 * Handle notification with cooldown logic
 */
async function handleNotification(product, user, currentPrice) {
  console.log(`[SCHEDULER] handleNotification checking cooldown for product ID: ${product.id}, user: ${user.email}`);
  // Check cooldown
  const lastNotif = await prisma.notification.findFirst({
    where: { productId: product.id },
    orderBy: { sentAt: 'desc' },
  });

  if (lastNotif) {
    const timeSince = Date.now() - lastNotif.sentAt.getTime();
    console.debug(`[SCHEDULER] Last notification sent at ${lastNotif.sentAt.toISOString()}. Time elapsed: ${timeSince}ms (Cooldown: ${NOTIFICATION_COOLDOWN_MS}ms)`);
    if (timeSince < NOTIFICATION_COOLDOWN_MS) {
      console.log(`[SCHEDULER] Cooldown active for product ${product.id}. Skipping email alert.`);
      return;
    }
  } else {
    console.debug(`[SCHEDULER] No previous notifications found for product ${product.id}.`);
  }

  console.log(`[SCHEDULER] Cooldown check passed. Sending price alert email to: ${user.email}`);
  const emailResult = await sendPriceAlert({
    to: user.email,
    productName: product.name,
    productUrl: product.url,
    currentPrice,
    expectedPrice: product.expectedPrice,
    unsubscribeToken: user.unsubscribeToken,
  });

  if (emailResult.success) {
    logger.info(`Price alert email sent to ${user.email} for product ${product.id}`);
    await prisma.notification.create({
      data: { productId: product.id, price: currentPrice },
    });
  } else {
    logger.error(`[SCHEDULER] Price alert email failed: ${emailResult.error}`);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { startScheduler, stopScheduler, checkProduct, runScheduledChecks };

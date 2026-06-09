const express = require('express');
const { PrismaClient } = require('@prisma/client');
const logger = require('../utils/logger');

const router = express.Router();
const prisma = new PrismaClient();

/**
 * GET /api/admin/failures - List failed scrapes
 */
router.get('/failures', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    console.log('[ADMIN ROUTE] GET /failures request received', { page, limit });
    const skip = (parseInt(page) - 1) * parseInt(limit);

    console.debug('[ADMIN ROUTE] Querying DB for failure logs');
    const [failures, total] = await Promise.all([
      prisma.failureLog.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit),
        include: {
          product: { select: { url: true, name: true, site: true } },
        },
      }),
      prisma.failureLog.count(),
    ]);

    console.log(`[ADMIN ROUTE] Fetched ${failures.length} failures out of ${total} total`);
    res.json({ failures, total, page: parseInt(page), totalPages: Math.ceil(total / parseInt(limit)) });
  } catch (error) {
    logger.error(`Error fetching failures: ${error.message}`, { stack: error.stack });
    res.status(500).json({ error: 'Failed to fetch failure logs' });
  }
});

/**
 * POST /api/admin/failures/:id/resolve - Mark a failure as resolved
 */
router.post('/failures/:id/resolve', async (req, res) => {
  try {
    console.log(`[ADMIN ROUTE] POST /failures/:id/resolve received for ID: ${req.params.id}`);
    console.debug(`[ADMIN ROUTE] Updating failureLog resolvedAt for ID: ${req.params.id}`);
    await prisma.failureLog.update({
      where: { id: req.params.id },
      data: { resolvedAt: new Date() },
    });
    console.log(`[ADMIN ROUTE] Successfully resolved failure: ${req.params.id}`);
    res.json({ success: true });
  } catch (error) {
    logger.error(`Error resolving failure: ${error.message}`, { id: req.params.id, stack: error.stack });
    res.status(500).json({ error: 'Failed to resolve failure' });
  }
});

/**
 * GET /api/admin/stats - Dashboard stats
 */
router.get('/stats', async (req, res) => {
  try {
    console.log('[ADMIN ROUTE] GET /stats request received');
    console.debug('[ADMIN ROUTE] Fetching DB counts for dashboard stats');
    const [totalProducts, activeProducts, totalUsers, recentFailures, totalChecks] = await Promise.all([
      prisma.product.count(),
      prisma.product.count({ where: { isActive: true } }),
      prisma.user.count(),
      prisma.failureLog.count({ where: { resolvedAt: null } }),
      prisma.priceCheck.count(),
    ]);

    console.log('[ADMIN ROUTE] Successfully calculated dashboard stats', { totalProducts, activeProducts, totalUsers, unresolvedFailures: recentFailures, totalChecks });
    res.json({ totalProducts, activeProducts, totalUsers, unresolvedFailures: recentFailures, totalChecks });
  } catch (error) {
    logger.error(`Error fetching stats: ${error.message}`, { stack: error.stack });
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

/**
 * GET /api/admin/selectors - View cached selectors
 */
router.get('/selectors', async (req, res) => {
  try {
    console.log('[ADMIN ROUTE] GET /selectors request received');
    console.debug('[ADMIN ROUTE] Fetching selector cache entries from DB');
    const selectors = await prisma.selectorCache.findMany({
      orderBy: { lastUsedAt: 'desc' },
    });
    console.log(`[ADMIN ROUTE] Successfully fetched ${selectors.length} cached selectors`);
    res.json(selectors);
  } catch (error) {
    logger.error(`Error fetching selectors: ${error.message}`, { stack: error.stack });
    res.status(500).json({ error: 'Failed to fetch selectors' });
  }
});

module.exports = router;

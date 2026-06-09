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
    const skip = (parseInt(page) - 1) * parseInt(limit);

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

    res.json({ failures, total, page: parseInt(page), totalPages: Math.ceil(total / parseInt(limit)) });
  } catch (error) {
    logger.error(`Error fetching failures: ${error.message}`);
    res.status(500).json({ error: 'Failed to fetch failure logs' });
  }
});

/**
 * POST /api/admin/failures/:id/resolve - Mark a failure as resolved
 */
router.post('/failures/:id/resolve', async (req, res) => {
  try {
    await prisma.failureLog.update({
      where: { id: req.params.id },
      data: { resolvedAt: new Date() },
    });
    res.json({ success: true });
  } catch (error) {
    logger.error(`Error resolving failure: ${error.message}`);
    res.status(500).json({ error: 'Failed to resolve failure' });
  }
});

/**
 * GET /api/admin/stats - Dashboard stats
 */
router.get('/stats', async (req, res) => {
  try {
    const [totalProducts, activeProducts, totalUsers, recentFailures, totalChecks] = await Promise.all([
      prisma.product.count(),
      prisma.product.count({ where: { isActive: true } }),
      prisma.user.count(),
      prisma.failureLog.count({ where: { resolvedAt: null } }),
      prisma.priceCheck.count(),
    ]);

    res.json({ totalProducts, activeProducts, totalUsers, unresolvedFailures: recentFailures, totalChecks });
  } catch (error) {
    logger.error(`Error fetching stats: ${error.message}`);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

/**
 * GET /api/admin/selectors - View cached selectors
 */
router.get('/selectors', async (req, res) => {
  try {
    const selectors = await prisma.selectorCache.findMany({
      orderBy: { lastUsedAt: 'desc' },
    });
    res.json(selectors);
  } catch (error) {
    logger.error(`Error fetching selectors: ${error.message}`);
    res.status(500).json({ error: 'Failed to fetch selectors' });
  }
});

module.exports = router;

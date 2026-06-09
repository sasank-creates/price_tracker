const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { checkProduct } = require('../services/scheduler');
const { detectSite } = require('../utils/selectors');
const { checkLimiter } = require('../utils/rateLimiter');
const logger = require('../utils/logger');

const router = express.Router();
const prisma = new PrismaClient();

/**
 * POST /api/products - Add a new product to monitor
 * After creating the product, immediately triggers a background price check
 * so the frontend shows a real price as soon as the scraper finishes.
 */
router.post('/', async (req, res) => {
  try {
    const { url, expectedPrice, email, checkInterval } = req.body;

    if (!url || !expectedPrice || !email || !checkInterval) {
      return res.status(400).json({ error: 'Missing required fields: url, expectedPrice, email, checkInterval' });
    }

    if (expectedPrice <= 0) {
      return res.status(400).json({ error: 'Expected price must be positive' });
    }

    if (checkInterval < 5) {
      return res.status(400).json({ error: 'Check interval must be at least 5 minutes' });
    }

    // Find or create user by email
    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await prisma.user.create({ data: { email } });
      logger.info(`New user created: ${email}`);
    }

    const site = detectSite(url);
    const product = await prisma.product.create({
      data: {
        url,
        expectedPrice: parseFloat(expectedPrice),
        checkInterval: parseInt(checkInterval),
        site,
        userId: user.id,
      },
      include: { user: { select: { email: true } } },
    });

    logger.info(`Product added: ${product.id}`, { url, site });

    // Immediately trigger a background price check so currentPrice populates quickly
    checkProduct(product, user).catch((err) =>
      logger.error(`Initial check error for ${product.id}: ${err.message}`)
    );

    res.status(201).json(product);
  } catch (error) {
    logger.error(`Error creating product: ${error.message}`);
    res.status(500).json({ error: 'Failed to add product' });
  }
});

/**
 * GET /api/products - List all monitored products
 */
router.get('/', async (req, res) => {
  try {
    const { email } = req.query;
    const where = email ? { user: { email } } : {};

    const products = await prisma.product.findMany({
      where,
      include: {
        user: { select: { email: true } },
        priceChecks: { orderBy: { checkedAt: 'desc' }, take: 1 },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(products);
  } catch (error) {
    logger.error(`Error listing products: ${error.message}`);
    res.status(500).json({ error: 'Failed to list products' });
  }
});

/**
 * GET /api/products/:id - Get product details
 */
router.get('/:id', async (req, res) => {
  try {
    const product = await prisma.product.findUnique({
      where: { id: req.params.id },
      include: {
        user: { select: { email: true } },
        priceChecks: { orderBy: { checkedAt: 'desc' }, take: 50 },
        notifications: { orderBy: { sentAt: 'desc' }, take: 10 },
      },
    });

    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  } catch (error) {
    logger.error(`Error fetching product: ${error.message}`);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

/**
 * PUT /api/products/:id - Edit a product
 */
router.put('/:id', async (req, res) => {
  try {
    const { url, expectedPrice, checkInterval, isActive } = req.body;
    const data = {};

    if (url !== undefined) { data.url = url; data.site = detectSite(url); }
    if (expectedPrice !== undefined) data.expectedPrice = parseFloat(expectedPrice);
    if (checkInterval !== undefined) data.checkInterval = parseInt(checkInterval);
    if (isActive !== undefined) data.isActive = isActive;

    const product = await prisma.product.update({
      where: { id: req.params.id },
      data,
      include: { user: { select: { email: true } } },
    });

    logger.info(`Product updated: ${product.id}`);
    res.json(product);
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Product not found' });
    logger.error(`Error updating product: ${error.message}`);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

/**
 * DELETE /api/products/:id - Delete a product
 */
router.delete('/:id', async (req, res) => {
  try {
    await prisma.product.delete({ where: { id: req.params.id } });
    logger.info(`Product deleted: ${req.params.id}`);
    res.json({ success: true });
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Product not found' });
    logger.error(`Error deleting product: ${error.message}`);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

/**
 * POST /api/products/:id/check - Manual "Check Now"
 */
router.post('/:id/check', checkLimiter, async (req, res) => {
  try {
    const product = await prisma.product.findUnique({
      where: { id: req.params.id },
      include: { user: true },
    });

    if (!product) return res.status(404).json({ error: 'Product not found' });

    // Run check asynchronously
    checkProduct(product, product.user).catch((err) =>
      logger.error(`Manual check error: ${err.message}`)
    );

    res.json({ success: true, message: 'Price check initiated' });
  } catch (error) {
    logger.error(`Error initiating check: ${error.message}`);
    res.status(500).json({ error: 'Failed to initiate check' });
  }
});

/**
 * GET /api/products/:id/history - Get price history for charts
 */
router.get('/:id/history', async (req, res) => {
  try {
    const { limit = 100 } = req.query;
    const history = await prisma.priceCheck.findMany({
      where: { productId: req.params.id, success: true },
      orderBy: { checkedAt: 'asc' },
      take: parseInt(limit),
      select: { price: true, checkedAt: true },
    });
    res.json(history);
  } catch (error) {
    logger.error(`Error fetching history: ${error.message}`);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

module.exports = router;

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
    console.log(`[PRODUCTS ROUTE] POST / request received`, { url, expectedPrice, email, checkInterval });

    if (!url || !expectedPrice || !email || !checkInterval) {
      console.warn(`[PRODUCTS ROUTE] POST / validation failed: missing required fields`);
      return res.status(400).json({ error: 'Missing required fields: url, expectedPrice, email, checkInterval' });
    }

    if (expectedPrice <= 0) {
      console.warn(`[PRODUCTS ROUTE] POST / validation failed: expectedPrice must be positive, got ${expectedPrice}`);
      return res.status(400).json({ error: 'Expected price must be positive' });
    }

    if (checkInterval < 5) {
      console.warn(`[PRODUCTS ROUTE] POST / validation failed: checkInterval must be >= 5, got ${checkInterval}`);
      return res.status(400).json({ error: 'Check interval must be at least 5 minutes' });
    }

    // Find or create user by email
    console.debug(`[PRODUCTS ROUTE] Looking up user by email: ${email}`);
    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      console.log(`[PRODUCTS ROUTE] User ${email} not found. Creating new user...`);
      user = await prisma.user.create({ data: { email } });
      logger.info(`New user created: ${email}`);
    } else {
      console.debug(`[PRODUCTS ROUTE] Found user: ${user.email} (ID: ${user.id})`);
    }

    const site = detectSite(url);
    console.log(`[PRODUCTS ROUTE] Detected site "${site}" for URL: ${url}`);
    
    console.debug(`[PRODUCTS ROUTE] Creating product in database`);
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
    console.log(`[PRODUCTS ROUTE] Triggering initial background check for product ID: ${product.id}`);
    checkProduct(product, user).catch((err) =>
      logger.error(`Initial check error for ${product.id}: ${err.message}`)
    );

    res.status(201).json(product);
  } catch (error) {
    logger.error(`Error creating product: ${error.message}`, { stack: error.stack });
    res.status(500).json({ error: 'Failed to add product' });
  }
});

router.get('/', async (req, res) => {
  try {
    const { email } = req.query;
    console.log(`[PRODUCTS ROUTE] GET / request received`, { email });
    const where = email ? { user: { email } } : {};

    console.debug(`[PRODUCTS ROUTE] Fetching products list from DB`);
    const products = await prisma.product.findMany({
      where,
      include: {
        user: { select: { email: true } },
        priceChecks: { orderBy: { checkedAt: 'desc' }, take: 1 },
      },
      orderBy: { createdAt: 'desc' },
    });

    console.log(`[PRODUCTS ROUTE] Successfully retrieved ${products.length} products`);
    res.json(products);
  } catch (error) {
    logger.error(`Error listing products: ${error.message}`, { stack: error.stack });
    res.status(500).json({ error: 'Failed to list products' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    console.log(`[PRODUCTS ROUTE] GET /:id request received for ID: ${req.params.id}`);
    console.debug(`[PRODUCTS ROUTE] Fetching product details from DB for ID: ${req.params.id}`);
    const product = await prisma.product.findUnique({
      where: { id: req.params.id },
      include: {
        user: { select: { email: true } },
        priceChecks: { orderBy: { checkedAt: 'desc' }, take: 50 },
        notifications: { orderBy: { sentAt: 'desc' }, take: 10 },
      },
    });

    if (!product) {
      console.warn(`[PRODUCTS ROUTE] GET /:id failed: product ID ${req.params.id} not found`);
      return res.status(404).json({ error: 'Product not found' });
    }
    
    console.log(`[PRODUCTS ROUTE] Successfully fetched details for product: ${product.id}`);
    res.json(product);
  } catch (error) {
    logger.error(`Error fetching product: ${error.message}`, { id: req.params.id, stack: error.stack });
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { url, expectedPrice, checkInterval, isActive } = req.body;
    console.log(`[PRODUCTS ROUTE] PUT /:id request received for ID: ${req.params.id}`, { url, expectedPrice, checkInterval, isActive });
    const data = {};

    if (url !== undefined) {
      data.url = url;
      data.site = detectSite(url);
      console.debug(`[PRODUCTS ROUTE] Setting updated url: ${url} and detected site: ${data.site}`);
    }
    if (expectedPrice !== undefined) {
      data.expectedPrice = parseFloat(expectedPrice);
      console.debug(`[PRODUCTS ROUTE] Setting updated expectedPrice: ${data.expectedPrice}`);
    }
    if (checkInterval !== undefined) {
      data.checkInterval = parseInt(checkInterval);
      console.debug(`[PRODUCTS ROUTE] Setting updated checkInterval: ${data.checkInterval}`);
    }
    if (isActive !== undefined) {
      data.isActive = isActive;
      console.debug(`[PRODUCTS ROUTE] Setting updated isActive: ${data.isActive}`);
    }

    console.debug(`[PRODUCTS ROUTE] Executing product update in DB for ID: ${req.params.id}`);
    const product = await prisma.product.update({
      where: { id: req.params.id },
      data,
      include: { user: { select: { email: true } } },
    });

    logger.info(`Product updated: ${product.id}`);
    res.json(product);
  } catch (error) {
    if (error.code === 'P2025') {
      console.warn(`[PRODUCTS ROUTE] Update failed: Product ID ${req.params.id} not found`);
      return res.status(404).json({ error: 'Product not found' });
    }
    logger.error(`Error updating product: ${error.message}`, { id: req.params.id, stack: error.stack });
    res.status(500).json({ error: 'Failed to update product' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    console.log(`[PRODUCTS ROUTE] DELETE /:id request received for ID: ${req.params.id}`);
    console.debug(`[PRODUCTS ROUTE] Deleting product from DB with ID: ${req.params.id}`);
    await prisma.product.delete({ where: { id: req.params.id } });
    logger.info(`Product deleted: ${req.params.id}`);
    res.json({ success: true });
  } catch (error) {
    if (error.code === 'P2025') {
      console.warn(`[PRODUCTS ROUTE] Delete failed: Product ID ${req.params.id} not found`);
      return res.status(404).json({ error: 'Product not found' });
    }
    logger.error(`Error deleting product: ${error.message}`, { id: req.params.id, stack: error.stack });
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

router.post('/:id/check', checkLimiter, async (req, res) => {
  try {
    console.log(`[PRODUCTS ROUTE] POST /:id/check request received for ID: ${req.params.id}`);
    console.debug(`[PRODUCTS ROUTE] Fetching product and user details for ID: ${req.params.id}`);
    const product = await prisma.product.findUnique({
      where: { id: req.params.id },
      include: { user: true },
    });

    if (!product) {
      console.warn(`[PRODUCTS ROUTE] Manual check failed: Product ID ${req.params.id} not found`);
      return res.status(404).json({ error: 'Product not found' });
    }

    // Run check asynchronously
    console.log(`[PRODUCTS ROUTE] Launching background price check for product ${product.id}`);
    checkProduct(product, product.user).catch((err) =>
      logger.error(`Manual check error: ${err.message}`, { id: product.id, stack: err.stack })
    );

    res.json({ success: true, message: 'Price check initiated' });
  } catch (error) {
    logger.error(`Error initiating check: ${error.message}`, { id: req.params.id, stack: error.stack });
    res.status(500).json({ error: 'Failed to initiate check' });
  }
});

router.get('/:id/history', async (req, res) => {
  try {
    const { limit = 100 } = req.query;
    console.log(`[PRODUCTS ROUTE] GET /:id/history request received for ID: ${req.params.id}`, { limit });
    console.debug(`[PRODUCTS ROUTE] Fetching price checks history from DB for ID: ${req.params.id}`);
    const history = await prisma.priceCheck.findMany({
      where: { productId: req.params.id, success: true },
      orderBy: { checkedAt: 'asc' },
      take: parseInt(limit),
      select: { price: true, checkedAt: true },
    });
    console.log(`[PRODUCTS ROUTE] Fetched ${history.length} price checks from history for ID: ${req.params.id}`);
    res.json(history);
  } catch (error) {
    logger.error(`Error fetching history: ${error.message}`, { id: req.params.id, stack: error.stack });
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

module.exports = router;

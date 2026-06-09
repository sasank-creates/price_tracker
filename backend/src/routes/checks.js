const express = require('express');
const { PrismaClient } = require('@prisma/client');
const logger = require('../utils/logger');

const router = express.Router();
const prisma = new PrismaClient();

/**
 * POST /api/unsubscribe/:token - Unsubscribe from notifications
 */
router.post('/:token', async (req, res) => {
  try {
    console.log(`[UNSUBSCRIBE ROUTE] POST /:token request received with token: ${req.params.token}`);
    console.debug(`[UNSUBSCRIBE ROUTE] Querying user by unsubscribeToken in DB`);
    const user = await prisma.user.findUnique({
      where: { unsubscribeToken: req.params.token },
    });

    if (!user) {
      console.warn(`[UNSUBSCRIBE ROUTE] Invalid unsubscribeToken received: ${req.params.token}`);
      return res.status(404).json({ error: 'Invalid unsubscribe token' });
    }

    console.debug(`[UNSUBSCRIBE ROUTE] Found user: ${user.email}. Updating subscription status to unsubscribed.`);
    await prisma.user.update({
      where: { id: user.id },
      data: { isSubscribed: false },
    });

    logger.info(`User unsubscribed: ${user.email}`);
    res.json({ success: true, message: 'You have been unsubscribed from price alerts.' });
  } catch (error) {
    logger.error(`Unsubscribe error: ${error.message}`, { token: req.params.token, stack: error.stack });
    res.status(500).json({ error: 'Failed to unsubscribe' });
  }
});

/**
 * GET /api/unsubscribe/:token - Unsubscribe page (GET for email links)
 */
router.get('/:token', async (req, res) => {
  try {
    console.log(`[UNSUBSCRIBE ROUTE] GET /:token request received with token: ${req.params.token}`);
    console.debug(`[UNSUBSCRIBE ROUTE] Querying user by unsubscribeToken in DB`);
    const user = await prisma.user.findUnique({
      where: { unsubscribeToken: req.params.token },
    });

    if (!user) {
      console.warn(`[UNSUBSCRIBE ROUTE] Invalid unsubscribeToken received: ${req.params.token}`);
      return res.status(404).send('Invalid unsubscribe link.');
    }

    console.debug(`[UNSUBSCRIBE ROUTE] Found user: ${user.email}. Updating subscription status to unsubscribed.`);
    await prisma.user.update({
      where: { id: user.id },
      data: { isSubscribed: false },
    });

    logger.info(`User unsubscribed via GET: ${user.email}`);
    res.send(`
      <html><body style="display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;background:#f0f2f5;">
      <div style="text-align:center;background:#fff;padding:40px;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.08);">
      <h2>✅ Unsubscribed</h2><p>You will no longer receive price alerts.</p>
      </div></body></html>
    `);
  } catch (error) {
    logger.error(`Unsubscribe GET error: ${error.message}`, { token: req.params.token, stack: error.stack });
    res.status(500).send('Something went wrong.');
  }
});

module.exports = router;

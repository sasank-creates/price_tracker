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
    const user = await prisma.user.findUnique({
      where: { unsubscribeToken: req.params.token },
    });

    if (!user) return res.status(404).json({ error: 'Invalid unsubscribe token' });

    await prisma.user.update({
      where: { id: user.id },
      data: { isSubscribed: false },
    });

    logger.info(`User unsubscribed: ${user.email}`);
    res.json({ success: true, message: 'You have been unsubscribed from price alerts.' });
  } catch (error) {
    logger.error(`Unsubscribe error: ${error.message}`);
    res.status(500).json({ error: 'Failed to unsubscribe' });
  }
});

/**
 * GET /api/unsubscribe/:token - Unsubscribe page (GET for email links)
 */
router.get('/:token', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { unsubscribeToken: req.params.token },
    });

    if (!user) return res.status(404).send('Invalid unsubscribe link.');

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
    logger.error(`Unsubscribe GET error: ${error.message}`);
    res.status(500).send('Something went wrong.');
  }
});

module.exports = router;

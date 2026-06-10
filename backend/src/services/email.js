const { Resend } = require('resend');
const logger = require('../utils/logger');

let resendClient = null;

// ─────────────────────────────────────────────────────────────────────────────
// Provider selection
//
// Set EMAIL_PROVIDER in your environment:
//   EMAIL_PROVIDER=resend   → uses Resend API (recommended for cloud/Render)
//   EMAIL_PROVIDER=smtp     → falls back to nodemailer (local dev only)
//
// If EMAIL_PROVIDER is not set, Resend is tried first (RESEND_API_KEY must be set).
// ─────────────────────────────────────────────────────────────────────────────

function getResendClient() {
  if (!resendClient) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      logger.error(
        '[EMAIL] RESEND_API_KEY is not set. ' +
        'Go to https://resend.com → API Keys → Create API Key, ' +
        'then add RESEND_API_KEY to your Render Environment Variables.'
      );
      return null;
    }
    resendClient = new Resend(apiKey);
  }
  return resendClient;
}

/**
 * Verify the Resend connection at startup.
 * Call this from index.js so misconfiguration is visible immediately in logs.
 */
async function verifyTransporter() {
  const client = getResendClient();
  if (!client) {
    logger.error('[EMAIL] Cannot verify — Resend client not initialized (missing RESEND_API_KEY).');
    return false;
  }
  try {
    // Resend doesn't have a dedicated verify endpoint, but listing domains confirms auth
    const { error } = await client.domains.list();
    if (error) {
      logger.error(`[EMAIL] Resend API key validation failed: ${error.message}`);
      return false;
    }
    logger.info('[EMAIL] Resend API key verified successfully');
    return true;
  } catch (err) {
    logger.error(`[EMAIL] Resend verification error: ${err.message}`);
    return false;
  }
}

/**
 * Send a price drop alert email via Resend.
 *
 * Required env vars:
 *   RESEND_API_KEY   — from resend.com/api-keys
 *   EMAIL_FROM       — must be a verified domain address on Resend
 *                      e.g. "Price Tracker <alerts@yourdomain.com>"
 *                      OR use Resend's built-in test domain:
 *                      "Price Tracker <onboarding@resend.dev>"  (sends only to owner email)
 *   APP_URL          — your frontend URL, used for unsubscribe links
 *                      e.g. https://price-tracker.vercel.app
 */
async function sendPriceAlert({ to, productName, productUrl, currentPrice, expectedPrice, unsubscribeToken }) {
  console.log(
    `[EMAIL] sendPriceAlert: to="${to}", product="${productName}", ` +
    `currentPrice=₹${currentPrice}, expectedPrice=₹${expectedPrice}`
  );

  const client = getResendClient();
  if (!client) {
    return { success: false, error: 'Resend client not initialized — check RESEND_API_KEY' };
  }

  // APP_URL is the dedicated backend env var. Falls back to NEXT_PUBLIC_APP_URL for compat.
  const appUrl = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  const unsubscribeUrl = `${appUrl}/api/unsubscribe/${unsubscribeToken}`;
  const checkedTime = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  const savings = (expectedPrice - currentPrice).toLocaleString('en-IN');

  // EMAIL_FROM must be verified on Resend. Default to Resend's sandbox domain for testing.
  const from = process.env.EMAIL_FROM || 'Price Tracker <onboarding@resend.dev>';

  const html = buildEmailHtml({ productName, productUrl, currentPrice, expectedPrice, checkedTime, unsubscribeUrl, savings });

  try {
    console.debug(`[EMAIL] Dispatching via Resend API to "${to}"...`);
    const { data, error } = await client.emails.send({
      from,
      to: [to],
      subject: `🎯 Price Drop: ${productName || 'Your product'} is now ₹${currentPrice.toLocaleString('en-IN')}!`,
      html,
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    });

    if (error) {
      logger.error(`[EMAIL] Resend API error sending to ${to}: ${error.message}`);
      return { success: false, error: error.message };
    }

    logger.info(`[EMAIL] Price alert sent to ${to}`, { messageId: data.id });
    return { success: true, messageId: data.id };
  } catch (err) {
    logger.error(`[EMAIL] Unexpected error sending to ${to}: ${err.message}`, { stack: err.stack });
    return { success: false, error: err.message };
  }
}

function buildEmailHtml({ productName, productUrl, currentPrice, expectedPrice, checkedTime, unsubscribeUrl, savings }) {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Tahoma,sans-serif;background:#f0f2f5;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f5;padding:24px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">
<tr><td style="background:linear-gradient(135deg,#6366f1,#8b5cf6,#a855f7);padding:32px 40px;text-align:center;">
<h1 style="color:#fff;margin:0;font-size:28px;">🎯 Price Drop Alert!</h1>
<p style="color:rgba(255,255,255,.85);margin:8px 0 0;font-size:15px;">Your target price has been reached</p>
</td></tr>
<tr><td style="padding:32px 40px;">
<h2 style="color:#1e293b;margin:0 0 20px;font-size:20px;">${productName || 'Your tracked product'}</h2>
<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
<tr>
<td width="48%" style="background:#f0fdf4;border-radius:12px;padding:20px;text-align:center;">
<p style="color:#16a34a;margin:0 0 4px;font-size:12px;font-weight:600;text-transform:uppercase;">Current Price</p>
<p style="color:#15803d;margin:0;font-size:28px;font-weight:700;">&#8377;${currentPrice.toLocaleString('en-IN')}</p>
</td>
<td width="4%"></td>
<td width="48%" style="background:#f8fafc;border-radius:12px;padding:20px;text-align:center;">
<p style="color:#64748b;margin:0 0 4px;font-size:12px;font-weight:600;text-transform:uppercase;">Your Target</p>
<p style="color:#475569;margin:0;font-size:28px;font-weight:700;">&#8377;${expectedPrice.toLocaleString('en-IN')}</p>
</td>
</tr></table>
<table width="100%"><tr><td align="center" style="padding:8px 0 24px;">
<a href="${productUrl}" target="_blank" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;text-decoration:none;padding:16px 48px;border-radius:12px;font-size:16px;font-weight:600;">View Product &#8594;</a>
</td></tr></table>
<table width="100%" style="border-top:1px solid #e2e8f0;padding-top:20px;">
<tr><td style="padding:8px 0;color:#94a3b8;font-size:13px;">Checked at</td><td style="padding:8px 0;color:#475569;font-size:13px;text-align:right;">${checkedTime}</td></tr>
<tr><td style="padding:8px 0;color:#94a3b8;font-size:13px;">Savings</td><td style="padding:8px 0;color:#16a34a;font-size:13px;font-weight:600;text-align:right;">&#8377;${savings} below target</td></tr>
</table></td></tr>
<tr><td style="background:#f8fafc;padding:20px 40px;text-align:center;border-top:1px solid #e2e8f0;">
<p style="color:#94a3b8;margin:0 0 8px;font-size:12px;">You're receiving this because you set a price alert.</p>
<a href="${unsubscribeUrl}" style="color:#6366f1;font-size:12px;text-decoration:underline;">Unsubscribe from alerts</a>
</td></tr></table></td></tr></table></body></html>`;
}

module.exports = { sendPriceAlert, verifyTransporter };

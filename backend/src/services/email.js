const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

let transporter = null;

/**
 * Build and return the nodemailer transporter.
 *
 * KEY DEPLOYMENT FIX:
 * Most cloud platforms (Render, Railway, Fly.io, etc.) BLOCK outbound SMTP
 * connections on ports 587 and 465 to fight spam. This is why email works
 * locally (residential ISPs allow SMTP) but silently fails in production.
 *
 * RECOMMENDED: Switch to a transactional email API (Resend, SendGrid, Mailgun).
 * They use HTTPS (port 443) which is never blocked.
 *
 * If you still want to use Gmail SMTP, set SMTP_PORT=465 in Render's env vars
 * (port 465 is more often open than 587 on cloud providers) and ensure
 * EMAIL_PROVIDER=smtp is set.
 */
function getTransporter() {
  if (!transporter) {
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;

    if (!smtpUser || !smtpPass) {
      logger.error(
        '[EMAIL] SMTP_USER or SMTP_PASS is not set in environment variables. ' +
        'Emails will NOT be sent. Set these in Render > Environment.'
      );
    }

    const port = parseInt(process.env.SMTP_PORT || '587');
    // port 465 = implicit TLS (secure:true), anything else = STARTTLS (secure:false)
    const secure = port === 465;

    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port,
      secure,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
      // Increase timeouts for cloud environments with higher latency
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 30000,
    });
  }
  return transporter;
}

/**
 * Verify the SMTP connection at startup.
 * Call this from index.js so you get a clear log message if email is broken
 * rather than discovering it silently when the first alert should be sent.
 */
async function verifyTransporter() {
  try {
    const transport = getTransporter();
    await transport.verify();
    logger.info('[EMAIL] SMTP connection verified successfully');
    return true;
  } catch (error) {
    logger.error(
      `[EMAIL] SMTP connection FAILED: ${error.message}. ` +
      'Emails will not be sent. On Render, port 587/465 may be blocked — ' +
      'consider switching to Resend (https://resend.com) or SendGrid which use HTTPS.',
      { stack: error.stack }
    );
    // Don't crash the server — price tracking still works without email
    return false;
  }
}

async function sendPriceAlert({ to, productName, productUrl, currentPrice, expectedPrice, unsubscribeToken }) {
  console.log(
    `[EMAIL SERVICE] sendPriceAlert starting: to="${to}", product="${productName}", ` +
    `currentPrice=₹${currentPrice}, expectedPrice=₹${expectedPrice}`
  );

  const transport = getTransporter();

  // FIX: Use APP_URL (backend env var) not NEXT_PUBLIC_APP_URL (frontend var).
  // NEXT_PUBLIC_APP_URL may not be set in the backend's Render environment,
  // causing unsubscribe links to point to localhost:3000 in production emails.
  const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const unsubscribeUrl = `${appUrl}/api/unsubscribe/${unsubscribeToken}`;
  const checkedTime = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  const savings = (expectedPrice - currentPrice).toLocaleString('en-IN');

  console.debug(`[EMAIL SERVICE] Building email HTML for "${productName}" (savings: ₹${savings})`);
  const htmlContent = buildEmailHtml({ productName, productUrl, currentPrice, expectedPrice, checkedTime, unsubscribeUrl, savings });

  // FIX: EMAIL_FROM must use the authenticated SMTP_USER address as fallback.
  // If EMAIL_FROM is not set and defaults to noreply@pricetracker.app,
  // Gmail rejects the send with "550 5.7.0: not authorized to send as this address".
  const fromAddress = process.env.EMAIL_FROM || `"Price Tracker" <${process.env.SMTP_USER}>`;

  try {
    console.debug(`[EMAIL SERVICE] Dispatching email through SMTP to "${to}"`);
    const info = await transport.sendMail({
      from: fromAddress,
      to,
      subject: `🎯 Price Drop: ${productName || 'Your product'} is now ₹${currentPrice.toLocaleString('en-IN')}!`,
      html: htmlContent,
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    });
    logger.info(`[EMAIL SERVICE] Price alert email successfully sent to ${to}`, { messageId: info.messageId });
    return { success: true, messageId: info.messageId };
  } catch (error) {
    logger.error(`[EMAIL SERVICE] Failed to send email to ${to}: ${error.message}`, { stack: error.stack });
    return { success: false, error: error.message };
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
<p style="color:#15803d;margin:0;font-size:28px;font-weight:700;">₹${currentPrice.toLocaleString('en-IN')}</p>
</td>
<td width="4%"></td>
<td width="48%" style="background:#f8fafc;border-radius:12px;padding:20px;text-align:center;">
<p style="color:#64748b;margin:0 0 4px;font-size:12px;font-weight:600;text-transform:uppercase;">Your Target</p>
<p style="color:#475569;margin:0;font-size:28px;font-weight:700;">₹${expectedPrice.toLocaleString('en-IN')}</p>
</td>
</tr></table>
<table width="100%"><tr><td align="center" style="padding:8px 0 24px;">
<a href="${productUrl}" target="_blank" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;text-decoration:none;padding:16px 48px;border-radius:12px;font-size:16px;font-weight:600;">View Product →</a>
</td></tr></table>
<table width="100%" style="border-top:1px solid #e2e8f0;padding-top:20px;">
<tr><td style="padding:8px 0;color:#94a3b8;font-size:13px;">Checked at</td><td style="padding:8px 0;color:#475569;font-size:13px;text-align:right;">${checkedTime}</td></tr>
<tr><td style="padding:8px 0;color:#94a3b8;font-size:13px;">Savings</td><td style="padding:8px 0;color:#16a34a;font-size:13px;font-weight:600;text-align:right;">₹${savings} below target</td></tr>
</table></td></tr>
<tr><td style="background:#f8fafc;padding:20px 40px;text-align:center;border-top:1px solid #e2e8f0;">
<p style="color:#94a3b8;margin:0 0 8px;font-size:12px;">You're receiving this because you set a price alert.</p>
<a href="${unsubscribeUrl}" style="color:#6366f1;font-size:12px;text-decoration:underline;">Unsubscribe from alerts</a>
</td></tr></table></td></tr></table></body></html>`;
}

module.exports = { sendPriceAlert, getTransporter, verifyTransporter };

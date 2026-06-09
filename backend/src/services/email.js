const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

let transporter = null;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_PORT === '465',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transporter;
}

async function sendPriceAlert({ to, productName, productUrl, currentPrice, expectedPrice, unsubscribeToken }) {
  console.log(`[EMAIL SERVICE] sendPriceAlert starting: sending to="${to}", product="${productName}", currentPrice=₹${currentPrice}, expectedPrice=₹${expectedPrice}`);
  const transport = getTransporter();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const unsubscribeUrl = `${appUrl}/api/unsubscribe/${unsubscribeToken}`;
  const checkedTime = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  const savings = (expectedPrice - currentPrice).toLocaleString('en-IN');

  console.debug(`[EMAIL SERVICE] Building email HTML for "${productName}" (Savings: ₹${savings}, Unsubscribe: ${unsubscribeUrl})`);
  const htmlContent = buildEmailHtml({ productName, productUrl, currentPrice, expectedPrice, checkedTime, unsubscribeUrl, savings });

  try {
    console.debug(`[EMAIL SERVICE] Dispatching email through SMTP to "${to}"`);
    const info = await transport.sendMail({
      from: process.env.EMAIL_FROM || '"Price Tracker" <noreply@pricetracker.app>',
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

module.exports = { sendPriceAlert, getTransporter };

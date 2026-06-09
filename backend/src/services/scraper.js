const { chromium } = require('playwright');
const cheerio = require('cheerio');
const { PrismaClient } = require('@prisma/client');
const { detectSite, getSelectorsForSite, parsePrice } = require('../utils/selectors');
const { getGeminiFallback } = require('./gemini');
const logger = require('../utils/logger');

const prisma = new PrismaClient();

// Browser instance reuse
let browser = null;

/**
 * Get or create a shared browser instance
 */
async function getBrowser() {
  if (!browser || !browser.isConnected()) {
    logger.info('Launching new browser instance');
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-blink-features=AutomationControlled',
      ],
    });
  }
  return browser;
}

/**
 * Close the shared browser instance
 */
async function closeBrowser() {
  if (browser && browser.isConnected()) {
    await browser.close();
    browser = null;
    logger.info('Browser instance closed');
  }
}

/**
 * Fetch a product page and extract price
 * Strategy:
 * 1. Try cached selector from DB
 * 2. Try known site-specific selectors
 * 3. Try Cheerio lightweight parsing
 * 4. Fallback to Gemini AI
 *
 * @param {string} url - Product URL
 * @param {string} productId - Product ID for logging
 * @returns {Object} { price, name, selector, source }
 */
async function scrapePrice(url, productId) {
  const site = detectSite(url);
  logger.info(`Scraping price for ${url}`, { productId, site });

  let pageHtml = '';
  let productName = null;
  const browserInstance = await getBrowser();
  const context = await browserInstance.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
    locale: 'en-IN',
    extraHTTPHeaders: {
      'Accept-Language': 'en-IN,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    },
  });

  const page = await context.newPage();

  // Remove webdriver fingerprint
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  try {
    // Block unnecessary resources for faster loading
    await page.route('**/*.{png,jpg,jpeg,gif,svg,ico,woff,woff2,ttf,mp4,webp}', (route) =>
      route.abort()
    );
    await page.route('**/analytics**', (route) => route.abort());
    await page.route('**/tracking**', (route) => route.abort());
    await page.route('**/ads**', (route) => route.abort());

    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    });

    // Wait for the page to settle — Amazon loads prices via JS
    await page.waitForTimeout(3000);

    // For Amazon, wait specifically for the price container
    if (site && site.includes('amazon')) {
      try {
        await page.waitForSelector(
          '#corePrice_feature_div, #corePriceDisplay_desktop_feature_div, .a-price, #priceblock_ourprice, #priceblock_dealprice',
          { timeout: 10000 }
        );
      } catch {
        logger.debug('Amazon price selector wait timed out — proceeding anyway', { site });
      }
    }

    pageHtml = await page.content();
    productName = await page.title();

    // Strategy 1: Try cached selector from DB
    if (site) {
      const cachedSelector = await prisma.selectorCache.findUnique({
        where: { sitePattern: site },
      });

      if (cachedSelector) {
        logger.debug(`Trying cached selector: ${cachedSelector.selector}`, { site });
        const price = await trySelector(page, cachedSelector.selector, cachedSelector.attribute);
        if (price !== null) {
          await prisma.selectorCache.update({
            where: { id: cachedSelector.id },
            data: { successCount: { increment: 1 }, lastUsedAt: new Date() },
          });
          logger.info(`Price extracted via cached selector: ${price}`, { site });
          return { price, name: productName, selector: cachedSelector.selector, source: 'cached' };
        } else {
          await prisma.selectorCache.update({
            where: { id: cachedSelector.id },
            data: { failCount: { increment: 1 } },
          });
          logger.warn('Cached selector failed, trying alternatives', { site });
        }
      }
    }

    // Strategy 2: Try known site-specific selectors
    if (site) {
      const knownSelectors = getSelectorsForSite(site);
      for (const { selector, attribute } of knownSelectors) {
        const price = await trySelector(page, selector, attribute);
        if (price !== null) {
          // Cache this successful selector
          await cacheSelector(site, selector, attribute, 'auto');
          logger.info(`Price extracted via known selector: ${price}`, { selector, site });
          return { price, name: productName, selector, source: 'known' };
        }
      }
    }

    // Strategy 3: Try Cheerio lightweight parsing
    const cheerioPrice = tryCheerio(pageHtml, site);
    if (cheerioPrice !== null) {
      logger.info(`Price extracted via Cheerio: ${cheerioPrice}`, { site });
      return { price: cheerioPrice, name: productName, selector: 'cheerio', source: 'cheerio' };
    }

    // Strategy 4: Gemini AI fallback
    logger.info('All selectors failed, falling back to Gemini AI', { site, productId });
    const geminiResult = await getGeminiFallback(pageHtml, url, site);
    if (geminiResult && geminiResult.price !== null) {
      // Cache the Gemini-discovered selector
      if (geminiResult.selector && site) {
        await cacheSelector(site, geminiResult.selector, geminiResult.attribute, 'gemini');
      }
      logger.info(`Price extracted via Gemini: ${geminiResult.price}`, { site });
      return {
        price: geminiResult.price,
        name: productName,
        selector: geminiResult.selector || 'gemini-direct',
        source: 'gemini',
      };
    }

    // All strategies failed
    logger.error('All scraping strategies failed', { url, productId });
    return { price: null, name: productName, selector: null, source: 'failed' };
  } catch (error) {
    logger.error(`Scraping error: ${error.message}`, { url, productId, stack: error.stack });
    return { price: null, name: productName, selector: null, source: 'error', error: error.message };
  } finally {
    await page.close();
    await context.close();
  }
}

/**
 * Try extracting price using a CSS selector on a Playwright page
 */
async function trySelector(page, selector, attribute) {
  try {
    // Get all matching elements (Amazon has multiple .a-offscreen spans)
    const elements = await page.$$(selector);
    if (!elements || elements.length === 0) return null;

    for (const element of elements) {
      let rawText;
      if (attribute === 'textContent' || !attribute) {
        rawText = await element.textContent();
      } else if (attribute === 'content') {
        rawText = await element.getAttribute('content');
      } else {
        rawText = await element.getAttribute(attribute);
      }

      const price = parsePrice(rawText);
      if (price !== null && price > 0) {
        return price;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Try extracting price using Cheerio (lightweight HTML parsing)
 */
function tryCheerio(html, site) {
  try {
    const $ = cheerio.load(html);

    // Generic price patterns
    const priceSelectors = [
      '[itemprop="price"]',
      '[data-price]',
      '.price',
      '#price',
      '.product-price',
      '.offer-price',
    ];

    for (const sel of priceSelectors) {
      const el = $(sel).first();
      if (el.length) {
        const price =
          parsePrice(el.attr('content')) ||
          parsePrice(el.attr('data-price')) ||
          parsePrice(el.text());
        if (price) return price;
      }
    }

    // JSON-LD structured data
    let ldPrice = null;
    $('script[type="application/ld+json"]').each((_, el) => {
      if (ldPrice) return;
      try {
        const data = JSON.parse($(el).html());
        const offers = data.offers || (data['@graph'] && data['@graph'].find((g) => g.offers))?.offers;
        if (offers) {
          const price = parsePrice(String(offers.price || offers.lowPrice));
          if (price) ldPrice = price;
        }
      } catch {
        // ignore JSON parse errors in LD+JSON
      }
    });
    if (ldPrice) return ldPrice;

    return null;
  } catch {
    return null;
  }
}

/**
 * Cache a successful selector in the database
 */
async function cacheSelector(sitePattern, selector, attribute, source) {
  try {
    await prisma.selectorCache.upsert({
      where: { sitePattern },
      update: { selector, attribute, source, successCount: { increment: 1 }, lastUsedAt: new Date() },
      create: { sitePattern, selector, attribute, source },
    });
    logger.debug(`Cached selector for ${sitePattern}: ${selector}`);
  } catch (error) {
    logger.error(`Failed to cache selector: ${error.message}`);
  }
}

module.exports = { scrapePrice, closeBrowser, getBrowser };

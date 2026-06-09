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
  console.log(`[SCRAPER] Starting price scrape for URL: ${url}`, { productId, site });

  let pageHtml = '';
  let productName = null;
  console.debug('[SCRAPER] Getting shared browser instance');
  const browserInstance = await getBrowser();
  console.debug('[SCRAPER] Creating new context and page');
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

  console.debug('[SCRAPER] Injecting anti-bot initialization script');
  // Remove webdriver fingerprint
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  try {
    console.debug('[SCRAPER] Registering resource blockers for efficiency');
    // Block unnecessary resources for faster loading
    await page.route('**/*.{png,jpg,jpeg,gif,svg,ico,woff,woff2,ttf,mp4,webp}', (route) =>
      route.abort()
    );
    await page.route('**/analytics**', (route) => route.abort());
    await page.route('**/tracking**', (route) => route.abort());
    await page.route('**/ads**', (route) => route.abort());

    console.log(`[SCRAPER] Navigating to: ${url}`);
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    });

    console.debug('[SCRAPER] Page loaded. Sleeping 3000ms for JavaScript execution and client render...');
    // Wait for the page to settle — Amazon loads prices via JS
    await page.waitForTimeout(3000);

    // For Amazon, wait specifically for the price container
    if (site && site.includes('amazon')) {
      console.debug('[SCRAPER] Amazon detected, waiting for known price containers to mount in DOM');
      try {
        await page.waitForSelector(
          '#corePrice_feature_div, #corePriceDisplay_desktop_feature_div, .a-price, #priceblock_ourprice, #priceblock_dealprice',
          { timeout: 10000 }
        );
        console.debug('[SCRAPER] Amazon price container found successfully');
      } catch {
        console.debug('[SCRAPER] Amazon price selector wait timed out — proceeding anyway', { site });
      }
    }

    pageHtml = await page.content();
    productName = await page.title();
    console.log(`[SCRAPER] Page title resolved: "${productName}" (HTML size: ${pageHtml.length} bytes)`);

    // Strategy 1: Try cached selector from DB
    if (site) {
      console.debug(`[SCRAPER] [STRATEGY 1] Fetching cached selector for site: ${site}`);
      const cachedSelector = await prisma.selectorCache.findUnique({
        where: { sitePattern: site },
      });

      if (cachedSelector) {
        console.log(`[SCRAPER] [STRATEGY 1] Found cached selector: "${cachedSelector.selector}"`, { site });
        const price = await trySelector(page, cachedSelector.selector, cachedSelector.attribute);
        if (price !== null) {
          console.debug('[SCRAPER] [STRATEGY 1] Incrementing success count for cached selector in DB');
          await prisma.selectorCache.update({
            where: { id: cachedSelector.id },
            data: { successCount: { increment: 1 }, lastUsedAt: new Date() },
          });
          console.log(`[SCRAPER] [STRATEGY 1] SUCCESS - Price extracted via cached selector: ${price}`, { site });
          return { price, name: productName, selector: cachedSelector.selector, source: 'cached' };
        } else {
          console.debug('[SCRAPER] [STRATEGY 1] Incrementing fail count for cached selector in DB');
          await prisma.selectorCache.update({
            where: { id: cachedSelector.id },
            data: { failCount: { increment: 1 } },
          });
          console.warn('[SCRAPER] [STRATEGY 1] FAILED - Cached selector failed, trying alternatives', { site });
        }
      } else {
        console.debug(`[SCRAPER] [STRATEGY 1] No cached selector found for site: ${site}`);
      }
    }

    // Strategy 2: Try known site-specific selectors
    if (site) {
      const knownSelectors = getSelectorsForSite(site);
      console.debug(`[SCRAPER] [STRATEGY 2] Trying ${knownSelectors.length} known selectors for site: ${site}`);
      for (const { selector, attribute } of knownSelectors) {
        const price = await trySelector(page, selector, attribute);
        if (price !== null) {
          console.log(`[SCRAPER] [STRATEGY 2] SUCCESS - Price extracted via known selector: ${price}. Caching successful selector.`);
          // Cache this successful selector
          await cacheSelector(site, selector, attribute, 'auto');
          return { price, name: productName, selector, source: 'known' };
        }
      }
      console.warn(`[SCRAPER] [STRATEGY 2] FAILED - All known selectors failed for site: ${site}`);
    }

    // Strategy 3: Try Cheerio lightweight parsing
    console.debug('[SCRAPER] [STRATEGY 3] Attempting lightweight Cheerio parsing');
    const cheerioPrice = tryCheerio(pageHtml, site);
    if (cheerioPrice !== null) {
      console.log(`[SCRAPER] [STRATEGY 3] SUCCESS - Price extracted via Cheerio: ${cheerioPrice}`, { site });
      return { price: cheerioPrice, name: productName, selector: 'cheerio', source: 'cheerio' };
    }
    console.warn('[SCRAPER] [STRATEGY 3] FAILED - Cheerio parsing failed');

    // Strategy 4: Gemini AI fallback
    console.log('[SCRAPER] [STRATEGY 4] All selectors failed, falling back to Gemini AI', { site, productId });
    const geminiResult = await getGeminiFallback(pageHtml, url, site);
    if (geminiResult && geminiResult.price !== null) {
      // Cache the Gemini-discovered selector
      if (geminiResult.selector && site) {
        console.log(`[SCRAPER] [STRATEGY 4] SUCCESS - Gemini extracted price: ${geminiResult.price} and suggested selector: "${geminiResult.selector}". Caching.`);
        await cacheSelector(site, geminiResult.selector, geminiResult.attribute, 'gemini');
      } else {
        console.log(`[SCRAPER] [STRATEGY 4] SUCCESS - Gemini extracted price: ${geminiResult.price} but no reusable selector provided.`);
      }
      return {
        price: geminiResult.price,
        name: productName,
        selector: geminiResult.selector || 'gemini-direct',
        source: 'gemini',
      };
    }
    console.error('[SCRAPER] [STRATEGY 4] FAILED - Gemini AI fallback failed');

    // All strategies failed
    console.error('[SCRAPER] All scraping strategies failed', { url, productId });
    return { price: null, name: productName, selector: null, source: 'failed' };
  } catch (error) {
    console.error(`[SCRAPER] Scraping error: ${error.message}`, { url, productId, stack: error.stack });
    return { price: null, name: productName, selector: null, source: 'error', error: error.message };
  } finally {
    console.debug('[SCRAPER] Closing page and browser context');
    await page.close();
    await context.close();
  }
}

/**
 * Try extracting price using a CSS selector on a Playwright page
 */
async function trySelector(page, selector, attribute) {
  console.debug(`[SCRAPER] trySelector attempting CSS selector: "${selector}" with attribute: "${attribute || 'textContent'}"`);
  try {
    // Get all matching elements (Amazon has multiple .a-offscreen spans)
    const elements = await page.$$(selector);
    if (!elements || elements.length === 0) {
      console.debug(`[SCRAPER] trySelector: Selector "${selector}" matched 0 elements.`);
      return null;
    }

    console.debug(`[SCRAPER] trySelector: Selector "${selector}" matched ${elements.length} elements.`);
    for (let i = 0; i < elements.length; i++) {
      const element = elements[i];
      let rawText;
      if (attribute === 'textContent' || !attribute) {
        rawText = await element.textContent();
      } else if (attribute === 'content') {
        rawText = await element.getAttribute('content');
      } else {
        rawText = await element.getAttribute(attribute);
      }

      const price = parsePrice(rawText);
      console.debug(`[SCRAPER] trySelector element [${i}]: raw text = "${rawText ? rawText.trim() : ''}", parsed price = ${price}`);
      if (price !== null && price > 0) {
        console.debug(`[SCRAPER] trySelector match found: ${price} using selector "${selector}"`);
        return price;
      }
    }
    console.debug(`[SCRAPER] trySelector: No valid price parsed from elements matching "${selector}"`);
    return null;
  } catch (error) {
    console.error(`[SCRAPER] trySelector exception for "${selector}": ${error.message}`);
    return null;
  }
}

/**
 * Try extracting price using Cheerio (lightweight HTML parsing)
 */
function tryCheerio(html, site) {
  console.debug(`[SCRAPER] tryCheerio attempting lightweight Cheerio parsing for site: ${site}`);
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
        const rawContent = el.attr('content');
        const rawDataPrice = el.attr('data-price');
        const rawText = el.text();
        const price =
          parsePrice(rawContent) ||
          parsePrice(rawDataPrice) ||
          parsePrice(rawText);
        
        console.debug(`[SCRAPER] tryCheerio selector "${sel}" matched element. content="${rawContent}", data-price="${rawDataPrice}", text="${rawText ? rawText.trim() : ''}" -> parsed price: ${price}`);
        if (price) {
          console.debug(`[SCRAPER] tryCheerio matched price ${price} using selector "${sel}"`);
          return price;
        }
      }
    }

    // JSON-LD structured data
    let ldPrice = null;
    const ldElements = $('script[type="application/ld+json"]');
    console.debug(`[SCRAPER] tryCheerio checking ${ldElements.length} JSON-LD blocks`);
    ldElements.each((idx, el) => {
      if (ldPrice) return;
      try {
        const text = $(el).html();
        const data = JSON.parse(text);
        const offers = data.offers || (data['@graph'] && data['@graph'].find((g) => g.offers))?.offers;
        if (offers) {
          const rawPrice = String(offers.price || offers.lowPrice);
          const price = parsePrice(rawPrice);
          console.debug(`[SCRAPER] tryCheerio JSON-LD element [${idx}] found offers price: ${rawPrice} -> parsed: ${price}`);
          if (price) ldPrice = price;
        }
      } catch (jsonErr) {
        console.debug(`[SCRAPER] tryCheerio JSON-LD parse error in block [${idx}]: ${jsonErr.message}`);
      }
    });
    if (ldPrice) return ldPrice;

    console.debug(`[SCRAPER] tryCheerio failed to extract price`);
    return null;
  } catch (error) {
    console.error(`[SCRAPER] tryCheerio exception: ${error.message}`);
    return null;
  }
}

/**
 * Cache a successful selector in the database
 */
async function cacheSelector(sitePattern, selector, attribute, source) {
  try {
    console.debug(`[SCRAPER] Caching successful selector in DB. Site: "${sitePattern}", Selector: "${selector}", Attribute: "${attribute}", Source: "${source}"`);
    await prisma.selectorCache.upsert({
      where: { sitePattern },
      update: { selector, attribute, source, successCount: { increment: 1 }, lastUsedAt: new Date() },
      create: { sitePattern, selector, attribute, source },
    });
    console.debug(`Cached selector for ${sitePattern}: ${selector}`);
  } catch (error) {
    console.error(`Failed to cache selector: ${error.message}`);
  }
}

module.exports = { scrapePrice, closeBrowser, getBrowser };

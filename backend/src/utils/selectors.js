/**
 * Site-specific CSS selectors for price extraction.
 * These are the known selectors for popular e-commerce sites.
 * The scraper tries these first before falling back to Gemini AI.
 */
const SITE_SELECTORS = {
  'amazon.in': [
    // Most reliable: offscreen span contains full price string e.g. "₹359.00"
    { selector: '#corePrice_feature_div .a-offscreen', attribute: 'textContent' },
    { selector: '#corePriceDisplay_desktop_feature_div .a-offscreen', attribute: 'textContent' },
    { selector: '.a-price .a-offscreen', attribute: 'textContent' },
    { selector: '#apex_offerDisplay_desktop .a-offscreen', attribute: 'textContent' },
    { selector: '#corePrice_desktop .a-offscreen', attribute: 'textContent' },
    { selector: '#priceblock_dealprice', attribute: 'textContent' },
    { selector: '#priceblock_ourprice', attribute: 'textContent' },
    { selector: '#priceblock_saleprice', attribute: 'textContent' },
    { selector: '.a-price-whole', attribute: 'textContent' },
    { selector: '#sns-base-price', attribute: 'textContent' },
  ],
  'amazon.com': [
    { selector: '#corePrice_feature_div .a-offscreen', attribute: 'textContent' },
    { selector: '#corePriceDisplay_desktop_feature_div .a-offscreen', attribute: 'textContent' },
    { selector: '.a-price .a-offscreen', attribute: 'textContent' },
    { selector: '#priceblock_dealprice', attribute: 'textContent' },
    { selector: '#priceblock_ourprice', attribute: 'textContent' },
    { selector: '.a-price-whole', attribute: 'textContent' },
  ],
  'flipkart.com': [
    { selector: 'div._30jeq3._16Jk6d', attribute: 'textContent' },
    { selector: 'div._30jeq3', attribute: 'textContent' },
    { selector: 'div._25b18c div._30jeq3', attribute: 'textContent' },
    { selector: '.Nx9bqj.CxhGGd', attribute: 'textContent' },
    { selector: '.Nx9bqj', attribute: 'textContent' },
    { selector: '._16Jk6d', attribute: 'textContent' },
  ],
  'meesho.com': [
    { selector: 'h4[class*="Price"]', attribute: 'textContent' },
    { selector: '[class*="discountPrice"]', attribute: 'textContent' },
  ],
  'myntra.com': [
    { selector: '.pdp-price strong', attribute: 'textContent' },
    { selector: '.pdp-discount-container .pdp-price', attribute: 'textContent' },
  ],
};

/**
 * Detect the site from a URL
 * @param {string} url - Product URL
 * @returns {string|null} Site identifier
 */
function detectSite(url) {
  try {
    const hostname = new URL(url).hostname.replace('www.', '');
    for (const site of Object.keys(SITE_SELECTORS)) {
      if (hostname.includes(site)) {
        return site;
      }
    }
    return hostname;
  } catch {
    return null;
  }
}

/**
 * Get known selectors for a site
 * @param {string} site - Site identifier
 * @returns {Array} Array of selector objects
 */
function getSelectorsForSite(site) {
  return SITE_SELECTORS[site] || [];
}

/**
 * Parse a price string into a numeric value
 * @param {string} priceStr - Raw price string (e.g., "₹1,299.00", "$29.99")
 * @returns {number|null} Parsed price or null
 */
function parsePrice(priceStr) {
  if (!priceStr) return null;
  // Remove currency symbols, commas, spaces
  const cleaned = priceStr.replace(/[₹$€£,\s]/g, '').trim();
  // Extract the first valid number
  const match = cleaned.match(/[\d]+\.?\d*/);
  if (match) {
    const price = parseFloat(match[0]);
    return isNaN(price) ? null : price;
  }
  return null;
}

module.exports = { SITE_SELECTORS, detectSite, getSelectorsForSite, parsePrice };

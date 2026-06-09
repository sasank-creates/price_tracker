const { GoogleGenerativeAI } = require('@google/generative-ai');
const { parsePrice } = require('../utils/selectors');
const logger = require('../utils/logger');

let genAI = null;

/**
 * Initialize the Gemini client
 */
function getClient() {
  if (!genAI) {
    if (!process.env.GEMINI_API_KEY) {
      logger.warn('GEMINI_API_KEY not set, AI fallback disabled');
      return null;
    }
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return genAI;
}

/**
 * Use Gemini AI to identify the price from page HTML
 * This is called only when all CSS-based strategies fail.
 *
 * @param {string} html - Page HTML content
 * @param {string} url - Product URL for context
 * @param {string} site - Site identifier
 * @returns {Object|null} { price, selector, attribute }
 */
async function getGeminiFallback(html, url, site) {
  const client = getClient();
  if (!client) {
    console.warn('[GEMINI SERVICE] Gemini generative client could not be initialized (missing API key?)');
    return null;
  }

  console.log(`[GEMINI SERVICE] getGeminiFallback started for site: ${site}, URL: ${url}`);
  try {
    // Trim HTML to avoid token limits — send only the relevant portion
    const trimmedHtml = trimHtml(html);
    console.debug(`[GEMINI SERVICE] Raw HTML length: ${html.length} chars -> Trimmed to: ${trimmedHtml.length} chars`);

    const model = client.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = `You are a web scraping expert. Analyze this HTML from an e-commerce product page (${url}) and find the current product selling price.

Return ONLY a JSON object with these exact keys:
- "price": the numeric price value (number, no currency symbols)
- "selector": the CSS selector that targets the price element
- "attribute": the attribute or "textContent" to read the price from

Rules:
- Find the CURRENT selling price, not MRP or crossed-out prices
- Return the price as a plain number (e.g., 1299.00 not "₹1,299")
- The selector should be as specific as possible
- If you cannot find the price, return {"price": null, "selector": null, "attribute": null}

HTML snippet:
${trimmedHtml}`;

    console.debug('[GEMINI SERVICE] Sending request to Gemini API (gemini-1.5-flash)...');
    const result = await model.generateContent(prompt);
    const response = result.response.text();
    console.debug(`[GEMINI SERVICE] Gemini API raw response text: "${response.trim()}"`);

    // Extract JSON from the response
    const jsonMatch = response.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) {
      console.warn('[GEMINI SERVICE] FAILED: Gemini response did not contain valid JSON block');
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);
    console.log('[GEMINI SERVICE] Successfully extracted and parsed JSON from Gemini response', { price: parsed.price, selector: parsed.selector, attribute: parsed.attribute });

    if (parsed.price !== null && parsed.price !== undefined) {
      const finalPrice = typeof parsed.price === 'number' ? parsed.price : parsePrice(String(parsed.price));
      console.debug(`[GEMINI SERVICE] Resolved final numeric price: ${finalPrice}`);
      return {
        price: finalPrice,
        selector: parsed.selector || null,
        attribute: parsed.attribute || 'textContent',
      };
    }

    console.warn('[GEMINI SERVICE] Gemini response price field is null or undefined');
    return null;
  } catch (error) {
    console.error(`[GEMINI SERVICE] Gemini fallback error: ${error.message}`, { url, site, stack: error.stack });
    return null;
  }
}

/**
 * Trim HTML to a manageable size for the AI model.
 * Focuses on the product content area, removing scripts, styles, and nav.
 */
function trimHtml(html) {
  // Remove script and style tags
  let cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\s+/g, ' ');

  // Limit to ~15000 characters to stay within token limits
  if (cleaned.length > 15000) {
    // Try to find the price-related section
    const priceAreaIndex = cleaned.search(/price|₹|\$|€|£|cost|offer|deal/i);
    if (priceAreaIndex > 0) {
      const start = Math.max(0, priceAreaIndex - 3000);
      const end = Math.min(cleaned.length, priceAreaIndex + 12000);
      cleaned = cleaned.substring(start, end);
    } else {
      cleaned = cleaned.substring(0, 15000);
    }
  }

  return cleaned;
}

module.exports = { getGeminiFallback };

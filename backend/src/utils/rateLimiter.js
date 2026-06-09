const rateLimit = require('express-rate-limit');

/**
 * General API rate limiter - 100 requests per 15 minutes per IP
 */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests, please try again later.',
  },
});

/**
 * Stricter limiter for check-now endpoints - 10 requests per 15 minutes per IP
 */
const checkLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many check requests, please wait before trying again.',
  },
});

module.exports = { apiLimiter, checkLimiter };

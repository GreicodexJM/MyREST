'use strict';

const cors = require('cors');

/**
 * CORS (Cross-Origin Resource Sharing) Middleware
 * Configures CORS settings based on environment variables
 * 
 * @param {Object} config - Configuration object
 * @param {string} config.corsOrigin - Allowed origins (comma-separated for multiple, '*' for all)
 * @param {string} config.corsMethods - Allowed HTTP methods (default: GET,POST,PUT,PATCH,DELETE,OPTIONS)
 * @param {string} config.corsAllowedHeaders - Allowed headers (default: Content-Type,Authorization,Prefer,Range,Resolution,Accept)
 * @param {string} config.corsExposedHeaders - Exposed headers (default: Content-Range,Location)
 * @param {boolean} config.corsCredentials - Allow credentials (default: false)
 * @param {number} config.corsMaxAge - Preflight cache duration in seconds (default: 3600)
 * @returns {Function} Express middleware function
 */
function createCorsMiddleware(config = {}) {
  // Default CORS configuration
  const corsOptions = {
    origin: parseCorsOrigin(config.corsOrigin),
    methods: config.corsMethods || 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    allowedHeaders: config.corsAllowedHeaders || 'Content-Type,Authorization,Prefer,Range,Resolution,Accept',
    exposedHeaders: config.corsExposedHeaders || 'Content-Range,Location',
    credentials: config.corsCredentials === true || config.corsCredentials === 'true',
    maxAge: parseInt(config.corsMaxAge) || 3600,
    optionsSuccessStatus: 204 // Some legacy browsers (IE11, various SmartTVs) choke on 204
  };

  console.log('CORS Configuration:'.green);
  console.log(`  Origin: ${Array.isArray(corsOptions.origin) ? corsOptions.origin.join(', ') : corsOptions.origin}`.cyan);
  console.log(`  Methods: ${corsOptions.methods}`.cyan);
  console.log(`  Credentials: ${corsOptions.credentials}`.cyan);

  return cors(corsOptions);
}

/**
 * Parse CORS origin configuration
 * Supports: '*', single origin, or comma-separated multiple origins
 * 
 * @param {string} origin - Origin configuration string
 * @returns {string|Array|Function} Parsed origin value
 */
function parseCorsOrigin(origin) {
  // If no origin specified, allow all
  if (!origin) {
    return '*';
  }

  // Allow all origins
  if (origin === '*') {
    return '*';
  }

  // Multiple origins (comma-separated)
  if (origin.includes(',')) {
    return origin.split(',').map(o => o.trim()).filter(o => o.length > 0);
  }

  // Single origin
  return origin;
}

module.exports = createCorsMiddleware;

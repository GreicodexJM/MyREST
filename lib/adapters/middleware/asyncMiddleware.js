'use strict';

/**
 * Async Middleware Wrapper
 * Wraps async route handlers to catch promise rejections
 * and pass them to Express error middleware
 * 
 * Usage:
 *   app.get('/route', asyncMiddleware(async (req, res) => {
 *     const data = await someAsyncOperation();
 *     res.json(data);
 *   }));
 * 
 * @param {Function} fn - Async function to wrap
 * @returns {Function} Express middleware function
 */
function asyncMiddleware(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next))
      .catch((err) => {
        next(err);
      });
  };
}

module.exports = asyncMiddleware;

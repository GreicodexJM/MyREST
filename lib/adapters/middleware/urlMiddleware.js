'use strict';

/**
 * URL Parsing Middleware
 * Extracts table names from URL path and attaches to res.locals for route handlers
 *
 * res.locals is request-scoped. Never store per-request state in app.locals —
 * it is shared across concurrent requests and races.
 *
 * Handles three patterns:
 * 1. Single table routes: /api/tableName[/...] -> sets _tableName
 * 2. Exists routes: /api/tableName/:id/exists -> sets _tableName
 * 3. Relational routes: /api/parentTable/:id/childTable -> sets _parentTable and _childTable
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Express next function
 */
function urlMiddleware(req, res, next) {
  // Extract just the URL path without query string
  const justUrl = req.originalUrl.split('?')[0];
  const pathSplit = justUrl.split('/');

  // Check if this is an API route
  if (pathSplit.length >= 2 && pathSplit[1] === 'api') {

    if (pathSplit.length >= 5 && pathSplit[4] === 'exists') {
      // Exists route: /api/tableName/123/exists
      res.locals._tableName = pathSplit[2];
    } else if (pathSplit.length >= 5) {
      // Relational route: /api/parentTable/123/childTable
      res.locals._parentTable = pathSplit[2];
      res.locals._childTable = pathSplit[4];
    } else if (pathSplit.length >= 3) {
      // Standard route: /api/tableName
      res.locals._tableName = pathSplit[2];
    }
  }

  next();
}

module.exports = urlMiddleware;

'use strict';

/**
 * Route Configuration Service
 * Handles dynamic route registration and configuration
 * 
 * This service provides:
 * - Dynamic route registration based on database schema
 * - Route middleware configuration
 * - RESTful endpoint generation
 * - Route metadata management
 */
class RouteConfigService {
  
  constructor(app, xapi) {
    this.app = app;
    this.xapi = xapi;
    this.routes = [];
  }

  /**
   * Registers all CRUD routes for a table
   * 
   * @param {string} tableName - Table name
   * @param {Object} options - Route options (middleware, prefix, etc.)
   */
  registerTableRoutes(tableName, options = {}) {
    const prefix = options.prefix || '/api';
    const basePath = `${prefix}/${tableName}`;

    // GET collection - list all
    this.registerRoute('GET', basePath, (req, res) => {
      return this.xapi.list(req, res);
    });

    // GET count
    this.registerRoute('GET', `${basePath}/count`, (req, res) => {
      return this.xapi.count(req, res);
    });

    // GET describe (schema)
    this.registerRoute('GET', `${basePath}/describe`, (req, res) => {
      return this.xapi.describeTable(req, res);
    });

    // GET groupby
    this.registerRoute('GET', `${basePath}/groupby`, (req, res) => {
      return this.xapi.groupBy(req, res);
    });

    // GET aggregate
    this.registerRoute('GET', `${basePath}/aggregate`, (req, res) => {
      return this.xapi.aggregate(req, res);
    });

    // POST create
    this.registerRoute('POST', basePath, (req, res) => {
      return this.xapi.create(req, res);
    });

    // POST bulk insert
    this.registerRoute('POST', `${basePath}/bulk`, (req, res) => {
      return this.xapi.bulkInsert(req, res);
    });

    // GET by ID - read single
    this.registerRoute('GET', `${basePath}/:id`, (req, res) => {
      return this.xapi.read(req, res);
    });

    // PATCH by ID - partial update
    this.registerRoute('PATCH', `${basePath}/:id`, (req, res) => {
      return this.xapi.patch(req, res);
    });

    // PUT by ID - full update
    this.registerRoute('PUT', `${basePath}/:id`, (req, res) => {
      return this.xapi.update(req, res);
    });

    // DELETE by ID
    this.registerRoute('DELETE', `${basePath}/:id`, (req, res) => {
      return this.xapi.delete(req, res);
    });

    // GET exists - check if resource exists
    this.registerRoute('GET', `${basePath}/:id/exists`, (req, res) => {
      return this.xapi.exists(req, res);
    });
  }

  /**
   * Registers relationship routes for a table
   * 
   * @param {string} parentTable - Parent table name
   * @param {string} childTable - Child table name  
   * @param {Object} options - Route options
   */
  registerRelationshipRoutes(parentTable, childTable, options = {}) {
    const prefix = options.prefix || '/api';
    const relationPath = `${prefix}/${parentTable}/:id/${childTable}`;

    this.registerRoute('GET', relationPath, (req, res) => {
      return this.xapi.nestedList(req, res);
    });
  }

  /**
   * Registers stored procedure routes
   * 
   * @param {string} procedureName - Procedure name
   * @param {Object} options - Route options
   */
  registerProcedureRoute(procedureName, options = {}) {
    const prefix = options.prefix || '/api';
    const method = options.method || 'POST';
    const path = `${prefix}/proc/${procedureName}`;

    this.registerRoute(method, path, (req, res) => {
      return this.xapi.callProcedure(req, res);
    });
  }

  /**
   * Registers file upload routes
   * 
   * @param {string} tableName - Table name for uploads
   * @param {Object} options - Route options
   */
  registerFileRoutes(tableName, options = {}) {
    const prefix = options.prefix || '/api';
    const basePath = `${prefix}/${tableName}`;

    // Upload single file
    this.registerRoute('POST', `${basePath}/upload`, (req, res) => {
      return this.xapi.uploadFile(req, res);
    });

    // Upload multiple files
    this.registerRoute('POST', `${basePath}/uploads`, (req, res) => {
      return this.xapi.uploadFiles(req, res);
    });

    // Download file
    this.registerRoute('GET', `${basePath}/download/:id`, (req, res) => {
      return this.xapi.downloadFile(req, res);
    });
  }

  /**
   * Registers a single route with Express
   * 
   * @param {string} method - HTTP method (GET, POST, PUT, DELETE, PATCH)
   * @param {string} path - Route path
   * @param {Function} handler - Route handler function
   * @param {Array} middleware - Optional middleware array
   */
  registerRoute(method, path, handler, middleware = []) {
    const route = {
      method: method.toUpperCase(),
      path,
      handler,
      middleware
    };

    // Apply middleware and handler to Express app
    const expressMethod = method.toLowerCase();
    if (middleware.length > 0) {
      this.app[expressMethod](path, ...middleware, handler);
    } else {
      this.app[expressMethod](path, handler);
    }

    // Track registered route
    this.routes.push(route);
  }

  /**
   * Gets all registered routes
   * 
   * @returns {Array<Object>} Array of route objects
   */
  getRoutes() {
    return this.routes;
  }

  /**
   * Gets routes filtered by criteria
   * 
   * @param {Object} filter - Filter criteria {method, path, pathPattern}
   * @returns {Array<Object>} Filtered routes
   */
  findRoutes(filter = {}) {
    return this.routes.filter(route => {
      if (filter.method && route.method !== filter.method.toUpperCase()) {
        return false;
      }
      if (filter.path && route.path !== filter.path) {
        return false;
      }
      if (filter.pathPattern && !route.path.includes(filter.pathPattern)) {
        return false;
      }
      return true;
    });
  }

  /**
   * Generates route documentation
   * 
   * @returns {Array<Object>} Route documentation
   */
  generateRouteDocs() {
    return this.routes.map(route => ({
      method: route.method,
      path: route.path,
      middlewareCount: route.middleware.length,
      description: this._getRouteDescription(route)
    }));
  }

  /**
   * Gets human-readable description for a route
   * @private
   */
  _getRouteDescription(route) {
    const pathParts = route.path.split('/').filter(p => p);
    const resource = pathParts[1]; // Assuming /api/resource pattern

    if (route.path.includes('/count')) {
      return `Get count of ${resource}`;
    } else if (route.path.includes('/describe')) {
      return `Get schema for ${resource}`;
    } else if (route.path.includes('/groupby')) {
      return `Group by query on ${resource}`;
    } else if (route.path.includes('/aggregate')) {
      return `Aggregate query on ${resource}`;
    } else if (route.path.includes('/bulk')) {
      return `Bulk insert into ${resource}`;
    } else if (route.path.includes('/exists')) {
      return `Check if ${resource} exists`;
    } else if (route.path.includes('/:id')) {
      switch (route.method) {
        case 'GET': return `Get single ${resource} by ID`;
        case 'PUT': return `Update ${resource} by ID`;
        case 'PATCH': return `Partial update ${resource} by ID`;
        case 'DELETE': return `Delete ${resource} by ID`;
      }
    } else {
      switch (route.method) {
        case 'GET': return `List all ${resource}`;
        case 'POST': return `Create new ${resource}`;
      }
    }

    return 'API endpoint';
  }

  /**
   * Clears all registered routes (useful for testing)
   */
  clearRoutes() {
    this.routes = [];
  }

  /**
   * Gets route statistics
   * 
   * @returns {Object} Route statistics
   */
  getRouteStats() {
    const stats = {
      total: this.routes.length,
      byMethod: {},
      byResource: {}
    };

    this.routes.forEach(route => {
      // Count by method
      stats.byMethod[route.method] = (stats.byMethod[route.method] || 0) + 1;

      // Count by resource (extract from path)
      const pathParts = route.path.split('/').filter(p => p);
      if (pathParts.length >= 2) {
        const resource = pathParts[1];
        stats.byResource[resource] = (stats.byResource[resource] || 0) + 1;
      }
    });

    return stats;
  }
}

module.exports = RouteConfigService;

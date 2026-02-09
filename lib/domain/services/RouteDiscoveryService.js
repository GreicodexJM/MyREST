'use strict';

/**
 * Route Discovery Service
 * Handles route generation and discovery based on database schema
 * 
 * This service provides:
 * - Route listing for all tables
 * - Route listing for specific tables
 * - Global routes listing
 * - Route metadata generation
 */
class RouteDiscoveryService {
  
  constructor(metaDb, config) {
    this.metaDb = metaDb;
    this.config = config;
  }

  /**
   * Gets all available routes
   * 
   * @param {string} baseUrl - Base URL for routes (e.g., 'http://localhost:3000/api/')
   * @returns {Array} All routes (table routes + global routes)
   */
  getAllRoutes(baseUrl) {
    const tableRoutes = this.getTableRoutes(baseUrl);
    const globalRoutes = this.getGlobalRoutes(baseUrl);
    
    return tableRoutes.concat(globalRoutes.map(url => ({ resource: 'global', url })));
  }

  /**
   * Gets routes for all tables
   * 
   * @param {string} baseUrl - Base URL for routes
   * @param {boolean} includeMetadata - Include route metadata (type, HTTP method)
   * @returns {Array} Array of table route objects
   */
  getTableRoutes(baseUrl, includeMetadata = false) {
    const schemaRoutes = [];

    for (const tableName in this.metaDb.tables) {
      const tableObj = {
        resource: tableName,
        routes: this._generateTableRoutes(tableName, baseUrl, includeMetadata)
      };

      schemaRoutes.push(tableObj);
    }

    return schemaRoutes;
  }

  /**
   * Gets routes for a specific table
   * 
   * @param {string} tableName - Table name
   * @param {string} baseUrl - Base URL for routes
   * @param {boolean} includeMetadata - Include route metadata
   * @returns {Object|null} Table routes object or null if table not found
   */
  getTableRoutesByName(tableName, baseUrl, includeMetadata = false) {
    if (!(tableName in this.metaDb.tables)) {
      return null;
    }

    return {
      resource: tableName,
      routes: this._generateTableRoutes(tableName, baseUrl, includeMetadata)
    };
  }

  /**
   * Gets global utility routes
   * 
   * @param {string} baseUrl - Base URL for routes
   * @returns {Array<string>} Array of global route URLs
   */
  getGlobalRoutes(baseUrl) {
    const routes = [];

    routes.push(baseUrl + 'tables');

    if (this.config.dynamic) {
      routes.push(baseUrl + 'dynamic');
      routes.push('/upload');
      routes.push('/uploads');
      routes.push('/download');
    }

    return routes;
  }

  /**
   * Gets RPC (stored procedure) routes
   * 
   * @param {string} baseUrl - Base URL for routes
   * @returns {Array<Object>} Array of RPC route objects
   */
  getRpcRoutes(baseUrl) {
    const routes = [];

    for (const routineName in this.metaDb.routines) {
      const routine = this.metaDb.routines[routineName];
      
      routes.push({
        name: routineName,
        type: routine.type,
        url: baseUrl.replace('/api/', '/rpc/') + routineName,
        method: 'POST',
        parameters: routine.params.map(p => ({
          name: p.name,
          type: p.type,
          mode: p.mode
        }))
      });
    }

    return routes;
  }

  /**
   * Generates routes for a specific table
   * 
   * @private
   * @param {string} tableName - Table name
   * @param {string} baseUrl - Base URL
   * @param {boolean} includeMetadata - Include metadata
   * @returns {Array} Array of route objects
   */
  _generateTableRoutes(tableName, baseUrl, includeMetadata) {
    const routes = [];
    const table = this.metaDb.tables[tableName];

    // Standard CRUD routes
    routes.push(this._createRoute('describe', 'get', baseUrl, `${tableName}/describe`, includeMetadata));
    routes.push(this._createRoute('count', 'get', baseUrl, `${tableName}/count`, includeMetadata));
    routes.push(this._createRoute('groupby', 'get', baseUrl, `${tableName}/groupby`, includeMetadata));
    routes.push(this._createRoute('aggregate', 'get', baseUrl, `${tableName}/aggregate`, includeMetadata));
    routes.push(this._createRoute('create', 'post', baseUrl, tableName, includeMetadata));
    routes.push(this._createRoute('list', 'get', baseUrl, tableName, includeMetadata));
    routes.push(this._createRoute('read', 'get', baseUrl, `${tableName}/:id`, includeMetadata));
    routes.push(this._createRoute('update', 'put', baseUrl, `${tableName}/:id`, includeMetadata));
    routes.push(this._createRoute('patch', 'patch', baseUrl, tableName, includeMetadata));
    routes.push(this._createRoute('delete', 'delete', baseUrl, `${tableName}/:id`, includeMetadata));
    routes.push(this._createRoute('delete', 'delete', baseUrl, tableName, includeMetadata));
    routes.push(this._createRoute('exists', 'get', baseUrl, `${tableName}/:id/exists`, includeMetadata));

    // Relational routes (foreign keys)
    for (const fk of table.foreignKeys) {
      routes.push(
        this._createRoute(
          'relational',
          'get',
          baseUrl,
          `${fk.referenced_table_name}/:id/${fk.table_name}`,
          includeMetadata
        )
      );
    }

    return routes;
  }

  /**
   * Creates a route object
   * 
   * @private
   * @param {string} routeType - Route type
   * @param {string} httpMethod - HTTP method
   * @param {string} baseUrl - Base URL
   * @param {string} path - Route path
   * @param {boolean} includeMetadata - Include metadata
   * @returns {Object|string} Route object or URL string
   */
  _createRoute(routeType, httpMethod, baseUrl, path, includeMetadata) {
    const url = baseUrl + path;

    if (includeMetadata) {
      return {
        routeType,
        httpType: httpMethod,
        routeUrl: url
      };
    }

    return url;
  }

  /**
   * Gets route count summary
   * 
   * @returns {Object} Route statistics
   */
  getRouteStats() {
    const tables = Object.keys(this.metaDb.tables).length;
    const routines = Object.keys(this.metaDb.routines).length;
    
    // Each table has 12 base routes + foreign key routes
    let totalTableRoutes = 0;
    for (const tableName in this.metaDb.tables) {
      const table = this.metaDb.tables[tableName];
      totalTableRoutes += 12 + table.foreignKeys.length;
    }

    const globalRoutes = this.getGlobalRoutes('/api/').length;

    return {
      tables,
      routines,
      totalTableRoutes,
      routinesRoutes: routines,
      globalRoutes,
      totalRoutes: totalTableRoutes + routines + globalRoutes
    };
  }

  /**
   * Checks if a route pattern exists
   * 
   * @param {string} tableName - Table name
   * @param {string} routeType - Route type (e.g., 'list', 'read')
   * @returns {boolean} True if route exists
   */
  routeExists(tableName, routeType) {
    if (!(tableName in this.metaDb.tables)) {
      return false;
    }

    const validRouteTypes = [
      'list', 'create', 'read', 'update', 'patch', 'delete',
      'exists', 'count', 'describe', 'groupby', 'aggregate'
    ];

    return validRouteTypes.includes(routeType);
  }

  /**
   * Gets relational routes for a specific table
   * 
   * @param {string} tableName - Table name
   * @param {string} baseUrl - Base URL
   * @returns {Array} Array of relational route objects
   */
  getRelationalRoutes(tableName, baseUrl) {
    if (!(tableName in this.metaDb.tables)) {
      return [];
    }

    const table = this.metaDb.tables[tableName];
    const routes = [];

    for (const fk of table.foreignKeys) {
      routes.push({
        type: 'foreign_key',
        parentTable: fk.referenced_table_name,
        childTable: fk.table_name,
        foreignKey: fk.column_name,
        referencedKey: fk.referenced_column_name,
        url: `${baseUrl}${fk.referenced_table_name}/:id/${fk.table_name}`
      });
    }

    return routes;
  }

  /**
   * Gets route documentation
   * 
   * @param {string} baseUrl - Base URL
   * @returns {Object} Complete route documentation
   */
  getRouteDocumentation(baseUrl) {
    return {
      version: '1.0',
      baseUrl,
      tables: this.getTableRoutes(baseUrl, true),
      rpc: this.getRpcRoutes(baseUrl),
      global: this.getGlobalRoutes(baseUrl),
      stats: this.getRouteStats()
    };
  }
}

module.exports = RouteDiscoveryService;

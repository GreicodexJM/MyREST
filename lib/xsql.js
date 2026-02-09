'use strict';

const mysql = require('mysql2');
const dataHelp = require('./util/data.helper.js');
const whereHelp = require('./util/whereClause.helper.js');
const postgrestHelp = require('./util/postgrestWhereClause.helper.js');
const RlsService = require('./domain/services/RlsService.js');
const QueryBuilderService = require('./domain/services/QueryBuilderService.js');
const DatabaseConnectionManager = require('./domain/repositories/DatabaseConnectionManager.js');
const SchemaRepository = require('./domain/repositories/SchemaRepository.js');
const CONSTANTS = require('./domain/constants.js');
const assert = require('assert')


//define class
class Xsql {

  constructor(sqlConfig, pool) {

    this.sqlConfig = sqlConfig;
    this.pool = pool;
    
    // Initialize Repositories
    this.connectionManager = new DatabaseConnectionManager(pool);
    this.schemaRepository = new SchemaRepository(this.connectionManager, sqlConfig.database);
    
    // Initialize Services (pass connectionManager for consistency)
    this.rlsService = new RlsService(this.connectionManager);
    this.queryBuilder = null; // Will be initialized after schema loads
    
    // Expose metaDb for backward compatibility
    this.metaDb = this.schemaRepository.getMetaDb();

  }

  init(cbk) {
    // Use async/await pattern for cleaner initialization
    this.schemaRepository.loadDatabaseSchema()
      .then(async () => {
        // Re-sync metaDb reference after schema load
        this.metaDb = this.schemaRepository.getMetaDb();
        
        // Initialize QueryBuilder with loaded schema
        this.queryBuilder = new QueryBuilderService(this.metaDb);
        
        // Ensure RLS policies table exists
        await this.rlsService.ensureRlsPoliciesTable();
        
        // Load RLS policies after schema cache
        await this.rlsService.loadRlsPolicies();
        
        cbk(null, null);
      })
      .catch(err => {
        console.error('Initialization failed:', err);
        cbk(err, null);
      });
  }

  // Delegate RLS methods to RlsService for backward compatibility
  getPolicyWhereClause(tableName, operation) {
    return this.rlsService.getPolicyWhereClause(tableName, operation);
  }

  reloadPolicies() {
    return this.rlsService.reloadPolicies();
  }

  // Delegate to DatabaseConnectionManager
  exec(query, params, context) {
    return this.connectionManager.executeQuery(query, params, context);
  }

  // Delegate to QueryBuilderService
  getLimitClause(reqParams) {
    return this.queryBuilder.getLimitClause(reqParams);
  }

  getWhereClause(queryparams, tableName, queryParamsObj, appendToWhere) {

    let whereClauseObj = { query: '', params: [] };
    let hasCondition = false;

    // Existing _where logic
    if (queryparams && queryparams[CONSTANTS.QUERY_PARAMS.WHERE]) {
      let oldWhere = whereHelp.getWhereClause(queryparams[CONSTANTS.QUERY_PARAMS.WHERE]);
      if (oldWhere.err === 0) {
        whereClauseObj.query += oldWhere.query;
        whereClauseObj.params = whereClauseObj.params.concat(oldWhere.params);
        hasCondition = true;
      }
    }

    // New PostgREST logic
    let pgWhere = postgrestHelp.getWhereClause(queryparams);
    if (pgWhere.query.length > 0) {
      if (hasCondition) {
        whereClauseObj.query += ' AND ' + pgWhere.query;
      } else {
        whereClauseObj.query += pgWhere.query;
      }
      whereClauseObj.params = whereClauseObj.params.concat(pgWhere.params);
      hasCondition = true;
    }

    if (hasCondition) {
      queryParamsObj.query = queryParamsObj.query + appendToWhere + whereClauseObj.query;
      queryParamsObj.params = queryParamsObj.params.concat(whereClauseObj.params);
    }

  }

  // Delegate to QueryBuilderService
  getOrderByClause(queryparams, tableName) {
    return this.queryBuilder.getOrderByClause(queryparams, tableName);
  }

  // Delegate to QueryBuilderService
  getColumnsForSelectStmt(tableName, reqQueryParams) {
    return this.queryBuilder.getColumnsForSelectStmt(tableName, reqQueryParams);
  }

  getNestedQuery(parentTable, relationName, selectStr, hint) {
    return this.queryBuilder.getNestedQuery(parentTable, relationName, selectStr, hint);
  }

  resolveSelectColumnsForJson(tableName, selectStr) {
    return this.queryBuilder.resolveSelectColumnsForJson(tableName, selectStr);
  }

  resolveSelectColumns(tableName, selectStr) {
    return this.queryBuilder.resolveSelectColumns(tableName, selectStr);
  }

  // Delegate to QueryBuilderService
  getPrimaryKeyWhereClause(tableName, pksValues) {
    return this.queryBuilder.getPrimaryKeyWhereClause(tableName, pksValues);
  }

  getForeignKeyWhereClause(parentTable, parentId, childTable) {
    return this.queryBuilder.getForeignKeyWhereClause(parentTable, parentId, childTable);
  }

  prepareRoute(internal, httpType, apiPrefix, urlRoute, routeType) {

    let route = {};
    route['httpType'] = httpType;
    route['routeUrl'] = apiPrefix + urlRoute;
    if (internal) {
      route['routeType'] = routeType;
    }
    return route;

  }


  getSchemaRoutes(internal, apiPrefix) {

    let schemaRoutes = [];

    for (var tableName in this.metaDb.tables) {

      let routes = []
      let tableObj = {}

      let table = this.metaDb.tables[tableName];

      tableObj['resource'] = tableName;

      routes.push(this.prepareRoute(internal, 'get', apiPrefix, tableName + '/describe', 'describe'))
      routes.push(this.prepareRoute(internal, 'get', apiPrefix, tableName + '/count', 'count'))
      routes.push(this.prepareRoute(internal, 'get', apiPrefix, tableName + '/groupby', 'groupby'))
      routes.push(this.prepareRoute(internal, 'get', apiPrefix, tableName + '/aggregate', 'aggregate'))
      routes.push(this.prepareRoute(internal, 'post', apiPrefix, tableName, 'create'))
      routes.push(this.prepareRoute(internal, 'get', apiPrefix, tableName, 'list'))
      routes.push(this.prepareRoute(internal, 'get', apiPrefix, tableName + '/:id', 'read'))
      routes.push(this.prepareRoute(internal, 'put', apiPrefix, tableName + '/:id', 'update'))
      routes.push(this.prepareRoute(internal, 'patch', apiPrefix, tableName, 'patch'))
      routes.push(this.prepareRoute(internal, 'delete', apiPrefix, tableName + '/:id', 'delete'))
      routes.push(this.prepareRoute(internal, 'delete', apiPrefix, tableName, 'delete'))
      routes.push(this.prepareRoute(internal, 'get', apiPrefix, tableName + '/:id/exists', 'exists'))

      for (var j = 0; j < table['foreignKeys'].length; ++j) {
        let fk = table['foreignKeys'][j]
        routes.push(this.prepareRoute(internal, 'get', apiPrefix, fk['referenced_table_name'] + '/:id/' + fk['table_name'], 'relational'))
      }

      tableObj['routes'] = routes;

      schemaRoutes.push(tableObj);

    }

    return schemaRoutes;

  }

  globalRoutesPrint(apiPrefix) {

    let r = []

    r.push(apiPrefix + "tables")

    if (this.sqlConfig.dynamic) {
      r.push(apiPrefix + "dynamic")
      r.push("/upload")
      r.push("/uploads")
      r.push("/download")
    }


    return r;

  }

}


//expose class
module.exports = Xsql;

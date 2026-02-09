'use strict';

const CONSTANTS = require('../constants.js');
const dataHelper = require('../../util/data.helper.js');

/**
 * CRUD Service
 * Handles business logic for Create, Read, Update, Delete operations
 * 
 * This service separates business logic from HTTP concerns, making it:
 * - Easier to test (no HTTP dependencies)
 * - Reusable in different contexts (CLI, GraphQL, etc.)
 * - Maintainable (single responsibility)
 */
class CrudService {
  
  constructor(xsql, rlsService) {
    this.xsql = xsql;
    this.rlsService = rlsService;
  }

  /**
   * Creates one or more records
   * 
   * @param {string} tableName - Table name
   * @param {Object|Array} data - Record(s) to create
   * @param {Object} options - Creation options
   * @param {boolean} options.isUpsert - Use ON DUPLICATE KEY UPDATE
   * @param {boolean} options.isIgnore - Use INSERT IGNORE
   * @param {boolean} options.returnRepresentation - Return created records
   * @param {Object} context - JWT context for RLS
   * @returns {Promise<Object>} Creation result
   */
  async create(tableName, data, options = {}, context = null) {
    const { isUpsert, isIgnore, returnRepresentation } = options;
    let results;

    if (Array.isArray(data)) {
      // Bulk Insert
      if (data.length === 0) {
        return { results: [], insertId: null, affectedRows: 0 };
      }

      // Serialize JSON columns for each object
      let processedBody = data.map(obj => 
        dataHelper.serializeJsonColumns(tableName, obj, this.xsql.metaDb)
      );

      // Build query
      let keys = Object.keys(processedBody[0]);
      let values = processedBody.map(obj => keys.map(key => obj[key]));
      let query = 'INSERT ' + (isIgnore ? 'IGNORE ' : '') + 'INTO ?? (??) VALUES ?';
      let params = [tableName, keys, values];

      if (isUpsert && !isIgnore) {
        query += ' ON DUPLICATE KEY UPDATE ';
        let updateParts = keys.map(key => 
          `${this.xsql.pool.escapeId(key)} = VALUES(${this.xsql.pool.escapeId(key)})`
        );
        query += updateParts.join(', ');
      }

      results = await this.xsql.exec(query, params, context);

      // Fetch inserted rows if requested
      if (returnRepresentation && results.insertId) {
        let pks = this.xsql.metaDb.tables[tableName].primaryKeys;
        if (pks.length === 1) {
          let pkCol = pks[0].column_name;
          let firstId = results.insertId;
          let count = results.affectedRows;
          let lastId = firstId + count - 1;

          let selectQuery = 'SELECT * FROM ?? WHERE ?? BETWEEN ? AND ?';
          let selectParams = [tableName, pkCol, firstId, lastId];
          let rows = await this.xsql.exec(selectQuery, selectParams, context);
          return { results: rows, insertId: results.insertId, affectedRows: results.affectedRows };
        }
      }
    } else {
      // Single Insert
      let processedBody = dataHelper.serializeJsonColumns(tableName, data, this.xsql.metaDb);
      
      let query = 'INSERT ' + (isIgnore ? 'IGNORE ' : '') + 'INTO ?? SET ?';
      let params = [tableName, processedBody];

      if (isUpsert && !isIgnore) {
        query += ' ON DUPLICATE KEY UPDATE ';
        let keys = Object.keys(processedBody);
        let updateParts = keys.map(key => 
          `${this.xsql.pool.escapeId(key)} = VALUES(${this.xsql.pool.escapeId(key)})`
        );
        query += updateParts.join(', ');
      }

      results = await this.xsql.exec(query, params, context);

      // Fetch inserted row if requested
      if (returnRepresentation) {
        let pks = this.xsql.metaDb.tables[tableName].primaryKeys;
        let whereParts = [];
        let selectParams = [tableName];
        let canFetch = true;

        if (pks.length === 1 && results.insertId) {
          whereParts.push('?? = ?');
          selectParams.push(pks[0].column_name, results.insertId);
        } else {
          // Composite key
          for (let pk of pks) {
            let val = data[pk.column_name];
            if (val === undefined) {
              canFetch = false;
              break;
            }
            whereParts.push('?? = ?');
            selectParams.push(pk.column_name, val);
          }
        }

        if (canFetch && whereParts.length > 0) {
          let selectQuery = 'SELECT * FROM ?? WHERE ' + whereParts.join(' AND ');
          let rows = await this.xsql.exec(selectQuery, selectParams, context);
          return { results: rows, insertId: results.insertId, affectedRows: results.affectedRows };
        }
      }
    }

    return { results, insertId: results.insertId, affectedRows: results.affectedRows };
  }

  /**
   * Lists records with filtering, sorting, and pagination
   * 
   * @param {string} tableName - Table name
   * @param {Object} queryParams - Query parameters
   * @param {Object} options - List options
   * @param {boolean} options.countTotal - Include total count
   * @param {Object} context - JWT context for RLS
   * @returns {Promise<Object>} List result with rows and metadata
   */
  async list(tableName, queryParams, options = {}, context = null) {
    let queryParamsObj = { query: '', params: [] };
    
    // Get columns
    let cols = this.xsql.getColumnsForSelectStmt(tableName, queryParams);

    // Build WHERE clause
    let whereObj = { query: '', params: [] };
    this.xsql.getWhereClause(queryParams, tableName, whereObj, ' where ');

    // Apply RLS
    this.rlsService.injectPolicyIntoWhere(whereObj, tableName, CONSTANTS.RLS_OPERATIONS.SELECT, ' where ');

    // Count if requested
    let totalCount = null;
    if (options.countTotal) {
      let countQuery = 'SELECT count(1) as no_of_rows FROM ?? ' + whereObj.query;
      let countParams = [tableName].concat(whereObj.params);
      let countResults = await this.xsql.exec(countQuery, countParams, context);
      totalCount = countResults[0].no_of_rows;
    }

    // Build main query
    queryParamsObj.query = 'select ' + cols + ' from ?? ' + whereObj.query;
    queryParamsObj.params.push(tableName);
    queryParamsObj.params = queryParamsObj.params.concat(whereObj.params);

    // Add ORDER BY
    queryParamsObj.query += this.xsql.getOrderByClause(queryParams, tableName);

    // Add LIMIT
    let limitClause = this.xsql.getLimitClause(queryParams);
    queryParamsObj.query += ' limit ?,? ';
    queryParamsObj.params.push(limitClause[0], limitClause[1]);

    let rows = await this.xsql.exec(queryParamsObj.query, queryParamsObj.params, context);

    return {
      rows,
      offset: limitClause[0],
      limit: limitClause[1],
      totalCount
    };
  }

  /**
   * Reads a single record by primary key
   * 
   * @param {string} tableName - Table name
   * @param {Array} pkValues - Primary key values
   * @param {Object} context - JWT context for RLS
   * @returns {Promise<Array>} Single record (as array for consistency)
   */
  async read(tableName, pkValues, context = null) {
    let query = 'select * from ?? where ';
    let params = [tableName];

    let clause = this.xsql.getPrimaryKeyWhereClause(tableName, pkValues);
    if (!clause) {
      throw new Error(CONSTANTS.ERROR_MESSAGES.COMPOSITE_KEY_MISSING);
    }

    // Apply RLS
    let rlsClause = this.rlsService.getPolicyWhereClause(tableName, CONSTANTS.RLS_OPERATIONS.SELECT);
    if (rlsClause) {
      query += `(${rlsClause}) AND ${clause}`;
    } else {
      query += clause;
    }
    
    query += ' LIMIT 1';

    return await this.xsql.exec(query, params, context);
  }

  /**
   * Checks if a record exists
   * 
   * @param {string} tableName - Table name
   * @param {Array} pkValues - Primary key values
   * @param {Object} context - JWT context for RLS
   * @returns {Promise<Array>} Result array
   */
  async exists(tableName, pkValues, context = null) {
    let query = 'select * from ?? where ';
    let params = [tableName];

    let clause = this.xsql.getPrimaryKeyWhereClause(tableName, pkValues);
    if (!clause) {
      throw new Error(CONSTANTS.ERROR_MESSAGES.COMPOSITE_KEY_MISSING);
    }

    query += clause + ' LIMIT 1';

    return await this.xsql.exec(query, params, context);
  }

  /**
   * Updates a record by primary key (PUT - full replacement)
   * 
   * @param {string} tableName - Table name
   * @param {Array} pkValues - Primary key values
   * @param {Object} data - Update data
   * @param {Object} context - JWT context for RLS
   * @returns {Promise<Object>} Update result
   */
  async update(tableName, pkValues, data, context = null) {
    let processedBody = dataHelper.serializeJsonColumns(tableName, data, this.xsql.metaDb);
    let keys = Object.keys(processedBody);

    // Build SET clause
    let query = 'UPDATE ?? SET ';
    let updateKeys = keys.map(key => `${key} = ?`).join(', ');
    query += updateKeys + ' where ';

    let clause = this.xsql.getPrimaryKeyWhereClause(tableName, pkValues);
    if (!clause) {
      throw new Error(CONSTANTS.ERROR_MESSAGES.COMPOSITE_KEY_MISSING);
    }

    // Apply RLS
    let rlsClause = this.rlsService.getPolicyWhereClause(tableName, CONSTANTS.RLS_OPERATIONS.UPDATE);
    if (rlsClause) {
      query += `(${rlsClause}) AND ${clause}`;
    } else {
      query += clause;
    }

    let params = [tableName].concat(Object.values(processedBody));

    return await this.xsql.exec(query, params, context);
  }

  /**
   * Patches records (PATCH - partial update with filters)
   * 
   * @param {string} tableName - Table name
   * @param {Object} queryParams - Filter parameters
   * @param {Object} data - Update data
   * @param {Object} options - Patch options
   * @param {boolean} options.returnRepresentation - Return updated records
   * @param {Object} context - JWT context for RLS
   * @returns {Promise<Object>} Patch result
   */
  async patch(tableName, queryParams, data, options = {}, context = null) {
    let processedBody = dataHelper.serializeJsonColumns(tableName, data, this.xsql.metaDb);
    let keys = Object.keys(processedBody);

    if (keys.length === 0) {
      return { results: [], affectedRows: 0 };
    }

    // Build WHERE clause
    let whereObj = { query: '', params: [] };
    this.xsql.getWhereClause(queryParams, tableName, whereObj, ' where ');

    // Apply RLS
    this.rlsService.injectPolicyIntoWhere(whereObj, tableName, CONSTANTS.RLS_OPERATIONS.UPDATE, ' where ');

    let rowsToUpdate = [];
    if (options.returnRepresentation) {
      let pks = this.xsql.metaDb.tables[tableName].primaryKeys;
      if (pks && pks.length > 0) {
        let pkCols = pks.map(pk => pk.column_name);
        let selectQuery = 'SELECT ' + pkCols.map(c => '??').join(',') + ' FROM ?? ' + whereObj.query;
        let selectParams = pkCols.concat([tableName]).concat(whereObj.params);
        rowsToUpdate = await this.xsql.exec(selectQuery, selectParams, context);
      }
    }

    // Build UPDATE query
    let query = 'UPDATE ?? SET ';
    let params = [tableName];
    let updateKeys = keys.map(key => {
      params.push(processedBody[key]);
      return `${key} = ?`;
    }).join(', ');
    
    query += updateKeys + whereObj.query;
    params = params.concat(whereObj.params);

    let results = await this.xsql.exec(query, params, context);

    // Fetch updated rows if requested
    if (options.returnRepresentation && rowsToUpdate.length > 0) {
      let pks = this.xsql.metaDb.tables[tableName].primaryKeys;
      let pkCols = pks.map(pk => pk.column_name);

      let pkWhere = '';
      let fetchParams = [tableName];

      if (pkCols.length === 1) {
        let ids = rowsToUpdate.map(r => r[pkCols[0]]);
        pkWhere = '?? IN (?)';
        fetchParams.push(pkCols[0], ids);
      } else {
        // Composite key
        let ids = rowsToUpdate.map(r => pkCols.map(c => r[c]));
        pkWhere = '(' + pkCols.map(c => '??').join(',') + ') IN (?)';
        pkCols.forEach(c => fetchParams.push(c));
        fetchParams.push(ids);
      }

      let fetchQuery = 'SELECT * FROM ?? WHERE ' + pkWhere;
      let finalRows = await this.xsql.exec(fetchQuery, fetchParams, context);
      return { results: finalRows, affectedRows: results.affectedRows };
    }

    return { results, affectedRows: results.affectedRows };
  }

  /**
   * Deletes record(s)
   * 
   * @param {string} tableName - Table name
   * @param {Array|null} pkValues - Primary key values (null for bulk delete)
   * @param {Object} queryParams - Filter parameters (for bulk delete)
   * @param {Object} options - Delete options
   * @param {boolean} options.returnRepresentation - Return deleted records
   * @param {Object} context - JWT context for RLS
   * @returns {Promise<Object>} Delete result
   */
  async delete(tableName, pkValues, queryParams, options = {}, context = null) {
    let query = 'DELETE FROM ?? ';
    let params = [tableName];
    let whereClause = '';
    let whereParams = [];

    if (pkValues) {
      // Single record delete
      let clause = this.xsql.getPrimaryKeyWhereClause(tableName, pkValues);
      if (!clause) {
        throw new Error(CONSTANTS.ERROR_MESSAGES.COMPOSITE_KEY_MISSING);
      }
      
      let rlsClause = this.rlsService.getPolicyWhereClause(tableName, CONSTANTS.RLS_OPERATIONS.DELETE);
      if (rlsClause) {
        whereClause = `WHERE (${rlsClause}) AND ${clause}`;
      } else {
        whereClause = 'WHERE ' + clause;
      }
    } else {
      // Bulk delete
      let whereObj = { query: '', params: [] };
      this.xsql.getWhereClause(queryParams, tableName, whereObj, ' WHERE ');

      this.rlsService.injectPolicyIntoWhere(whereObj, tableName, CONSTANTS.RLS_OPERATIONS.DELETE, ' WHERE ');

      if (whereObj.query) {
        whereClause = whereObj.query;
        whereParams = whereObj.params;
      }
    }

    let rowsToDelete = [];
    if (options.returnRepresentation) {
      let selectQuery = 'SELECT * FROM ?? ' + whereClause;
      let selectParams = [tableName].concat(whereParams);
      rowsToDelete = await this.xsql.exec(selectQuery, selectParams, context);
    }

    query += whereClause;
    params = params.concat(whereParams);

    let results = await this.xsql.exec(query, params, context);

    return {
      results: options.returnRepresentation ? rowsToDelete : results,
      affectedRows: results.affectedRows
    };
  }

  /**
   * Counts records in a table
   * 
   * @param {string} tableName - Table name
   * @param {Object} context - JWT context for RLS
   * @returns {Promise<Array>} Count result
   */
  async count(tableName, context = null) {
    let query = 'select count(1) as no_of_rows from ??';
    let params = [tableName];

    return await this.xsql.exec(query, params, context);
  }

  /**
   * Lists nested/related records (foreign key relationship)
   * 
   * @param {string} parentTable - Parent table name
   * @param {string} parentId - Parent ID value
   * @param {string} childTable - Child table name
   * @param {Object} queryParams - Query parameters
   * @param {Object} options - List options
   * @param {boolean} options.countTotal - Include total count
   * @param {Object} context - JWT context for RLS
   * @returns {Promise<Object>} Nested list result
   */
  async nestedList(parentTable, parentId, childTable, queryParams, options = {}, context = null) {
    let queryParamsObj = { query: '', params: [] };
    let cols = this.xsql.getColumnsForSelectStmt(childTable, queryParams);

    // Build WHERE with FK
    let whereObj = { query: '', params: [] };
    let fkWhere = this.xsql.getForeignKeyWhereClause(parentTable, parentId, childTable);
    
    if (!fkWhere) {
      throw new Error(CONSTANTS.ERROR_MESSAGES.COMPOSITE_KEY_MISSING);
    }
    
    whereObj.query = fkWhere;
    this.xsql.getWhereClause(queryParams, childTable, whereObj, ' and ');

    // Apply RLS
    let rlsClause = this.rlsService.getPolicyWhereClause(childTable, CONSTANTS.RLS_OPERATIONS.SELECT);
    if (rlsClause) {
      whereObj.query += ` and (${rlsClause})`;
    }

    // Count if requested
    let totalCount = null;
    if (options.countTotal) {
      let countQuery = 'SELECT count(1) as no_of_rows FROM ?? WHERE ' + whereObj.query;
      let countParams = [childTable].concat(whereObj.params);
      let countResults = await this.xsql.exec(countQuery, countParams, context);
      totalCount = countResults[0].no_of_rows;
    }

    // Build main query
    queryParamsObj.query = 'select ' + cols + ' from ?? where ' + whereObj.query;
    queryParamsObj.params.push(childTable);
    queryParamsObj.params = queryParamsObj.params.concat(whereObj.params);

    queryParamsObj.query += this.xsql.getOrderByClause(queryParams, childTable);

    let limitClause = this.xsql.getLimitClause(queryParams);
    queryParamsObj.query += ' limit ?,? ';
    queryParamsObj.params.push(limitClause[0], limitClause[1]);

    let rows = await this.xsql.exec(queryParamsObj.query, queryParamsObj.params, context);

    return {
      rows,
      offset: limitClause[0],
      limit: limitClause[1],
      totalCount
    };
  }
}

module.exports = CrudService;

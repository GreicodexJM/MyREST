'use strict';

const mysql = require('mysql2');
const CONSTANTS = require('../constants.js');
const dataHelp = require('../../util/data.helper.js');
const selectParser = require('../../util/selectParser.helper.js');
const assert = require('assert');

/**
 * Query Builder Service
 * Centralizes SQL query construction logic
 * 
 * This service handles all SQL query building operations including:
 * - SELECT column resolution
 * - WHERE clause construction
 * - ORDER BY clause generation
 * - LIMIT/OFFSET handling
 * - Primary and Foreign Key WHERE clauses
 */
class QueryBuilderService {
  
  constructor(metaDb) {
    this.metaDb = metaDb;
  }

  /**
   * Builds LIMIT clause with offset
   * 
   * @param {Object} reqParams - Request query parameters
   * @returns {Array} [offset, limit]
   */
  getLimitClause(reqParams) {
    // Set defaults
    reqParams._index = CONSTANTS.PAGINATION.DEFAULT_OFFSET;
    reqParams._len = CONSTANTS.PAGINATION.DEFAULT_PAGE_SIZE;

    // Handle limit parameter
    if (CONSTANTS.QUERY_PARAMS.LIMIT in reqParams) {
      reqParams._len = parseInt(reqParams[CONSTANTS.QUERY_PARAMS.LIMIT]);
    } else if (CONSTANTS.QUERY_PARAMS.SIZE in reqParams && 
               parseInt(reqParams[CONSTANTS.QUERY_PARAMS.SIZE]) < CONSTANTS.PAGINATION.MAX_PAGE_SIZE) {
      reqParams._len = parseInt(reqParams[CONSTANTS.QUERY_PARAMS.SIZE]);
    }

    // Handle offset parameter
    if (CONSTANTS.QUERY_PARAMS.OFFSET in reqParams) {
      reqParams._index = parseInt(reqParams[CONSTANTS.QUERY_PARAMS.OFFSET]);
    } else if (CONSTANTS.QUERY_PARAMS.PAGE in reqParams && 
               parseInt(reqParams[CONSTANTS.QUERY_PARAMS.PAGE]) > 0) {
      reqParams._index = (parseInt(reqParams[CONSTANTS.QUERY_PARAMS.PAGE]) - 1) * reqParams._len + 1;
    }

    return [reqParams._index, reqParams._len];
  }

  /**
   * Builds ORDER BY clause
   * 
   * @param {Object} queryparams - Request query parameters
   * @param {string} tableName - Table name (for validation)
   * @returns {string} ORDER BY clause
   */
  getOrderByClause(queryparams, tableName) {
    let orderBy = '';

    // Handle _sort parameter (MyREST format)
    if (queryparams[CONSTANTS.QUERY_PARAMS.SORT]) {
      orderBy += ' ORDER BY ';
      let orderByCols = queryparams[CONSTANTS.QUERY_PARAMS.SORT].split(',');

      for (let i = 0; i < orderByCols.length; ++i) {
        if (i) {
          orderBy += ', ';
        }
        
        // Check for descending order (prefix with -)
        if (orderByCols[i][0] === '-') {
          let len = orderByCols[i].length;
          orderBy += orderByCols[i].substring(1, len) + ' DESC';
        } else {
          orderBy += orderByCols[i] + ' ASC';
        }
      }
    } 
    // Handle order parameter (PostgREST format)
    else if (queryparams[CONSTANTS.QUERY_PARAMS.ORDER]) {
      orderBy += ' ORDER BY ';
      let orderByCols = queryparams[CONSTANTS.QUERY_PARAMS.ORDER].split(',');

      for (let i = 0; i < orderByCols.length; ++i) {
        if (i) {
          orderBy += ', ';
        }

        let parts = orderByCols[i].split('.');
        let col = parts[0];
        let dir = parts.length > 1 ? parts[1].toUpperCase() : 'ASC';

        if (dir === 'DESC') {
          orderBy += col + ' DESC';
        } else {
          orderBy += col + ' ASC';
        }
      }
    }

    return orderBy;
  }

  /**
   * Gets columns for SELECT statement
   * 
   * @param {string} tableName - Table name
   * @param {Object} reqQueryParams - Request query parameters
   * @returns {string} Column list for SELECT
   */
  getColumnsForSelectStmt(tableName, reqQueryParams) {
    let selectStr = '';
    
    if (CONSTANTS.QUERY_PARAMS.FIELDS in reqQueryParams) {
      selectStr = reqQueryParams[CONSTANTS.QUERY_PARAMS.FIELDS];
    } else if (CONSTANTS.QUERY_PARAMS.SELECT in reqQueryParams) {
      selectStr = reqQueryParams[CONSTANTS.QUERY_PARAMS.SELECT];
    } else {
      selectStr = '*';
    }
    
    return this.resolveSelectColumns(tableName, selectStr);
  }

  /**
   * Resolves SELECT columns with support for relations and exclusions
   * 
   * @param {string} tableName - Table name
   * @param {string} selectStr - Select string to parse
   * @returns {string} Resolved column list
   */
  resolveSelectColumns(tableName, selectStr) {
    const parsed = selectParser.parseSelect(selectStr);
    let excluded = new Set();
    let hasStar = false;
    let explicitItems = [];
    
    for (const item of parsed) {
      if (item.type === 'column') {
        if (item.name === '*') {
          hasStar = true;
        } else if (item.name.startsWith('-')) {
          excluded.add(item.name.substring(1));
        } else {
          explicitItems.push(item);
        }
      } else {
        explicitItems.push(item);
      }
    }

    let finalCols = [];
    let tableCols = this.metaDb.tables[tableName].columns;

    // Handle wildcard selection
    if (hasStar || explicitItems.length === 0) {
      for (let col of tableCols) {
        if (!excluded.has(col.column_name)) {
          finalCols.push(`${tableName}.${col.column_name}`);
        }
      }
    }
    
    // Handle explicit columns and relations
    if (explicitItems.length > 0) {
      for (const item of explicitItems) {
        if (item.type === 'column') {
          let found = tableCols.find(c => c.column_name === item.name);
          if (found) {
            finalCols.push(`${tableName}.${item.name}`);
          }
        } else if (item.type === 'relation') {
          finalCols.push(this.getNestedQuery(tableName, item.name, item.columns, item.hint) + ` AS ${item.name}`);
        }
      }
    }
    
    if (finalCols.length === 0) return ' * ';
    
    return finalCols.join(', ');
  }

  /**
   * Resolves SELECT columns for JSON embedding
   * 
   * @param {string} tableName - Table name
   * @param {string} selectStr - Select string to parse
   * @returns {string} Columns formatted for JSON_OBJECT
   */
  resolveSelectColumnsForJson(tableName, selectStr) {
    const parsed = selectParser.parseSelect(selectStr);
    let cols = [];
    let excluded = new Set();
    let hasStar = false;
    let explicitItems = [];

    for (const item of parsed) {
      if (item.type === 'column') {
        if (item.name === '*') {
          hasStar = true;
        } else if (item.name.startsWith('-')) {
          excluded.add(item.name.substring(1));
        } else {
          explicitItems.push(item);
        }
      } else {
        explicitItems.push(item);
      }
    }

    let tableCols = this.metaDb.tables[tableName].columns;

    if (hasStar || explicitItems.length === 0) {
      for (let col of tableCols) {
        if (!excluded.has(col.column_name)) {
          cols.push(`'${col.column_name}'`);
          cols.push(`${tableName}.${col.column_name}`);
        }
      }
    }
    
    if (explicitItems.length > 0) {
      for (const item of explicitItems) {
        if (item.type === 'column') {
          let found = tableCols.find(c => c.column_name === item.name);
          if (found) {
            cols.push(`'${item.name}'`);
            cols.push(`${tableName}.${item.name}`);
          }
        } else if (item.type === 'relation') {
          cols.push(`'${item.name}'`);
          cols.push(this.getNestedQuery(tableName, item.name, item.columns, item.hint));
        }
      }
    }
    
    return cols.join(', ');
  }

  /**
   * Builds nested query for embedded resources (PostgREST-style)
   * 
   * @param {string} parentTable - Parent table name
   * @param {string} relationName - Relation name (typically child table)
   * @param {string} selectStr - Select string for nested resource
   * @param {string} hint - Optional FK hint (column name)
   * @returns {string} Nested SELECT query
   */
  getNestedQuery(parentTable, relationName, selectStr, hint) {
    let childTable = relationName; 
    let fks = this.metaDb.tables[childTable] && this.metaDb.tables[childTable].foreignKeys;
    let parentFks = this.metaDb.tables[parentTable] && this.metaDb.tables[parentTable].foreignKeys;
    
    let fkToParent = null;
    let fkToChild = null;
    
    if (hint) {
      // Explicit hint: check if it's FK in parent pointing to child
      if (parentFks) {
        fkToChild = parentFks.find(fk => fk.column_name === hint && fk.referenced_table_name === childTable);
      }
      // If not found, check if it's FK in child pointing to parent
      if (!fkToChild && fks) {
        fkToParent = fks.find(fk => fk.column_name === hint && fk.referenced_table_name === parentTable);
      }
    } else {
      // Auto-detect relationship
      fkToParent = fks ? dataHelp.findObjectInArrayByKey('referenced_table_name', parentTable, fks) : null;
      fkToChild = parentFks ? dataHelp.findObjectInArrayByKey('referenced_table_name', childTable, parentFks) : null;
    }

    if (fkToParent) {
      // 1:N Relationship (child has FK to parent)
      let cols = this.resolveSelectColumnsForJson(childTable, selectStr);
      let pk = this.metaDb.tables[parentTable].primaryKeys[0].column_name;
      return `(SELECT CAST(COALESCE(JSON_ARRAYAGG(JSON_OBJECT(${cols})), '[]') AS JSON) FROM ${childTable} WHERE ${childTable}.${fkToParent.column_name} = ${parentTable}.${pk})`;
    } else if (fkToChild) {
      // N:1 Relationship (parent has FK to child)
      let cols = this.resolveSelectColumnsForJson(childTable, selectStr);
      let pk = this.metaDb.tables[childTable].primaryKeys[0].column_name;
      return `(SELECT JSON_OBJECT(${cols}) FROM ${childTable} WHERE ${childTable}.${pk} = ${parentTable}.${fkToChild.column_name})`;
    }
    
    return `NULL`;
  }

  /**
   * Builds WHERE clause for primary key lookup
   * 
   * @param {string} tableName - Table name
   * @param {Array} pksValues - Array of primary key values
   * @returns {string|null} WHERE clause or null if invalid
   */
  getPrimaryKeyWhereClause(tableName, pksValues) {
    let whereClause = '';
    let pks = [];

    if (tableName in this.metaDb.tables) {
      pks = this.metaDb.tables[tableName].primaryKeys;
    } else {
      return null;
    }

    // Validate PK count matches
    if (pksValues.length !== pks.length) {
      return null;
    }

    // Build WHERE clause
    for (let i = 0; i < pks.length; ++i) {
      let type = this.getColumnType(pks[i]);
      let whereCol = pks[i]['column_name'];
      let whereValue;

      if (type === 'string') {
        whereValue = mysql.escape(pksValues[i]);
      } else if (type === 'int') {
        whereValue = parseInt(pksValues[i]);
      } else if (type === 'float') {
        whereValue = parseFloat(pksValues[i]);
      } else if (type === 'date') {
        whereValue = Date(pksValues[i]);
      } else {
        console.error(pks[i]);
        assert(false, 'Unhandled type of primary key');
      }

      if (i) {
        whereClause += ' and ';
      }

      whereClause += whereCol + ' = ' + whereValue;
    }

    return whereClause;
  }

  /**
   * Builds WHERE clause for foreign key relationship
   * 
   * @param {string} parentTable - Parent table name
   * @param {string} parentId - Parent ID value
   * @param {string} childTable - Child table name
   * @returns {string} WHERE clause
   */
  getForeignKeyWhereClause(parentTable, parentId, childTable) {
    let whereValue = '';
    let fks = this.metaDb.tables[childTable].foreignKeys;
    let fk = dataHelp.findObjectInArrayByKey('referenced_table_name', parentTable, fks);
    let whereCol = fk['column_name'];
    let colType = this.getColumnType(fk);

    if (colType === 'string') {
      whereValue = mysql.escape(parentId);
    } else if (colType === 'int') {
      whereValue = mysql.escape(parseInt(parentId));
    } else if (colType === 'float') {
      whereValue = mysql.escape(parseFloat(parentId));
    } else if (colType === 'date') {
      whereValue = mysql.escape(Date(parentId));
    } else {
      assert(false, 'Unhandled column type in foreign key handling');
    }

    return whereCol + ' = ' + whereValue;
  }

  /**
   * Gets column type for a column definition
   * 
   * @param {Object} column - Column definition object
   * @returns {string} Column type (string, int, float, date)
   */
  getColumnType(column) {
    if (this.isDataType(column['data_type'], CONSTANTS.DATA_TYPES.STRING)) {
      return CONSTANTS.COLUMN_TYPES.STRING;
    } else if (this.isDataType(column['data_type'], CONSTANTS.DATA_TYPES.INTEGER)) {
      return CONSTANTS.COLUMN_TYPES.INT;
    } else if (this.isDataType(column['data_type'], CONSTANTS.DATA_TYPES.FLOAT)) {
      return CONSTANTS.COLUMN_TYPES.FLOAT;
    } else if (this.isDataType(column['data_type'], CONSTANTS.DATA_TYPES.DATE)) {
      return CONSTANTS.COLUMN_TYPES.DATE;
    } else {
      return CONSTANTS.COLUMN_TYPES.STRING;
    }
  }

  /**
   * Checks if column type matches a list of types
   * 
   * @param {string} colType - Column type to check
   * @param {Array} typesArr - Array of type strings
   * @returns {boolean} True if type matches
   */
  isDataType(colType, typesArr) {
    for (let i = 0; i < typesArr.length; ++i) {
      if (colType.indexOf(typesArr[i]) !== -1) {
        return true;
      }
    }
    return false;
  }
}

module.exports = QueryBuilderService;

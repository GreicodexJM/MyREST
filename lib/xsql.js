'use strict';

const mysql = require('mysql2');
const dataHelp = require('./util/data.helper.js');
const whereHelp = require('./util/whereClause.helper.js');
const postgrestHelp = require('./util/postgrestWhereClause.helper.js');
const selectParser = require('./util/selectParser.helper.js');
const assert = require('assert')


//define class
class Xsql {

  constructor(sqlConfig, pool) {

    //define this variables
    this.sqlConfig = {}
    this.pool = {}
    this.metaDb = {};
    this.metaDb.tables = {};
    this.metaDb.routines = {};
    this.rlsPolicies = {}; // Cache for RLS policies

    this.sqlConfig = sqlConfig;
    this.pool = pool;

  }

  init(cbk) {
    this.dbCacheInitAsync(async (err, results) => {
      if (err) return cbk(err, results);
      
      // Ensure RLS policies table exists
      await this.ensureRlsPoliciesTable();
      
      // Load RLS policies after schema cache
      await this.loadRlsPolicies();
      cbk(err, results);
    })
  }


  dbCacheInitAsync(cbk) {

    let self = this;

    self.pool.query(dataHelp.getSchemaQuery(), [this.sqlConfig.database], (err, results) => {

      if (err) {
        console.log('Cache init failed during database reading')
        console.log(err, results)
        cbk(err, results)
      } else {

        self.iterateToCacheTables(results)
        self.iterateToCacheTablePks(results)
        self.iterateToCacheTableColumns(results)
        self.iterateToCacheTableFks(results)

        self.pool.query(dataHelp.getProceduresQuery(), [this.sqlConfig.database], (err, procResults) => {
          if (err) {
            console.log('Failed to read procedures', err);
          } else {
            self.iterateToCacheProcedures(procResults);
          }

          // osx mysql server has limitations related to open_tables
          self.pool.query('FLUSH TABLES', [], (err, results) => {
            cbk(null, null)
          })
        });
      }
    })

  }

  iterateToCacheProcedures(procResults) {
    for (let i = 0; i < procResults.length; ++i) {
      let row = procResults[i];
      let routineName = row['ROUTINE_NAME'];
      
      if (!(routineName in this.metaDb.routines)) {
        this.metaDb.routines[routineName] = {
          type: row['ROUTINE_TYPE'],
          params: []
        };
      }
      
      if (row['PARAMETER_NAME']) {
        this.metaDb.routines[routineName].params.push({
          name: row['PARAMETER_NAME'],
          type: row['DATA_TYPE'],
          mode: row['PARAMETER_MODE'],
          pos: row['ORDINAL_POSITION']
        });
      }
    }
  }

  async ensureRlsPoliciesTable() {
    try {
      await new Promise((resolve, reject) => {
        this.pool.query(
          `CREATE TABLE IF NOT EXISTS _rls_policies (
            id INT PRIMARY KEY AUTO_INCREMENT,
            table_name VARCHAR(255) NOT NULL,
            policy_name VARCHAR(255) NOT NULL,
            operation ENUM('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'ALL') DEFAULT 'ALL',
            using_expression TEXT NOT NULL,
            check_expression TEXT DEFAULT NULL,
            enabled BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY unique_policy (table_name, policy_name),
            INDEX idx_table_operation (table_name, operation, enabled)
          )`,
          [],
          (err, result) => {
            if (err) reject(err);
            else resolve(result);
          }
        );
      });
      console.log('RLS policies table ready');
    } catch (err) {
      console.error('Failed to create _rls_policies table:', err.message);
      // Don't block startup - gracefully degrade
    }
  }

  async loadRlsPolicies() {
    try {
      let results = await new Promise((resolve, reject) => {
        this.pool.query(
          'SELECT * FROM _rls_policies WHERE enabled = TRUE',
          [],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
          }
        );
      });
      
      // Group by table and operation
      this.rlsPolicies = {};
      for (let policy of results) {
        let tableName = policy.table_name;
        if (!this.rlsPolicies[tableName]) {
          this.rlsPolicies[tableName] = {
            SELECT: [],
            INSERT: [],
            UPDATE: [],
            DELETE: []
          };
        }
        
        if (policy.operation === 'ALL') {
          this.rlsPolicies[tableName].SELECT.push(policy);
          this.rlsPolicies[tableName].INSERT.push(policy);
          this.rlsPolicies[tableName].UPDATE.push(policy);
          this.rlsPolicies[tableName].DELETE.push(policy);
        } else {
          this.rlsPolicies[tableName][policy.operation].push(policy);
        }
      }
      
      console.log('RLS policies loaded:', Object.keys(this.rlsPolicies).length, 'tables with policies');
    } catch (err) {
      console.error('Failed to load RLS policies:', err.message);
    }
  }

  getPolicyWhereClause(tableName, operation) {
    if (!this.rlsPolicies[tableName]) return null;
    
    let policies = this.rlsPolicies[tableName][operation] || [];
    if (policies.length === 0) return null;
    
    // Combine all policies with AND (all must pass)
    let conditions = policies.map(p => `(${p.using_expression})`);
    return conditions.join(' AND ');
  }

  reloadPolicies() {
    return this.loadRlsPolicies();
  }


  iterateToCacheTables(schemaResults) {

    for (let i = 0; i < schemaResults.length; ++i) {

      let schemaRow = schemaResults[i];

      let tableName = schemaRow['table_name'] || schemaRow['TABLE_NAME'];

      if (!(tableName in this.metaDb.tables)) {
        this.metaDb.tables[tableName] = {}
        this.metaDb.tables[tableName]['primaryKeys'] = []
        this.metaDb.tables[tableName]['foreignKeys'] = []
        this.metaDb.tables[tableName]['columns'] = []
        this.metaDb.tables[tableName]['indicies'] = []
      }
    }
  }

  iterateToCacheTableColumns(schemaResults) {

    for (let i = 0; i < schemaResults.length; ++i) {
      let schemaRow = schemaResults[i];
      let tableName = schemaRow['table_name'] || schemaRow['TABLE_NAME'];
      let col = {};
      col['column_name'] = schemaRow['column_name'] || schemaRow['COLUMN_NAME'];
      col['ordinal_position'] = schemaRow['ordinal_position'] || schemaRow['ORDINAL_POSITION'];
      col['column_key'] = schemaRow['column_key'] || schemaRow['COLUMN_KEY'];
      col['data_type'] = schemaRow['data_type'] || schemaRow['DATA_TYPE'];
      col['column_type'] = schemaRow['column_type'] || schemaRow['COLUMN_TYPE'];
      col['is_nullable'] = schemaRow['is_nullable'] || schemaRow['IS_NULLABLE'];
      col['column_default'] = schemaRow['column_default'] || schemaRow['COLUMN_DEFAULT'];

      dataHelp.findOrInsertObjectArrayByKey(col, 'column_name', this.metaDb.tables[tableName]['columns'])

    }
  }

  iterateToCacheTablePks(schemaResults) {

    for (let i = 0; i < schemaResults.length; ++i) {
      let schemaRow = schemaResults[i];
      let tableName = schemaRow['table_name'] || schemaRow['TABLE_NAME'];

      if (schemaRow['column_key'] === 'PRI' || schemaRow['COLUMN_KEY'] === 'PRI') {

        let pk = {};
        pk['column_name'] = schemaRow['column_name'] || schemaRow['COLUMN_NAME'];
        pk['ordinal_position'] = schemaRow['ordinal_position'] || schemaRow['ORDINAL_POSITION'];
        pk['column_key'] = schemaRow['column_key'] || schemaRow['COLUMN_KEY'];
        pk['data_type'] = schemaRow['data_type'] || schemaRow['DATA_TYPE'];
        pk['column_type'] = schemaRow['column_type'] || schemaRow['COLUMN_TYPE'];

        dataHelp.findOrInsertObjectArrayByKey(pk, 'column_name', this.metaDb.tables[tableName]['primaryKeys'])

      }
    }
  }

  iterateToCacheTableFks(schemaResults) {

    for (let i = 0; i < schemaResults.length; ++i) {

      let schemaRow = schemaResults[i];
      let tableName = schemaRow['table_name'] || schemaRow['TABLE_NAME'];

      if (schemaRow['referenced_table_name'] || schemaRow['REFERENCED_TABLE_NAME']) {

        let fk = {};

        fk['column_name'] = schemaRow['column_name'] || schemaRow['COLUMN_NAME'];
        fk['table_name'] = schemaRow['table_name'] || schemaRow['TABLE_NAME'];
        fk['referenced_table_name'] = schemaRow['referenced_table_name'] || schemaRow['REFERENCED_TABLE_NAME'];
        fk['referenced_column_name'] = schemaRow['referenced_column_name'] || schemaRow['REFERENCED_COLUMN_NAME'];
        fk['data_type'] = schemaRow['data_type'] || schemaRow['DATA_TYPE'];
        fk['column_type'] = schemaRow['column_type'] || schemaRow['COLUMN_TYPE'];

        dataHelp.findOrInsertObjectArrayByKey(fk, 'column_name', this.metaDb.tables[tableName]['foreignKeys'])

        //console.log(fk['referenced_table_name'],fk['referenced_column_name'],tableName, schemaRow['column_name'], this.metaDb.tables[tableName]['foreignKeys'].length)
      }
    }
  }

  exec(query, params, context) {

    let _this = this;
    return new Promise(function (resolve, reject) {
      //console.log('mysql>', query, params);
      
      if (!context || Object.keys(context).length === 0) {
        _this.pool.query(query, params, function (error, rows, _fields) {
          if (error) {
            console.log('mysql> ', error);
            return reject(error);
          }
          return resolve(rows);
        });
      } else {
        _this.pool.getConnection(function(err, connection) {
          if (err) return reject(err);

          let setStatements = [];
          let setParams = [];

          for (let key in context) {
            // Sanitize key to be safe for MySQL variable name
            let safeKey = key.replace(/[^a-zA-Z0-9_]/g, '_');
            setStatements.push(`@request_jwt_claim_${safeKey} = ?`);
            
            let val = context[key];
            if (typeof val === 'object') val = JSON.stringify(val);
            setParams.push(val);
          }

          if (setStatements.length > 0) {
            let setQuery = 'SET ' + setStatements.join(', ');
            connection.query(setQuery, setParams, function(error) {
              if (error) {
                connection.release();
                console.log('mysql set vars> ', error);
                return reject(error);
              }
              
              connection.query(query, params, function(error, rows) {
                connection.release();
                if (error) {
                  console.log('mysql> ', error);
                  return reject(error);
                }
                return resolve(rows);
              });
            });
          } else {
            connection.query(query, params, function(error, rows) {
              connection.release();
              if (error) {
                console.log('mysql> ', error);
                return reject(error);
              }
              return resolve(rows);
            });
          }
        });
      }
    });

  }

  getLimitClause(reqParams) {

    //defaults
    reqParams._index = 0;
    reqParams._len = 20;

    if ('limit' in reqParams) {
      reqParams._len = parseInt(reqParams.limit);
    } else if ('_size' in reqParams && parseInt(reqParams._size) < 100) {
      reqParams._len = parseInt(reqParams._size)
    }

    if ('offset' in reqParams) {
      reqParams._index = parseInt(reqParams.offset);
    } else if ('_p' in reqParams && parseInt(reqParams._p) > 0) {
      reqParams._index = (parseInt(reqParams._p) - 1) * reqParams._len + 1;
    }

    //console.log(reqParams._index, reqParams._len);

    return [reqParams._index, reqParams._len]

  }

  getWhereClause(queryparams, tableName, queryParamsObj, appendToWhere) {

    let whereClauseObj = { query: '', params: [] };
    let hasCondition = false;

    // Existing _where logic
    if (queryparams && queryparams._where) {
      let oldWhere = whereHelp.getWhereClause(queryparams._where);
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

  getOrderByClause(queryparams, tableName) {

    //defaults
    let orderBy = '';

    if (queryparams._sort) {

      orderBy += ' ORDER BY '

      let orderByCols = queryparams._sort.split(',')

      for (let i = 0; i < orderByCols.length; ++i) {
        if (i) {
          orderBy = orderBy + ', '
        }
        if (orderByCols[i][0] === '-') {
          let len = orderByCols[i].length;
          orderBy = orderBy + orderByCols[i].substring(1, len) + ' DESC'
        } else {
          orderBy = orderBy + orderByCols[i] + ' ASC'
        }

      }

    } else if (queryparams.order) {

      orderBy += ' ORDER BY '
      let orderByCols = queryparams.order.split(',')

      for (let i = 0; i < orderByCols.length; ++i) {
        if (i) {
          orderBy = orderBy + ', '
        }

        let parts = orderByCols[i].split('.')
        let col = parts[0]
        let dir = parts.length > 1 ? parts[1].toUpperCase() : 'ASC'

        if (dir === 'DESC') {
          orderBy += col + ' DESC'
        } else {
          orderBy += col + ' ASC'
        }
      }
    }

    return orderBy
  }

  getColumnsForSelectStmt(tableName, reqQueryParams) {
    let selectStr = '';
    if ('_fields' in reqQueryParams) {
      selectStr = reqQueryParams['_fields'];
    } else if ('select' in reqQueryParams) {
      selectStr = reqQueryParams['select'];
    } else {
      selectStr = '*';
    }
    
    return this.resolveSelectColumns(tableName, selectStr);
  }

  getNestedQuery(parentTable, relationName, selectStr, hint) {
    let childTable = relationName; 
    let fks = this.metaDb.tables[childTable] && this.metaDb.tables[childTable].foreignKeys;
    let parentFks = this.metaDb.tables[parentTable] && this.metaDb.tables[parentTable].foreignKeys;
    
    // If hint is provided, use it to determine the FK relationship
    let fkToParent = null;
    let fkToChild = null;
    
    if (hint) {
      // Explicit hint provided: check if it's a FK in parent table pointing to child
      if (parentFks) {
        fkToChild = parentFks.find(fk => fk.column_name === hint && fk.referenced_table_name === childTable);
      }
      // If not found, check if it's a FK in child table pointing to parent
      if (!fkToChild && fks) {
        fkToParent = fks.find(fk => fk.column_name === hint && fk.referenced_table_name === parentTable);
      }
    } else {
      // No hint: use automatic detection (original behavior)
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
        for(let col of tableCols) {
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

  resolveSelectColumns(tableName, selectStr) {
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

    let finalCols = [];
    let tableCols = this.metaDb.tables[tableName].columns;

    if (hasStar || explicitItems.length === 0) {
        for(let col of tableCols) {
            if (!excluded.has(col.column_name)) {
                finalCols.push(`${tableName}.${col.column_name}`);
            }
        }
    }
    
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

  getPrimaryKeyWhereClause(tableName, pksValues) {

    let whereClause = '';
    let whereCol = '';
    let whereValue = '';
    let pks = []

    if (tableName in this.metaDb.tables) {
      pks = this.metaDb.tables[tableName].primaryKeys;
    } else {
      return null
    }

    // number of primary keys in table and one sent should be same
    if (pksValues.length !== pks.length) {
      return null
    }

    // get a where clause out of the above columnNames and their values
    for (let i = 0; i < pks.length; ++i) {

      let type = getColumnType(pks[i]);

      whereCol = pks[i]['column_name']

      if (type === 'string') {
        whereValue = mysql.escape(pksValues[i])
      } else if (type === 'int') {
        whereValue = parseInt(pksValues[i])
      } else if (type === 'float') {
        whereValue = parseFloat(pksValues[i])
      } else if (type === 'date') {
        whereValue = Date(pksValues[i])
      } else {
        console.error(pks[i])
        assert(false, 'Unhandled type of primary key')
      }

      if (i) {
        whereClause += ' and '
      }

      whereClause += whereCol + ' = ' + whereValue;

    }

    return whereClause;

  }

  getForeignKeyWhereClause(parentTable, parentId, childTable) {

    let whereValue = '';

    //get all foreign keys of child table
    let fks = this.metaDb.tables[childTable].foreignKeys;
    let fk = dataHelp.findObjectInArrayByKey('referenced_table_name', parentTable, fks);
    let whereCol = fk['column_name']
    let colType = getColumnType(fk);

    if (colType === 'string') {
      whereValue = mysql.escape(parentId)
    } else if (colType === 'int') {
      whereValue = mysql.escape(parseInt(parentId))
    } else if (colType === 'float') {
      whereValue = mysql.escape(parseFloat(parentId))
    } else if (colType === 'date') {
      whereValue = mysql.escape(Date(parentId))
    } else {
      console.error(pks[i])
      assert(false, 'Unhandled column type in foreign key handling')
    }

    return whereCol + ' = ' + whereValue;

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


function getDataType(colType, typesArr) {
  // console.log(colType,typesArr);
  for (let i = 0; i < typesArr.length; ++i) {
    if (colType.indexOf(typesArr[i]) !== -1) {
      return 1;
    }
  }
  return 0;
}

function getColumnType(column) {

  let strTypes = ['varchar', 'text', 'char', 'tinytext', 'mediumtext', 'longtext', 'blob', 'mediumblob', 'longblob', 'tinyblob', 'binary', 'varbinary'];
  let intTypes = ['int', 'long', 'smallint', 'mediumint', 'bigint', 'tinyint'];
  let flatTypes = ['float', 'double', 'decimal'];
  let dateTypes = ['date', 'datetime', 'timestamp', 'time', 'year'];

  //console.log(column);
  if (getDataType(column['data_type'], strTypes)) {
    return "string"
  } else if (getDataType(column['data_type'], intTypes)) {
    return "int"
  } else if (getDataType(column['data_type'], flatTypes)) {
    return "float"
  } else if (getDataType(column['data_type'], dateTypes)) {
    return "date"
  } else {
    return "string"
  }

}

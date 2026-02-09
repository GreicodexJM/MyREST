'use strict';

var Xsql = require('./xsql.js');
var multer = require('multer');
var path = require('path');
var jwt = require('jsonwebtoken');
var openapiHelper = require('./util/openapi.helper.js');
var dataHelper = require('./util/data.helper.js');

//define class
class Xapi {

  constructor(args, mysqlPool, app) {

    this.config = args;
    this.mysql = new Xsql(args, mysqlPool)
    this.app = app;

    /**************** START : multer ****************/
    this.storage = multer.diskStorage({
      destination: function (req, file, cb) {
        cb(null, process.cwd())
      },
      filename: function (req, file, cb) {
        console.log(file);
        cb(null, Date.now() + '-' + file.originalname)
      }
    })

    this.upload = multer({ storage: this.storage })
    /**************** END : multer ****************/


  }


  init(cbk) {

    this.mysql.init((err, results) => {

      if (this.config.jwtSecret) {
        this.app.use(this.jwtMiddleware.bind(this));
      }
      this.app.use(this.urlMiddleware)
      this.setupRoutes()
      this.app.use(this.errorMiddleware)
      cbk(err, results)

    })

  }

  jwtMiddleware(req, res, next) {
    if (req.headers.authorization && req.headers.authorization.split(' ')[0] === 'Bearer') {
      let token = req.headers.authorization.split(' ')[1];
      jwt.verify(token, this.config.jwtSecret, (err, decoded) => {
        if (err) {
          console.error(err,this.config.jwtSecret);
          return res.status(401).send({ error: 'Unauthorized: Invalid token'}); 
        }
        req.user = decoded;
        next();
      });
    } else {
      if (this.config.jwtRequired) {
        return res.status(401).send({ error: 'Unauthorized: Token required' });
      }
      // Treat as anonymous or just proceed
      next();
    }
  }


  urlMiddleware(req, res, next) {

    // get only request url from originalUrl
    let justUrl = req.originalUrl.split('?')[0]
    let pathSplit = justUrl.split('/')

    if (pathSplit.length >= 2 && pathSplit[1] === 'api') {
      if (pathSplit.length >= 5) {
        // handle for relational routes
        req.app.locals._parentTable = pathSplit[2]
        req.app.locals._childTable = pathSplit[4]
      } else {
        // handles rest of routes
        req.app.locals._tableName = pathSplit[2]
      }
    }

    next();
  }

  errorMiddleware(err, req, res, next) {

    if (err && err.code)
      res.status(400).json({ error: err });
    else if (err && err.message)
      res.status(500).json({ error: 'Internal server error : ' + err.message });
    else
      res.status(500).json({ error: 'Internal server error : ' + err });

    next(err);

  }

  asyncMiddleware(fn) {
    return (req, res, next) => {
      Promise.resolve(fn(req, res, next))
        .catch((err) => {
          next(err);
        });
    }
  }

  root(req, res) {

    let routes = [];
    routes = this.mysql.getSchemaRoutes(false, req.protocol + '://' + req.get('host') + '/api/');
    routes = routes.concat(this.mysql.globalRoutesPrint(req.protocol + '://' + req.get('host') + '/api/'))
    res.json(routes)

  }

  setupRoutes() {

    // show routes for database schema
    this.app.get('/', this.asyncMiddleware(this.root.bind(this)))

    // show all resouces
    this.app.route('/api/tables')
      .get(this.asyncMiddleware(this.tables.bind(this)));


    /**************** START : setup routes for each table ****************/

    let resources = [];
    resources = this.mysql.getSchemaRoutes(true, '/api/');

    // iterate over each resource
    for (var j = 0; j < resources.length; ++j) {

      let routes = resources[j]['routes'];

      // iterate over rach routes in resource and map function
      for (var i = 0; i < routes.length; ++i) {

        switch (routes[i]['routeType']) {

          case 'list':
            this.app.route(routes[i]['routeUrl'])
              .get(this.asyncMiddleware(this.list.bind(this)));
            break;

          case 'create':
            this.app.route(routes[i]['routeUrl'])
              .post(this.asyncMiddleware(this.create.bind(this)));
            break;

          case 'read':
            this.app.route(routes[i]['routeUrl'])
              .get(this.asyncMiddleware(this.read.bind(this)));
            break;

          case 'update':
            this.app.route(routes[i]['routeUrl'])
              .put(this.asyncMiddleware(this.update.bind(this)));
            break;

          case 'patch':
            this.app.route(routes[i]['routeUrl'])
              .patch(this.asyncMiddleware(this.patch.bind(this)));
            break;

          case 'delete':
            this.app.route(routes[i]['routeUrl'])
              .delete(this.asyncMiddleware(this.delete.bind(this)));
            break;

          case 'exists':
            this.app.route(routes[i]['routeUrl'])
              .get(this.asyncMiddleware(this.exists.bind(this)));
            break;

          case 'count':
            this.app.route(routes[i]['routeUrl'])
              .get(this.asyncMiddleware(this.count.bind(this)));
            break;

          case 'describe':
            this.app.route(routes[i]['routeUrl'])
              .get(this.asyncMiddleware(this.tableDescribe.bind(this)));
            break;

          case 'relational':
            this.app.route(routes[i]['routeUrl'])
              .get(this.asyncMiddleware(this.nestedList.bind(this)));
            break;

          case 'groupby':
            this.app.route(routes[i]['routeUrl'])
              .get(this.asyncMiddleware(this.groupBy.bind(this)));
            break;

          case 'aggregate':
            this.app.route(routes[i]['routeUrl'])
              .get(this.asyncMiddleware(this.aggregate.bind(this)));
            break;


        }
      }
    }
    /**************** END : setup routes for each table ****************/


    // PostgREST RPC support
    this.app.route('/rpc/:procName')
      .post(this.asyncMiddleware(this.callProcedure.bind(this)));

    // OpenAPI Spec
    this.app.route('/api/openapi.json')
      .get(this.asyncMiddleware(this.openapi.bind(this)));

    if (this.config.dynamic === 1) {

      this.app.route('/dynamic*')
        .post(this.asyncMiddleware(this.runQuery.bind(this)));

      /**************** START : multer routes ****************/
      this.app.post('/upload', this.upload.single('file'), this.uploadFile.bind(this));
      this.app.post('/uploads', this.upload.array('files', 10), this.uploadFiles.bind(this));
      this.app.get('/download', this.downloadFile.bind(this));
      /**************** END : multer routes ****************/

    }
  }

  async create(req, res) {

    let tableName = req.app.locals._tableName;
    let results;
    let preferHeader = req.get('Prefer');
    let resolutionHeader = req.get('Resolution');
    let returnRepresentation = preferHeader && preferHeader.includes('return=representation');
    let isUpsert = (resolutionHeader === 'merge-duplicates');
    let isIgnore = (resolutionHeader === 'ignore-duplicates');

    if (Array.isArray(req.body)) {
      // Bulk Insert
      if (req.body.length === 0) return res.status(200).json([]);

      // Serialize JSON columns for each object in the array
      let processedBody = req.body.map(obj => dataHelper.serializeJsonColumns(tableName, obj, this.mysql.metaDb));

      // Assume all objects have same keys
      let keys = Object.keys(processedBody[0]);
      let values = processedBody.map(obj => keys.map(key => obj[key]));

      let query = 'INSERT ' + (isIgnore ? 'IGNORE ' : '') + 'INTO ?? (??) VALUES ?';
      let params = [tableName, keys, values];

      if (isUpsert && !isIgnore) {
        query += ' ON DUPLICATE KEY UPDATE ';
        let updateParts = keys.map(key => `${this.mysql.pool.escapeId(key)} = VALUES(${this.mysql.pool.escapeId(key)})`);
        query += updateParts.join(', ');
      }

      results = await this.mysql.exec(query, params, req.user);

      if (returnRepresentation) {
        // Attempt to fetch inserted rows
        // Only reliable if Auto Increment PK and results.insertId is set
        if (results.insertId) {
          let pks = this.mysql.metaDb.tables[tableName].primaryKeys;
          if (pks.length === 1) {
            let pkCol = pks[0].column_name;
            let firstId = results.insertId;
            let count = results.affectedRows;
            let lastId = firstId + count - 1;

            let selectQuery = 'SELECT * FROM ?? WHERE ?? BETWEEN ? AND ?';
            let selectParams = [tableName, pkCol, firstId, lastId];
            let rows = await this.mysql.exec(selectQuery, selectParams, req.user);
            return res.status(201).json(rows);
          }
        }
        // If not fetchable, return results (PostgREST might expect data, but we can't guarantee it without RETURNING)
      }

    } else {
      // Single Insert
      // Serialize JSON columns
      let processedBody = dataHelper.serializeJsonColumns(tableName, req.body, this.mysql.metaDb);

      let query = 'INSERT ' + (isIgnore ? 'IGNORE ' : '') + 'INTO ?? SET ?';
      let params = [tableName, processedBody];

      if (isUpsert && !isIgnore) {
        query += ' ON DUPLICATE KEY UPDATE ';
        let keys = Object.keys(processedBody);
        let updateParts = keys.map(key => `${this.mysql.pool.escapeId(key)} = VALUES(${this.mysql.pool.escapeId(key)})`);
        query += updateParts.join(', ');
      }

      results = await this.mysql.exec(query, params, req.user);

      if (returnRepresentation) {
        let pks = this.mysql.metaDb.tables[tableName].primaryKeys;
        let whereParts = [];
        let selectParams = [tableName];
        let canFetch = true;

        if (pks.length === 1 && results.insertId) {
          // Simple case: Single PK, Auto Increment
          whereParts.push('?? = ?');
          selectParams.push(pks[0].column_name);
          selectParams.push(results.insertId);
        } else {
          // Composite or non-AI
          for (let pk of pks) {
            let val = req.body[pk.column_name];
            if (val === undefined) {
              canFetch = false;
              break;
            }
            whereParts.push('?? = ?');
            selectParams.push(pk.column_name);
            selectParams.push(val);
          }
        }

        if (canFetch && whereParts.length > 0) {
          let selectQuery = 'SELECT * FROM ?? WHERE ' + whereParts.join(' AND ');
          let rows = await this.mysql.exec(selectQuery, selectParams, req.user);
          return res.status(201).json(rows);
        }
      }
    }

    res.status(200).json(results);

  }

  async list(req, res) {

    let tableName = req.app.locals._tableName;
    let queryParamsObj = { query: '', params: [] };
    let cols = this.mysql.getColumnsForSelectStmt(tableName, req.query);

    // Prepare Where Clause
    let whereObj = { query: '', params: [] };
    this.mysql.getWhereClause(req.query, tableName, whereObj, ' where ');

    // RLS: Get policy clause
    let rlsClause = this.mysql.getPolicyWhereClause(tableName, 'SELECT');
    
    if (rlsClause) {
      if (whereObj.query) {
        // Combine: WHERE (RLS) AND (user conditions)
        whereObj.query = whereObj.query.replace(/\s*where\s+/i, ` where (${rlsClause}) AND `);
      } else {
        whereObj.query = ` where ${rlsClause}`;
      }
    }

    // Handle Count
    let preferHeader = req.get('Prefer');
    let countRequested = preferHeader && preferHeader.includes('count=exact');
    let totalCount = null;

    if (countRequested) {
      let countQuery = 'SELECT count(1) as no_of_rows FROM ?? ' + whereObj.query;
      let countParams = [tableName].concat(whereObj.params);
      let countResults = await this.mysql.exec(countQuery, countParams, req.user);
      totalCount = countResults[0].no_of_rows;
    }

    // Build Main Query
    queryParamsObj.query = 'select ' + cols + ' from ?? ' + whereObj.query;
    queryParamsObj.params.push(tableName);
    queryParamsObj.params = queryParamsObj.params.concat(whereObj.params);

    // Order By
    queryParamsObj.query += this.mysql.getOrderByClause(req.query, tableName);

    // Limit
    let limitClause = this.mysql.getLimitClause(req.query);
    queryParamsObj.query += ' limit ?,? ';
    queryParamsObj.params.push(limitClause[0]); // offset
    queryParamsObj.params.push(limitClause[1]); // limit

    let results = await this.mysql.exec(queryParamsObj.query, queryParamsObj.params, req.user);

    // Set Content-Range Header
    let offset = limitClause[0];
    let start = offset;
    let end = start + results.length - 1;
    let totalStr = totalCount !== null ? totalCount : '*';

    if (results.length === 0) {
      res.set('Content-Range', `*/${totalStr}`);
    } else {
      res.set('Content-Range', `${start}-${end}/${totalStr}`);
    }

    // Handle Singular Response (Accept: application/vnd.pgrst.object+json)
    let acceptHeader = req.get('Accept');
    if (acceptHeader && acceptHeader.includes('application/vnd.pgrst.object+json')) {
      if (results.length === 1) {
        return res.status(200).json(results[0]);
      } else {
        return res.status(406).json({
          message: "JSON object requested, multiple (or no) rows returned",
          details: `The result contains ${results.length} rows`
        });
      }
    }

    res.status(200).json(results);

  }

  async nestedList(req, res) {

    let queryParamsObj = { query: '', params: [] };
    let childTable = req.app.locals._childTable;
    let parentTable = req.app.locals._parentTable;

    /**************** tableName ****************/
    let cols = this.mysql.getColumnsForSelectStmt(childTable, req.query);

    // Prepare Where Clause
    let whereObj = { query: '', params: [] };

    /**************** where foreign key ****************/
    let fkWhere = this.mysql.getForeignKeyWhereClause(parentTable, req.params.id, childTable);

    if (!fkWhere) {
      return res.status(400).send({
        error: "Table is made of composite primary keys - all keys were not in input"
      })
    }
    whereObj.query = fkWhere;

    /**************** where conditions in query ****************/
    // Use childTable for where clause generation context
    this.mysql.getWhereClause(req.query, childTable, whereObj, ' and ');

    // RLS: Inject policy for nested list
    let rlsClause = this.mysql.getPolicyWhereClause(childTable, 'SELECT');
    if (rlsClause) {
      whereObj.query += ` and (${rlsClause})`;
    }

    // Handle Count
    let preferHeader = req.get('Prefer');
    let countRequested = preferHeader && preferHeader.includes('count=exact');
    let totalCount = null;

    if (countRequested) {
      let countQuery = 'SELECT count(1) as no_of_rows FROM ?? WHERE ' + whereObj.query;
      let countParams = [childTable].concat(whereObj.params);
      let countResults = await this.mysql.exec(countQuery, countParams, req.user);
      totalCount = countResults[0].no_of_rows;
    }

    // Build Main Query
    queryParamsObj.query = 'select ' + cols + ' from ?? where ' + whereObj.query;
    queryParamsObj.params.push(childTable);
    queryParamsObj.params = queryParamsObj.params.concat(whereObj.params);

    /**************** order clause ****************/
    // Use childTable for order context
    queryParamsObj.query += this.mysql.getOrderByClause(req.query, childTable);

    /**************** limit clause ****************/
    let limitClause = this.mysql.getLimitClause(req.query);
    queryParamsObj.query += ' limit ?,? ';
    queryParamsObj.params.push(limitClause[0]);
    queryParamsObj.params.push(limitClause[1]);

    let results = await this.mysql.exec(queryParamsObj.query, queryParamsObj.params, req.user);

    // Set Content-Range Header
    let offset = limitClause[0];
    let start = offset;
    let end = start + results.length - 1;
    let totalStr = totalCount !== null ? totalCount : '*';

    if (results.length === 0) {
      res.set('Content-Range', `*/${totalStr}`);
    } else {
      res.set('Content-Range', `${start}-${end}/${totalStr}`);
    }

    res.status(200).json(results);

  }

  async read(req, res) {

    let tableName = req.app.locals._tableName;
    let query = 'select * from ?? where ';
    let params = [];

    params.push(tableName);

    let clause = this.mysql.getPrimaryKeyWhereClause(tableName,
      req.params.id.split('___'));


    if (!clause) {
      return res.status(400).send({
        error: "Table is made of composite primary keys - all keys were not in input"
      });
    }

    // RLS: Inject policy
    let rlsClause = this.mysql.getPolicyWhereClause(tableName, 'SELECT');
    if (rlsClause) {
      query += `(${rlsClause}) AND ${clause}`;
    } else {
      query += clause;
    }
    
    query += ' LIMIT 1'

    let results = await this.mysql.exec(query, params, req.user);
    res.status(200).json(results);


  }

  async exists(req, res) {

    let query = 'select * from ?? where ';
    let params = [];

    params.push(req.app.locals._tableName);

    let clause = this.mysql.getPrimaryKeyWhereClause(req.app.locals._tableName,
      req.params.id.split('___'));

    if (!clause) {
      return res.status(400).send({
        error: "Table is made of composite primary keys - all keys were not in input"
      })
    }

    query += clause;
    query += ' LIMIT 1'

    let results = await this.mysql.exec(query, params, req.user);
    res.status(200).json(results);


  }

  async update(req, res) {
    let tableName = req.app.locals._tableName;

    // Serialize JSON columns
    let processedBody = dataHelper.serializeJsonColumns(tableName, req.body, this.mysql.metaDb);

    let query = 'UPDATE ?? SET ';
    let keys = Object.keys(processedBody);

    // SET clause
    let updateKeys = '';
    for (let i = 0; i < keys.length; ++i) {
      updateKeys += keys[i] + ' = ? '
      if (i !== keys.length - 1)
        updateKeys += ', '
    }

    // where clause
    query += updateKeys + ' where '
    let clause = this.mysql.getPrimaryKeyWhereClause(tableName,
      req.params.id.split('___'));

    if (!clause) {
      return res.status(400).send({
        error: "Table is made of composite primary keys - all keys were not in input"
      })
    }

    // RLS: Inject policy
    let rlsClause = this.mysql.getPolicyWhereClause(tableName, 'UPDATE');
    if (rlsClause) {
      query += `(${rlsClause}) AND ${clause}`;
    } else {
      query += clause;
    }

    // params
    let params = [];
    params.push(tableName);
    params = params.concat(Object.values(processedBody));

    let results = await this.mysql.exec(query, params, req.user);
    res.status(200).json(results);


  }

  async patch(req, res) {
    let tableName = req.app.locals._tableName;

    // Serialize JSON columns
    let processedBody = dataHelper.serializeJsonColumns(tableName, req.body, this.mysql.metaDb);
    let keys = Object.keys(processedBody);

    if (keys.length === 0) {
      // Nothing to update
      return res.status(204).send();
    }

    let preferHeader = req.get('Prefer');
    let returnRepresentation = preferHeader && preferHeader.includes('return=representation');
    let rowsToUpdate = [];

    // WHERE clause construction
    let whereObj = { query: '', params: [] };
    this.mysql.getWhereClause(req.query, tableName, whereObj, ' where ');

    // RLS: Inject policy into WHERE clause
    let rlsClause = this.mysql.getPolicyWhereClause(tableName, 'UPDATE');
    if (rlsClause) {
      if (whereObj.query) {
        whereObj.query = whereObj.query.replace(/\s*where\s+/i, ` where (${rlsClause}) AND `);
      } else {
        whereObj.query = ` where ${rlsClause}`;
      }
    }

    if (returnRepresentation) {
      let pks = this.mysql.metaDb.tables[tableName].primaryKeys;
      if (pks && pks.length > 0) {
        let pkCols = pks.map(pk => pk.column_name);
        let selectQuery = 'SELECT ' + pkCols.map(c => '??').join(',') + ' FROM ?? ' + whereObj.query;
        let selectParams = pkCols.concat([tableName]).concat(whereObj.params);

        rowsToUpdate = await this.mysql.exec(selectQuery, selectParams, req.user);
      }
    }

    let query = 'UPDATE ?? SET ';
    let params = [tableName];

    // SET clause
    let updateKeys = '';
    for (let i = 0; i < keys.length; ++i) {
      updateKeys += keys[i] + ' = ? '
      if (i !== keys.length - 1)
        updateKeys += ', '
      params.push(processedBody[keys[i]]);
    }
    query += updateKeys;

    query += whereObj.query;
    params = params.concat(whereObj.params);

    // Execute
    let results = await this.mysql.exec(query, params, req.user);

    if (returnRepresentation && rowsToUpdate.length > 0) {
      // Fetch updated rows using PKs
      let pks = this.mysql.metaDb.tables[tableName].primaryKeys;
      let pkCols = pks.map(pk => pk.column_name);

      let pkWhere = '';
      let fetchParams = [tableName];

      if (pkCols.length === 1) {
        let ids = rowsToUpdate.map(r => r[pkCols[0]]);
        pkWhere = '?? IN (?)';
        fetchParams.push(pkCols[0]);
        fetchParams.push(ids);
      } else {
        // Composite key handling
        let ids = rowsToUpdate.map(r => pkCols.map(c => r[c]));
        pkWhere = '(' + pkCols.map(c => '??').join(',') + ') IN (?)';
        pkCols.forEach(c => fetchParams.push(c));
        fetchParams.push(ids);
      }

      let fetchQuery = 'SELECT * FROM ?? WHERE ' + pkWhere;
      let finalRows = await this.mysql.exec(fetchQuery, fetchParams, req.user);
      return res.status(200).json(finalRows);
    } else if (returnRepresentation) {
      return res.status(200).json([]);
    }

    res.status(200).json(results);
  }

  async delete(req, res) {

    let query = 'DELETE FROM ?? ';
    let params = [];
    let tableName = req.app.locals._tableName;

    params.push(tableName);

    let whereClause = '';
    let whereParams = [];

    if (req.params.id) {
      let clause = this.mysql.getPrimaryKeyWhereClause(tableName, req.params.id.split('___'));
      if (!clause) {
        return res.status(400).send({
          error: "Table is made of composite primary keys - all keys were not in input"
        });
      }
      
      // RLS: Inject policy for single record delete
      let rlsClause = this.mysql.getPolicyWhereClause(tableName, 'DELETE');
      if (rlsClause) {
        whereClause = `WHERE (${rlsClause}) AND ${clause}`;
      } else {
        whereClause = 'WHERE ' + clause;
      }
    } else {
      let whereObj = { query: '', params: [] };
      this.mysql.getWhereClause(req.query, tableName, whereObj, ' WHERE ');

      // RLS: Inject policy for bulk delete
      let rlsClause = this.mysql.getPolicyWhereClause(tableName, 'DELETE');
      if (rlsClause) {
        if (whereObj.query) {
          whereObj.query = whereObj.query.replace(/\s*WHERE\s+/i, ` WHERE (${rlsClause}) AND `);
        } else {
          whereObj.query = ` WHERE ${rlsClause}`;
        }
      }

      if (whereObj.query) {
        whereClause = whereObj.query;
        whereParams = whereObj.params;
      }
    }

    let preferHeader = req.get('Prefer');
    let returnRepresentation = preferHeader && preferHeader.includes('return=representation');
    let rowsToDelete = [];

    if (returnRepresentation) {
      let selectQuery = 'SELECT * FROM ?? ' + whereClause;
      let selectParams = [tableName].concat(whereParams);
      rowsToDelete = await this.mysql.exec(selectQuery, selectParams, req.user);
    }

    query += whereClause;
    params = params.concat(whereParams);

    let results = await this.mysql.exec(query, params, req.user);

    if (returnRepresentation) {
      return res.status(200).json(rowsToDelete);
    }

    res.status(200).json(results);


  }

  async count(req, res) {

    let query = 'select count(1) as no_of_rows from ??';
    let params = [];

    params.push(req.app.locals._tableName);

    let results = await this.mysql.exec(query, params, req.user);
    res.status(200).json(results);


  }

  async tables(req, res) {

    let query = 'show tables';
    let params = [];

    let results = await this.mysql.exec(query, params, req.user)
    let filtered = results.filter((t)=>Object.values(t)!='_rls_policies');
    res.status(200).json(filtered)

  }

  async openapi(req, res) {
    let host = req.protocol + '://' + req.get('host') + '/api';
    let spec = openapiHelper.generate(this.mysql.metaDb, host);
    res.json(spec);
  }

  async runQuery(req, res) {

    let query = req.body.query;
    let params = req.body.params;

    let results = await this.mysql.exec(query, params, req.user);
    res.status(200).json(results);


  }

  async callProcedure(req, res) {
    let procName = req.params.procName;
    let routine = this.mysql.metaDb.routines[procName];

    if (!routine) {
      return res.status(404).json({ error: `Function ${procName} not found` });
    }

    let params = [];
    let placeHolders = [];
    let args = req.body || {};

    // Sort params by ordinal position
    // Note: metaDb.routines[procName].params is already populated in order from query, 
    // but let's be safe and sort if needed, or assume order.
    // The query 'ORDER BY R.ROUTINE_NAME, P.ORDINAL_POSITION' ensures order.

    for (let p of routine.params) {
      // Param names in metaDb might be case sensitive depending on DB, usually they are stored as is.
      // PostgREST matches by name.
      let val = args[p.name];

      // Handle missing params: pass NULL
      if (val === undefined) {
        params.push(null);
      } else {
        params.push(val);
      }
      placeHolders.push('?');
    }

    let query = '';
    if (routine.type === 'PROCEDURE') {
      query = `CALL ??(${placeHolders.join(',')})`;
    } else {
      query = `SELECT ??(${placeHolders.join(',')})`;
    }

    // First param for ?? is procName
    let queryParams = [procName].concat(params);

    let results = await this.mysql.exec(query, queryParams, req.user);

    // For procedures, results might be an array of arrays (result sets) + packet info
    // For functions, it's usually rows.

    // PostgREST returns JSON.
    // If multiple result sets, maybe return the first one?
    // mysql2 returns [rows, fields] usually, but exec returns rows.
    // CALL returns [result1, result2, ..., okPacket].

    if (Array.isArray(results) && results.length > 0 && Array.isArray(results[0])) {
      // Return first result set
      return res.status(200).json(results[0]);
    }

    // Function return or single result
    res.status(200).json(results);
  }

  async tableDescribe(req, res) {

    let query = 'describe ??';
    let params = [req.app.locals._tableName];

    let results = await this.mysql.exec(query, params, req.user);
    res.status(200).json(results);


  }

  async groupBy(req, res) {

    if (req.query && req.query._fields) {
      let query = 'select ' + req.query._fields + ',count(*) as count from ?? group by ' + req.query._fields;
      let params = [];
      let tableName = req.app.locals._tableName;

      params.push(tableName);

      if (!req.query.sort) {
        req.query._sort = '-count'
      } else {
        req.query._sort = req.query.sort
      }

      query = query + this.mysql.getOrderByClause(req.query, tableName);

      var results = await this.mysql.exec(query, params, req.user);

      res.status(200).json(results);
    } else {
      res.status(400).json({ message: 'Missing _fields query params eg: /api/tableName/groupby?_fields=column1' })
    }


  }

  async aggregate(req, res) {


    if (req.query && req.query._fields) {
      let tableName = req.app.locals._tableName;
      let query = 'select '
      let params = []
      let fields = req.query._fields.split(',');

      for (var i = 0; i < fields.length; ++i) {
        if (i) {
          query = query + ','
        }
        query = query + ' min(??) as ?,max(??) as ?,avg(??) as ?,sum(??) as ?,stddev(??) as ?,variance(??) as ? '
        params.push(fields[i]);
        params.push('min_of_' + fields[i]);
        params.push(fields[i]);
        params.push('max_of_' + fields[i]);
        params.push(fields[i]);
        params.push('avg_of_' + fields[i]);
        params.push(fields[i]);
        params.push('sum_of_' + fields[i]);
        params.push(fields[i]);
        params.push('stddev_of_' + fields[i]);
        params.push(fields[i]);
        params.push('variance_of_' + fields[i]);
      }

      query = query + ' from ??'
      params.push(tableName)

      var results = await this.mysql.exec(query, params, req.user);

      res.status(200).json(results);
    } else {
      res.status(400).json({ message: 'Missing _fields in query params eg: /api/tableName/groupby?_fields=numericColumn1' });
    }

  }


  /**************** START : files related ****************/
  downloadFile(req, res) {
    let file = path.join(process.cwd(), req.query.name);
    res.download(file);
  }

  uploadFile(req, res) {

    if (req.file) {
      console.log(req.file.path);
      res.end(req.file.path);
    } else {
      res.end('upload failed');
    }
  }

  uploadFiles(req, res) {

    if (!req.files || req.files.length === 0) {
      res.end('upload failed')
    } else {
      let files = [];
      for (let i = 0; i < req.files.length; ++i) {
        files.push(req.files[i].path);
      }

      res.end(files.toString());
    }

  }

  /**************** END : files related ****************/

}


//expose class
module.exports = Xapi;

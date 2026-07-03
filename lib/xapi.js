'use strict';

var Xsql = require('./xsql.js');
var multer = require('multer');
var path = require('path');
var crypto = require('crypto');
var fs = require('fs');
var openapiHelper = require('./util/openapi.helper.js');

// Import refactored modules
const createJwtMiddleware = require('./adapters/middleware/jwtMiddleware.js');
const createSchemaProfileMiddleware = require('./adapters/middleware/schemaProfileMiddleware.js');
const createCorsMiddleware = require('./adapters/middleware/corsMiddleware.js');
const urlMiddleware = require('./adapters/middleware/urlMiddleware.js');
const errorMiddleware = require('./adapters/middleware/errorMiddleware.js');
const asyncMiddleware = require('./adapters/middleware/asyncMiddleware.js');
const CrudService = require('./domain/services/CrudService.js');
const AggregationService = require('./domain/services/AggregationService.js');
const ProcedureService = require('./domain/services/ProcedureService.js');
const FileService = require('./domain/services/FileService.js');
const RouteDiscoveryService = require('./domain/services/RouteDiscoveryService.js');
const CONSTANTS = require('./domain/constants.js');

//define class
class Xapi {

  constructor(args, mysqlPool, app) {

    this.config = args;
    this.mysql = new Xsql(args, mysqlPool)
    this.app = app;
    
    // Initialize Services (will be created after mysql.init)
    this.crudService = null;
    this.aggregationService = null;
    this.procedureService = null;
    // Storage folder for uploads/downloads: --storageFolder / -s flag, cwd by default
    this.storageFolder = path.resolve(args.storageFolder || process.cwd());
    fs.mkdirSync(this.storageFolder, { recursive: true });
    this.fileService = new FileService(this.storageFolder);
    this.routeDiscoveryService = null;

    /**************** START : multer ****************/
    const storageFolder = this.storageFolder;
    this.storage = multer.diskStorage({
      destination: function (req, file, cb) {
        cb(null, storageFolder)
      },
      filename: function (req, file, cb) {
        // originalname is client-controlled: strip any path components and
        // unsafe characters, add a random suffix so names are not predictable
        const safeName = path.basename(file.originalname).replace(/[^\w.\-]/g, '_');
        const suffix = crypto.randomBytes(6).toString('hex');
        cb(null, Date.now() + '-' + suffix + '-' + safeName)
      }
    })

    this.upload = multer({
      storage: this.storage,
      limits: {
        fileSize: CONSTANTS.FILES.MAX_UPLOAD_SIZE,
        files: CONSTANTS.FILES.MAX_UPLOAD_COUNT
      }
    })
    /**************** END : multer ****************/


  }


  init(cbk) {

    this.mysql.init((err, results) => {

      // Initialize all services after mysql is ready
      this.crudService = new CrudService(this.mysql, this.mysql.rlsService);
      this.aggregationService = new AggregationService(this.mysql);
      this.procedureService = new ProcedureService(this.mysql);
      this.routeDiscoveryService = new RouteDiscoveryService(this.mysql.metaDb, this.config);

      // Use refactored middleware
      // CORS must be applied first to handle preflight requests
      this.app.use(createCorsMiddleware(this.config));
      
      if (this.config.jwtSecret) {
        this.app.use(createJwtMiddleware(this.config));
      }
      this.app.use(urlMiddleware)
      if (this.isMultiDatabase()) {
        this.app.use(createSchemaProfileMiddleware(this.mysql, this.config))
      }
      this.setupRoutes()
      this.app.use(errorMiddleware)

      // Auto-refresh schema every 60s to pick up new columns/tables
      const schemaRefreshInterval = parseInt(process.env.SCHEMA_REFRESH_INTERVAL || '60', 10) * 1000;
      if (schemaRefreshInterval > 0) {
        setInterval(async () => {
          try {
            await this.mysql.reloadSchema();
            console.log('Schema auto-refreshed');
          } catch (e) {
            console.error('Schema auto-refresh failed:', e.message);
          }
        }, schemaRefreshInterval);
      }

      cbk(err, results)

    })

  }

  root(req, res) {
    const baseUrl = req.protocol + '://' + req.get('host') + '/api/';
    const routes = this.routeDiscoveryService.getAllRoutes(baseUrl);
    res.json(routes)
  }

  isMultiDatabase() {
    return Array.isArray(this.config.databases) && this.config.databases.length > 0;
  }

  /**
   * Multi-database mode routing: tables are matched generically and resolved
   * per-request by the schema profile middleware (explicit db.table names,
   * PostgREST profile headers, or unique short-name match). This also means
   * tables created after startup are routable right after a schema refresh.
   */
  setupGenericTableRoutes() {
    // Literal sub-resources must be registered before /:tableName/:id
    this.app.route('/api/:tableName/describe')
      .get(asyncMiddleware(this.tableDescribe.bind(this)));
    this.app.route('/api/:tableName/count')
      .get(asyncMiddleware(this.count.bind(this)));
    this.app.route('/api/:tableName/groupby')
      .get(asyncMiddleware(this.groupBy.bind(this)));
    this.app.route('/api/:tableName/aggregate')
      .get(asyncMiddleware(this.aggregate.bind(this)));

    // 'exists' before the relational pattern (both have 3 segments)
    this.app.route('/api/:tableName/:id/exists')
      .get(asyncMiddleware(this.exists.bind(this)));

    // Relational route: /api/parent/:id/child
    this.app.route('/api/:parentTable/:id/:childTable')
      .get(asyncMiddleware(this.nestedList.bind(this)));

    this.app.route('/api/:tableName')
      .get(asyncMiddleware(this.list.bind(this)))
      .post(asyncMiddleware(this.create.bind(this)))
      .patch(asyncMiddleware(this.patch.bind(this)))
      .delete(asyncMiddleware(this.delete.bind(this)));

    this.app.route('/api/:tableName/:id')
      .get(asyncMiddleware(this.read.bind(this)))
      .put(asyncMiddleware(this.update.bind(this)))
      .delete(asyncMiddleware(this.delete.bind(this)));
  }

  setupRoutes() {

    // show routes for database schema
    this.app.get('/', asyncMiddleware(this.root.bind(this)))

    // show all resouces
    this.app.route('/api/tables')
      .get(asyncMiddleware(this.tables.bind(this)));

    // schema refresh endpoint — picks up new columns/tables without restart
    this.app.post('/api/schema/refresh', asyncMiddleware(async (req, res) => {
      await this.mysql.reloadSchema();
      res.json({ status: 'OK', message: 'Schema reloaded', tables: Object.keys(this.mysql.metaDb.tables).length });
    }));


    /**************** START : setup routes for each table ****************/

    if (this.isMultiDatabase()) {
      this.setupGenericTableRoutes();
    } else {

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
              .get(asyncMiddleware(this.list.bind(this)));
            break;

          case 'create':
            this.app.route(routes[i]['routeUrl'])
              .post(asyncMiddleware(this.create.bind(this)));
            break;

          case 'read':
            this.app.route(routes[i]['routeUrl'])
              .get(asyncMiddleware(this.read.bind(this)));
            break;

          case 'update':
            this.app.route(routes[i]['routeUrl'])
              .put(asyncMiddleware(this.update.bind(this)));
            break;

          case 'patch':
            this.app.route(routes[i]['routeUrl'])
              .patch(asyncMiddleware(this.patch.bind(this)));
            break;

          case 'delete':
            this.app.route(routes[i]['routeUrl'])
              .delete(asyncMiddleware(this.delete.bind(this)));
            break;

          case 'exists':
            this.app.route(routes[i]['routeUrl'])
              .get(asyncMiddleware(this.exists.bind(this)));
            break;

          case 'count':
            this.app.route(routes[i]['routeUrl'])
              .get(asyncMiddleware(this.count.bind(this)));
            break;

          case 'describe':
            this.app.route(routes[i]['routeUrl'])
              .get(asyncMiddleware(this.tableDescribe.bind(this)));
            break;

          case 'relational':
            this.app.route(routes[i]['routeUrl'])
              .get(asyncMiddleware(this.nestedList.bind(this)));
            break;

          case 'groupby':
            this.app.route(routes[i]['routeUrl'])
              .get(asyncMiddleware(this.groupBy.bind(this)));
            break;

          case 'aggregate':
            this.app.route(routes[i]['routeUrl'])
              .get(asyncMiddleware(this.aggregate.bind(this)));
            break;


        }
      }
    }

    }
    /**************** END : setup routes for each table ****************/


    // PostgREST RPC support
    this.app.route('/rpc/:procName')
      .post(asyncMiddleware(this.callProcedure.bind(this)));

    // OpenAPI Spec
    this.app.route('/api/openapi.json')
      .get(asyncMiddleware(this.openapi.bind(this)));

    if (this.config.dynamic === 1) {

      this.app.route('/dynamic*')
        .post(asyncMiddleware(this.runQuery.bind(this)));

      /**************** START : multer routes ****************/
      this.app.post('/upload', this.upload.single('file'), this.uploadFile.bind(this));
      this.app.post('/uploads', this.upload.array('files', 10), this.uploadFiles.bind(this));
      this.app.get('/download', this.downloadFile.bind(this));
      /**************** END : multer routes ****************/

    }
  }

  async create(req, res) {
    const tableName = res.locals._tableName;
    const preferHeader = req.get(CONSTANTS.HEADERS.PREFER);
    const resolutionHeader = req.get(CONSTANTS.HEADERS.RESOLUTION);

    const options = {
      isUpsert: resolutionHeader === CONSTANTS.POSTGREST.RESOLUTION_MERGE,
      isIgnore: resolutionHeader === CONSTANTS.POSTGREST.RESOLUTION_IGNORE,
      returnRepresentation: preferHeader && preferHeader.includes(CONSTANTS.POSTGREST.PREFER_RETURN_REPRESENTATION)
    };

    const result = await this.crudService.create(tableName, req.body, options, req.user);

    if (options.returnRepresentation && result.results && Array.isArray(result.results)) {
      return res.status(CONSTANTS.HTTP_STATUS.CREATED).json(result.results);
    }

    res.status(CONSTANTS.HTTP_STATUS.OK).json(result.results || result);
  }

  async list(req, res) {
    const tableName = res.locals._tableName;
    const preferHeader = req.get(CONSTANTS.HEADERS.PREFER);
    const countRequested = preferHeader && preferHeader.includes(CONSTANTS.POSTGREST.PREFER_COUNT_EXACT);

    const result = await this.crudService.list(tableName, req.query, { countTotal: countRequested }, req.user);

    // Set Content-Range Header
    const { rows, offset, limit, totalCount } = result;
    const start = offset;
    const end = start + rows.length - 1;
    const totalStr = totalCount !== null ? totalCount : '*';

    if (rows.length === 0) {
      res.set(CONSTANTS.HEADERS.CONTENT_RANGE, `*/${totalStr}`);
    } else {
      res.set(CONSTANTS.HEADERS.CONTENT_RANGE, `${start}-${end}/${totalStr}`);
    }

    // Handle Singular Response
    const acceptHeader = req.get(CONSTANTS.HEADERS.ACCEPT);
    if (acceptHeader && acceptHeader.includes(CONSTANTS.POSTGREST.ACCEPT_SINGULAR)) {
      if (rows.length === 1) {
        return res.status(CONSTANTS.HTTP_STATUS.OK).json(rows[0]);
      } else {
        return res.status(CONSTANTS.HTTP_STATUS.NOT_ACCEPTABLE).json({
          message: CONSTANTS.ERROR_MESSAGES.SINGULAR_RESPONSE_ERROR,
          details: `The result contains ${rows.length} rows`
        });
      }
    }

    res.status(CONSTANTS.HTTP_STATUS.OK).json(rows);
  }

  async nestedList(req, res) {
    const childTable = res.locals._childTable;
    const parentTable = res.locals._parentTable;
    const preferHeader = req.get(CONSTANTS.HEADERS.PREFER);
    const countRequested = preferHeader && preferHeader.includes(CONSTANTS.POSTGREST.PREFER_COUNT_EXACT);

    const result = await this.crudService.nestedList(
      parentTable,
      req.params.id,
      childTable,
      req.query,
      { countTotal: countRequested },
      req.user
    );

    // Set Content-Range Header
    const { rows, offset, limit, totalCount } = result;
    const start = offset;
    const end = start + rows.length - 1;
    const totalStr = totalCount !== null ? totalCount : '*';

    if (rows.length === 0) {
      res.set(CONSTANTS.HEADERS.CONTENT_RANGE, `*/${totalStr}`);
    } else {
      res.set(CONSTANTS.HEADERS.CONTENT_RANGE, `${start}-${end}/${totalStr}`);
    }

    res.status(CONSTANTS.HTTP_STATUS.OK).json(rows);
  }

  async read(req, res) {
    const tableName = res.locals._tableName;
    const pkValues = req.params.id.split('___');

    const results = await this.crudService.read(tableName, pkValues, req.user);
    res.status(CONSTANTS.HTTP_STATUS.OK).json(results);
  }

  async exists(req, res) {
    const tableName = res.locals._tableName;
    const pkValues = req.params.id.split('___');

    const results = await this.crudService.exists(tableName, pkValues, req.user);
    res.status(CONSTANTS.HTTP_STATUS.OK).json(results);
  }

  async update(req, res) {
    const tableName = res.locals._tableName;
    const pkValues = req.params.id.split('___');

    const results = await this.crudService.update(tableName, pkValues, req.body, req.user);
    res.status(CONSTANTS.HTTP_STATUS.OK).json(results);
  }

  async patch(req, res) {
    const tableName = res.locals._tableName;
    const preferHeader = req.get(CONSTANTS.HEADERS.PREFER);
    const returnRepresentation = preferHeader && preferHeader.includes(CONSTANTS.POSTGREST.PREFER_RETURN_REPRESENTATION);

    if (Object.keys(req.body).length === 0) {
      return res.status(CONSTANTS.HTTP_STATUS.NO_CONTENT).send();
    }

    const result = await this.crudService.patch(
      tableName,
      req.query,
      req.body,
      { returnRepresentation },
      req.user
    );

    if (returnRepresentation) {
      return res.status(CONSTANTS.HTTP_STATUS.OK).json(result.results || []);
    }

    res.status(CONSTANTS.HTTP_STATUS.OK).json(result.results || result);
  }

  async delete(req, res) {
    const tableName = res.locals._tableName;
    const preferHeader = req.get(CONSTANTS.HEADERS.PREFER);
    const returnRepresentation = preferHeader && preferHeader.includes(CONSTANTS.POSTGREST.PREFER_RETURN_REPRESENTATION);
    const pkValues = req.params.id ? req.params.id.split('___') : null;

    const result = await this.crudService.delete(
      tableName,
      pkValues,
      req.query,
      { returnRepresentation },
      req.user
    );

    if (returnRepresentation) {
      return res.status(CONSTANTS.HTTP_STATUS.OK).json(result.results);
    }

    res.status(CONSTANTS.HTTP_STATUS.OK).json(result.results);
  }

  async count(req, res) {
    const tableName = res.locals._tableName;
    const results = await this.crudService.count(tableName, req.user);
    res.status(CONSTANTS.HTTP_STATUS.OK).json(results);
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
    if (this.isMultiDatabase()) {
      procName = this.mysql.resolveRoutine(procName, res.locals._schema || null);
    }
    const args = req.body || {};

    try {
      const results = await this.procedureService.call(procName, args, req.user);
      res.status(CONSTANTS.HTTP_STATUS.OK).json(results);
    } catch (error) {
      if (error.message.includes('not found')) {
        return res.status(CONSTANTS.HTTP_STATUS.NOT_FOUND).json({ error: error.message });
      }
      throw error;
    }
  }

  async tableDescribe(req, res) {

    let query = 'describe ??';
    let params = [res.locals._tableName];

    let results = await this.mysql.exec(query, params, req.user);
    res.status(200).json(results);


  }

  async groupBy(req, res) {
    const tableName = res.locals._tableName;

    try {
      const results = await this.aggregationService.groupBy(tableName, req.query, req.user);
      res.status(CONSTANTS.HTTP_STATUS.OK).json(results);
    } catch (error) {
      res.status(CONSTANTS.HTTP_STATUS.BAD_REQUEST).json({ message: error.message });
    }
  }

  async aggregate(req, res) {
    const tableName = res.locals._tableName;

    try {
      const results = await this.aggregationService.aggregate(tableName, req.query, req.user);
      res.status(CONSTANTS.HTTP_STATUS.OK).json(results);
    } catch (error) {
      res.status(CONSTANTS.HTTP_STATUS.BAD_REQUEST).json({ message: error.message });
    }
  }


  /**************** START : files related ****************/
  downloadFile(req, res) {
    try {
      const filePath = this.fileService.getDownloadPath(req.query.name);
      res.download(filePath);
    } catch (error) {
      res.status(CONSTANTS.HTTP_STATUS.BAD_REQUEST).json({ error: error.message });
    }
  }

  uploadFile(req, res) {
    try {
      const result = this.fileService.uploadFile(req.file);
      console.log(result.path);
      res.end(result.path);
    } catch (error) {
      res.end(CONSTANTS.ERROR_MESSAGES.UPLOAD_FAILED);
    }
  }

  uploadFiles(req, res) {
    try {
      const result = this.fileService.uploadFiles(req.files);
      res.end(result.paths.toString());
    } catch (error) {
      res.end(CONSTANTS.ERROR_MESSAGES.UPLOAD_FAILED);
    }
  }

  /**************** END : files related ****************/

}


//expose class
module.exports = Xapi;

'use strict';

var Xsql = require('./xsql.js');
var multer = require('multer');
var path = require('path');
var openapiHelper = require('./util/openapi.helper.js');

// Import refactored modules
const createJwtMiddleware = require('./adapters/middleware/jwtMiddleware.js');
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
    this.fileService = new FileService(); // Stateless, can initialize now
    this.routeDiscoveryService = null;

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

      // Initialize all services after mysql is ready
      this.crudService = new CrudService(this.mysql, this.mysql.rlsService);
      this.aggregationService = new AggregationService(this.mysql);
      this.procedureService = new ProcedureService(this.mysql);
      this.routeDiscoveryService = new RouteDiscoveryService(this.mysql.metaDb, this.config);

      // Use refactored middleware
      if (this.config.jwtSecret) {
        this.app.use(createJwtMiddleware(this.config));
      }
      this.app.use(urlMiddleware)
      this.setupRoutes()
      this.app.use(errorMiddleware)
      cbk(err, results)

    })

  }

  root(req, res) {
    const baseUrl = req.protocol + '://' + req.get('host') + '/api/';
    const routes = this.routeDiscoveryService.getAllRoutes(baseUrl);
    res.json(routes)
  }

  setupRoutes() {

    // show routes for database schema
    this.app.get('/', asyncMiddleware(this.root.bind(this)))

    // show all resouces
    this.app.route('/api/tables')
      .get(asyncMiddleware(this.tables.bind(this)));


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
    const tableName = req.app.locals._tableName;
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
    const tableName = req.app.locals._tableName;
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
    const childTable = req.app.locals._childTable;
    const parentTable = req.app.locals._parentTable;
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
    const tableName = req.app.locals._tableName;
    const pkValues = req.params.id.split('___');

    const results = await this.crudService.read(tableName, pkValues, req.user);
    res.status(CONSTANTS.HTTP_STATUS.OK).json(results);
  }

  async exists(req, res) {
    const tableName = req.app.locals._tableName;
    const pkValues = req.params.id.split('___');

    const results = await this.crudService.exists(tableName, pkValues, req.user);
    res.status(CONSTANTS.HTTP_STATUS.OK).json(results);
  }

  async update(req, res) {
    const tableName = req.app.locals._tableName;
    const pkValues = req.params.id.split('___');

    const results = await this.crudService.update(tableName, pkValues, req.body, req.user);
    res.status(CONSTANTS.HTTP_STATUS.OK).json(results);
  }

  async patch(req, res) {
    const tableName = req.app.locals._tableName;
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
    const tableName = req.app.locals._tableName;
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
    const tableName = req.app.locals._tableName;
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
    const procName = req.params.procName;
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
    let params = [req.app.locals._tableName];

    let results = await this.mysql.exec(query, params, req.user);
    res.status(200).json(results);


  }

  async groupBy(req, res) {
    const tableName = req.app.locals._tableName;

    try {
      const results = await this.aggregationService.groupBy(tableName, req.query, req.user);
      res.status(CONSTANTS.HTTP_STATUS.OK).json(results);
    } catch (error) {
      res.status(CONSTANTS.HTTP_STATUS.BAD_REQUEST).json({ message: error.message });
    }
  }

  async aggregate(req, res) {
    const tableName = req.app.locals._tableName;

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

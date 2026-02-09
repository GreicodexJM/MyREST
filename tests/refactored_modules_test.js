'use strict';

const should = require('should');
const createJwtMiddleware = require('../lib/adapters/middleware/jwtMiddleware.js');
const urlMiddleware = require('../lib/adapters/middleware/urlMiddleware.js');
const errorMiddleware = require('../lib/adapters/middleware/errorMiddleware.js');
const asyncMiddleware = require('../lib/adapters/middleware/asyncMiddleware.js');
const RlsService = require('../lib/domain/services/RlsService.js');
const CONSTANTS = require('../lib/domain/constants.js');

describe('Refactored Modules Tests', function() {

  describe('Constants Module', function() {
    it('should have pagination defaults', function() {
      CONSTANTS.PAGINATION.DEFAULT_PAGE_SIZE.should.equal(20);
      CONSTANTS.PAGINATION.MAX_PAGE_SIZE.should.equal(100);
      CONSTANTS.PAGINATION.DEFAULT_OFFSET.should.equal(0);
    });

    it('should have HTTP status codes', function() {
      CONSTANTS.HTTP_STATUS.OK.should.equal(200);
      CONSTANTS.HTTP_STATUS.CREATED.should.equal(201);
      CONSTANTS.HTTP_STATUS.BAD_REQUEST.should.equal(400);
      CONSTANTS.HTTP_STATUS.UNAUTHORIZED.should.equal(401);
    });

    it('should have RLS operations', function() {
      CONSTANTS.RLS_OPERATIONS.SELECT.should.equal('SELECT');
      CONSTANTS.RLS_OPERATIONS.INSERT.should.equal('INSERT');
      CONSTANTS.RLS_OPERATIONS.UPDATE.should.equal('UPDATE');
      CONSTANTS.RLS_OPERATIONS.DELETE.should.equal('DELETE');
    });
  });

  describe('URL Middleware', function() {
    it('should extract table name from simple route', function() {
      const req = {
        originalUrl: '/api/users?_where=(id,eq,1)',
        app: { locals: {} }
      };
      const res = {};
      const next = function() {};

      urlMiddleware(req, res, next);
      
      req.app.locals._tableName.should.equal('users');
    });

    it('should extract parent and child tables from relational route', function() {
      const req = {
        originalUrl: '/api/users/123/posts',
        app: { locals: {} }
      };
      const res = {};
      const next = function() {};

      urlMiddleware(req, res, next);
      
      req.app.locals._parentTable.should.equal('users');
      req.app.locals._childTable.should.equal('posts');
    });

    it('should not set table names for non-API routes', function() {
      const req = {
        originalUrl: '/some/other/route',
        app: { locals: {} }
      };
      const res = {};
      const next = function() {};

      urlMiddleware(req, res, next);
      
      should.not.exist(req.app.locals._tableName);
      should.not.exist(req.app.locals._parentTable);
    });
  });

  describe('Async Middleware', function() {
    it('should wrap async function and call next on rejection', function(done) {
      const asyncFn = async (req, res, next) => {
        throw new Error('Test error');
      };

      const wrapped = asyncMiddleware(asyncFn);
      
      const req = {};
      const res = {};
      const next = function(err) {
        err.should.be.an.Error();
        err.message.should.equal('Test error');
        done();
      };

      wrapped(req, res, next);
    });

    it('should allow async functions to complete normally', function(done) {
      const asyncFn = async (req, res, next) => {
        req.testValue = 'success';
        next();
      };

      const wrapped = asyncMiddleware(asyncFn);
      
      const req = {};
      const res = {};
      const next = function() {
        req.testValue.should.equal('success');
        done();
      };

      wrapped(req, res, next);
    });
  });

  describe('Error Middleware', function() {
    it('should handle errors with code property', function() {
      const err = { code: 'ER_DUP_ENTRY', message: 'Duplicate entry' };
      const req = {};
      const res = {
        status: function(code) {
          code.should.equal(400);
          return this;
        },
        json: function(body) {
          body.should.have.property('error');
          body.error.code.should.equal('ER_DUP_ENTRY');
        }
      };
      const next = function() {};

      errorMiddleware(err, req, res, next);
    });

    it('should handle errors with message property', function() {
      const err = new Error('Something went wrong');
      const req = {};
      const res = {
        status: function(code) {
          code.should.equal(500);
          return this;
        },
        json: function(body) {
          body.should.have.property('error');
          body.error.should.match(/Internal server error/);
        }
      };
      const next = function() {};

      errorMiddleware(err, req, res, next);
    });
  });

  describe('JWT Middleware', function() {
    it('should throw error if no secret provided', function() {
      (function() {
        createJwtMiddleware({});
      }).should.throw();
    });

    it('should create middleware with valid config', function() {
      const middleware = createJwtMiddleware({ jwtSecret: 'test-secret' });
      middleware.should.be.a.Function();
    });

    it('should proceed without token when JWT not required', function(done) {
      const middleware = createJwtMiddleware({ 
        jwtSecret: 'test-secret',
        jwtRequired: false 
      });

      const req = { headers: {} };
      const res = {};
      const next = function() {
        done();
      };

      middleware(req, res, next);
    });

    it('should return 401 when JWT required but not provided', function(done) {
      const middleware = createJwtMiddleware({ 
        jwtSecret: 'test-secret',
        jwtRequired: true 
      });

      const req = { headers: {} };
      const res = {
        status: function(code) {
          code.should.equal(401);
          return this;
        },
        json: function(body) {
          body.error.should.match(/Token required/);
          done();
        }
      };
      const next = function() {};

      middleware(req, res, next);
    });
  });

  describe('RLS Service', function() {
    let rlsService;
    let mockPool;

    beforeEach(function() {
      mockPool = {
        query: function(sql, params, callback) {
          // Mock empty result
          callback(null, []);
        }
      };
      rlsService = new RlsService(mockPool);
    });

    it('should initialize with empty policies', function() {
      rlsService.rlsPolicies.should.be.an.Object();
      Object.keys(rlsService.rlsPolicies).length.should.equal(0);
    });

    it('should return null for table without policies', function() {
      const clause = rlsService.getPolicyWhereClause('users', 'SELECT');
      should.not.exist(clause);
    });

    it('should build WHERE clause from policies', function() {
      // Manually inject a policy for testing
      rlsService.rlsPolicies = {
        users: {
          SELECT: [
            { using_expression: 'user_id = @request_jwt_claim_sub' }
          ],
          INSERT: [],
          UPDATE: [],
          DELETE: []
        }
      };

      const clause = rlsService.getPolicyWhereClause('users', 'SELECT');
      clause.should.equal('(user_id = @request_jwt_claim_sub)');
    });

    it('should combine multiple policies with AND', function() {
      rlsService.rlsPolicies = {
        users: {
          SELECT: [
            { using_expression: 'user_id = @request_jwt_claim_sub' },
            { using_expression: 'active = TRUE' }
          ],
          INSERT: [],
          UPDATE: [],
          DELETE: []
        }
      };

      const clause = rlsService.getPolicyWhereClause('users', 'SELECT');
      clause.should.equal('(user_id = @request_jwt_claim_sub) AND (active = TRUE)');
    });

    it('should inject policy into empty WHERE clause', function() {
      rlsService.rlsPolicies = {
        users: {
          SELECT: [
            { using_expression: 'user_id = @request_jwt_claim_sub' }
          ],
          INSERT: [],
          UPDATE: [],
          DELETE: []
        }
      };

      const whereObj = { query: '', params: [] };
      rlsService.injectPolicyIntoWhere(whereObj, 'users', 'SELECT', ' where ');
      
      // Note: getPolicyWhereClause wraps each policy in parentheses
      whereObj.query.should.equal(' where (user_id = @request_jwt_claim_sub)');
    });

    it('should inject policy into existing WHERE clause', function() {
      rlsService.rlsPolicies = {
        users: {
          SELECT: [
            { using_expression: 'user_id = @request_jwt_claim_sub' }
          ],
          INSERT: [],
          UPDATE: [],
          DELETE: []
        }
      };

      const whereObj = { query: ' where status = ?', params: ['active'] };
      rlsService.injectPolicyIntoWhere(whereObj, 'users', 'SELECT', ' where ');
      
      // The regex replace wraps the RLS clause in additional parens for grouping
      whereObj.query.should.equal(' where ((user_id = @request_jwt_claim_sub)) AND status = ?');
    });

    it('should build WHERE with policy for single record operations', function() {
      rlsService.rlsPolicies = {
        users: {
          SELECT: [
            { using_expression: 'user_id = @request_jwt_claim_sub' }
          ],
          INSERT: [],
          UPDATE: [],
          DELETE: []
        }
      };

      const result = rlsService.buildWhereWithPolicy('users', 'SELECT', 'id = 123');
      // buildWhereWithPolicy wraps the entire RLS clause (which is already wrapped) in parens
      result.should.equal('((user_id = @request_jwt_claim_sub)) AND id = 123');
    });

    it('should return original clause when no policy exists', function() {
      const result = rlsService.buildWhereWithPolicy('users', 'SELECT', 'id = 123');
      result.should.equal('id = 123');
    });
  });

});

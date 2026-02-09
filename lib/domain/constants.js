'use strict';

/**
 * Application-wide constants
 * Centralized configuration values to avoid magic numbers/strings
 */

module.exports = {
  // Pagination defaults
  PAGINATION: {
    DEFAULT_PAGE_SIZE: 20,
    MAX_PAGE_SIZE: 100,
    DEFAULT_OFFSET: 0
  },

  // HTTP Headers
  HEADERS: {
    AUTHORIZATION: 'authorization',
    PREFER: 'Prefer',
    ACCEPT: 'Accept',
    RESOLUTION: 'Resolution',
    CONTENT_RANGE: 'Content-Range'
  },

  // PostgREST Header Values
  POSTGREST: {
    PREFER_COUNT_EXACT: 'count=exact',
    PREFER_RETURN_REPRESENTATION: 'return=representation',
    ACCEPT_SINGULAR: 'application/vnd.pgrst.object+json',
    RESOLUTION_MERGE: 'merge-duplicates',
    RESOLUTION_IGNORE: 'ignore-duplicates'
  },

  // RLS Operations
  RLS_OPERATIONS: {
    SELECT: 'SELECT',
    INSERT: 'INSERT',
    UPDATE: 'UPDATE',
    DELETE: 'DELETE',
    ALL: 'ALL'
  },

  // RLS Table Configuration
  RLS_TABLE: {
    NAME: '_rls_policies',
    SCHEMA: `CREATE TABLE IF NOT EXISTS _rls_policies (
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
    )`
  },

  // Route Types
  ROUTE_TYPES: {
    LIST: 'list',
    CREATE: 'create',
    READ: 'read',
    UPDATE: 'update',
    PATCH: 'patch',
    DELETE: 'delete',
    EXISTS: 'exists',
    COUNT: 'count',
    DESCRIBE: 'describe',
    RELATIONAL: 'relational',
    GROUPBY: 'groupby',
    AGGREGATE: 'aggregate'
  },

  // HTTP Methods
  HTTP_METHODS: {
    GET: 'get',
    POST: 'post',
    PUT: 'put',
    PATCH: 'patch',
    DELETE: 'delete'
  },

  // Data Types
  DATA_TYPES: {
    STRING: ['varchar', 'text', 'char', 'tinytext', 'mediumtext', 'longtext', 
             'blob', 'mediumblob', 'longblob', 'tinyblob', 'binary', 'varbinary'],
    INTEGER: ['int', 'long', 'smallint', 'mediumint', 'bigint', 'tinyint'],
    FLOAT: ['float', 'double', 'decimal'],
    DATE: ['date', 'datetime', 'timestamp', 'time', 'year'],
    JSON: ['json']
  },

  // Column Type Results
  COLUMN_TYPES: {
    STRING: 'string',
    INT: 'int',
    FLOAT: 'float',
    DATE: 'date',
    JSON: 'json'
  },

  // API Paths
  API_PATHS: {
    PREFIX: '/api',
    TABLES: '/api/tables',
    RPC: '/rpc/:procName',
    OPENAPI: '/api/openapi.json',
    DYNAMIC: '/dynamic*',
    UPLOAD: '/upload',
    UPLOADS: '/uploads',
    DOWNLOAD: '/download'
  },

  // Query Parameters
  QUERY_PARAMS: {
    WHERE: '_where',
    FIELDS: '_fields',
    SELECT: 'select',
    SORT: '_sort',
    ORDER: 'order',
    PAGE: '_p',
    SIZE: '_size',
    LIMIT: 'limit',
    OFFSET: 'offset'
  },

  // Error Messages
  ERROR_MESSAGES: {
    COMPOSITE_KEY_MISSING: 'Table is made of composite primary keys - all keys were not in input',
    UNAUTHORIZED_INVALID_TOKEN: 'Unauthorized: Invalid token',
    UNAUTHORIZED_TOKEN_REQUIRED: 'Unauthorized: Token required',
    FUNCTION_NOT_FOUND: 'Function {0} not found',
    MISSING_FIELDS_PARAM: 'Missing _fields query params eg: /api/tableName/groupby?_fields=column1',
    MISSING_NUMERIC_FIELDS: 'Missing _fields in query params eg: /api/tableName/groupby?_fields=numericColumn1',
    UPLOAD_FAILED: 'upload failed',
    SINGULAR_RESPONSE_ERROR: 'JSON object requested, multiple (or no) rows returned',
    INTERNAL_SERVER_ERROR: 'Internal server error : {0}'
  },

  // HTTP Status Codes
  HTTP_STATUS: {
    OK: 200,
    CREATED: 201,
    NO_CONTENT: 204,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    NOT_FOUND: 404,
    NOT_ACCEPTABLE: 406,
    INTERNAL_SERVER_ERROR: 500
  }
};

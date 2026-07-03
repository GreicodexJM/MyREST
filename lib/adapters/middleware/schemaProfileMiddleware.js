'use strict';

const { NotAcceptableError } = require('../../domain/errors');

/**
 * Schema Profile Middleware (multi-database mode only)
 *
 * Implements PostgREST schema selection semantics so one MyREST instance
 * can serve several MySQL databases on the same server:
 *
 * - `Accept-Profile` header selects the database for GET/HEAD requests
 * - `Content-Profile` header selects the database for data-modifying requests
 *   (this is exactly what @supabase/postgrest-js sends for
 *   `createClient(url, key, { db: { schema } })` or `.schema(name)`)
 * - An unknown/system schema in a profile header responds 406 (PostgREST behavior)
 *
 * Table names extracted by urlMiddleware (res.locals) are resolved to
 * qualified `db.table` metaDb keys:
 * 1. Explicit `db.table` names are validated and used as-is
 * 2. Otherwise the profile header schema scopes the lookup
 * 3. Otherwise a name matching exactly one database resolves to it;
 *    colliding names must be qualified (400 with the candidate list)
 *
 * Relational routes resolve the child within the parent's database —
 * foreign keys never cross databases here.
 *
 * @param {Object} mysql - Xsql instance (provides resolveTable/resolveRoutine)
 * @param {Object} config - Configuration with `databases` allowlist
 * @returns {Function} Express middleware
 */
function createSchemaProfileMiddleware(mysql, config) {
  const allowed = new Set(config.databases);
  // Literal /api/<segment> endpoints that are not table names
  const RESERVED_SEGMENTS = new Set(['tables', 'schema', 'openapi.json']);

  return function schemaProfileMiddleware(req, res, next) {
    try {
      const headerName = (req.method === 'GET' || req.method === 'HEAD')
        ? 'accept-profile'
        : 'content-profile';

      let profile = req.headers[headerName];
      if (profile !== undefined && profile !== '') {
        profile = String(profile).trim();
        if (!allowed.has(profile)) {
          throw new NotAcceptableError(
            `Schema '${profile}' is not exposed by this gateway. Exposed databases: ${config.databases.join(', ')}`
          );
        }
      } else {
        profile = null;
      }

      res.locals._schema = profile;

      if (res.locals._parentTable) {
        res.locals._parentTable = mysql.resolveTable(res.locals._parentTable, profile);
        // Child tables live in the parent's database (FKs are same-database)
        const parentSchema = res.locals._parentTable.split('.')[0];
        res.locals._childTable = mysql.resolveTable(res.locals._childTable, profile || parentSchema);
      } else if (res.locals._tableName && !RESERVED_SEGMENTS.has(res.locals._tableName)) {
        res.locals._tableName = mysql.resolveTable(res.locals._tableName, profile);
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = createSchemaProfileMiddleware;

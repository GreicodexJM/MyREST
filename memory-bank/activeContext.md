# Active Context

## Current Focus
- PostgREST compatibility enhancements.
- Bug fixes for JSON column handling and foreign key relationship queries.

## Recent Changes
- **Fixed JSON Column Serialization Bug**: Resolved issue where JavaScript objects were converted to `'[object Object]'` instead of proper JSON strings for JSON-type columns.
  - Added `serializeJsonColumns()` helper in `lib/util/data.helper.js` to properly serialize objects/arrays to JSON strings.
  - Updated `create()`, `update()`, and `patch()` methods in `lib/xapi.js` to pre-process request bodies.
  - Supports both single and bulk insert operations.
  - Added comprehensive unit tests in `tests/json_serialization_test.js`.
  - **Resolved**: `INSERT INTO table SET template_config = '[object Object]'` now correctly generates `template_config = '{"key":"value"}'`.
- **Fixed PostgREST FK Hint Syntax Bug**: Implemented support for explicit foreign key hints using `column:table(fields)` syntax.
  - Updated `lib/util/selectParser.helper.js` to parse hint syntax (e.g., `trading_partner_id:trading_partner_templates(*)`).
  - Modified `lib/xsql.js` `getNestedQuery()` to accept and use explicit FK hints for relationship resolution.
  - Updated `resolveSelectColumns()` and `resolveSelectColumnsForJson()` to pass hints to nested query builder.
  - Added comprehensive unit tests in `tests/postgrest_fk_hint_test.js`.
  - **Resolved**: SQL syntax error `NULL AS trading_partner:trading_partner_templates` now correctly generates `NULL AS trading_partner_templates`.
- Updated `docker-compose.yml` to include `xmysql` service.
- Added `jsonwebtoken` dependency.
- Updated CLI (`lib/util/cmd.helper.js`) to accept `--jwtSecret`.
- Implemented JWT verification middleware in `lib/xapi.js`.
- Refactored `lib/xsql.js` `exec` method to handle connection context and inject JWT claims as MySQL session variables (e.g., `@request_jwt_claim_role`).
- Updated all SQL execution calls in `lib/xapi.js` to pass JWT claims.
- Added RPC (Stored Procedure) support via `POST /rpc/:procName`.
- Added OpenAPI 3.0 specification generation at `/api/openapi.json`.

## Next Steps
- Verify end-to-end with a running database using Docker Compose.
- Consider adding Role-Based Access Control (RBAC) helpers in the future.

## Active Decisions
- Emulating PostgREST's RLS mechanism by using MySQL Session Variables (`SET @var = val`) scoped to the connection for each request.
- Using `pool.getConnection()` instead of `pool.query()` when claims are present to ensure variable scope.

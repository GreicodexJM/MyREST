# Active Context

## Current Focus
- **Code Refactoring**: Completed Phases 1, 2, and 3 refactoring - major architectural improvement.
- **CORS Middleware**: Implemented comprehensive CORS support with environment variable configuration.
- PostgREST compatibility enhancements.
- RLS (Row Level Security) improvements and automation.
- Bug fixes for JSON column handling and foreign key relationship queries.

## Recent Changes

### Complete Refactoring - Phases 1, 2, 3 (Completed)

**Phase 1: Foundation Refactoring**
1. **Extracted Constants Module** (`lib/domain/constants.js`):
   - Centralized all magic numbers and strings
   - 150+ constants organized by category
   
2. **Extracted Middleware Modules** (`lib/adapters/middleware/`):
   - `jwtMiddleware.js`, `urlMiddleware.js`, `errorMiddleware.js`, `asyncMiddleware.js`
   - Each follows Single Responsibility Principle
   
3. **Created RLS Service** (`lib/domain/services/RlsService.js`):
   - Eliminated ~100 lines of duplicate RLS code
   - Centralized policy management

**Phase 2: Query Builder Extraction**
- **Created QueryBuilderService** (`lib/domain/services/QueryBuilderService.js`):
  - Extracted all SQL query construction logic from `lib/xsql.js`
  - ~200 lines of query building moved to dedicated service
  - Methods: getLimitClause, getOrderByClause, getColumnsForSelectStmt, resolveSelectColumns, getNestedQuery, etc.
  - `lib/xsql.js` now delegates to QueryBuilderService

**Phase 3: CRUD Service Extraction**
- **Created CrudService** (`lib/domain/services/CrudService.js`):
  - Separated all CRUD business logic from HTTP layer
  - ~400 lines moved from `lib/xapi.js` to service
  - Methods: create, list, read, exists, update, patch, delete, count, nestedList
  - `lib/xapi.js` reduced from 800+ to ~400 lines (50% reduction)
  - Controllers now thin wrappers: extract data → call service → format response

**Testing & Documentation:**
- Added comprehensive tests in `tests/refactored_modules_test.js`
- Updated `docs/REFACTORING_GUIDE.md` with all three phases
- **All 218 tests passing** ✅

**Overall Impact:**
- ~850 lines refactored into 8 new service/middleware modules
- Clear layered architecture: HTTP → Services → Data Access
- Follows Hexagonal Architecture and SOLID principles
- 100% backward compatible, zero breaking changes

- **Auto-Create RLS Policies Table**: Implemented automatic creation of `_rls_policies` table during gateway initialization.
  - Added `ensureRlsPoliciesTable()` method to `lib/xsql.js` that creates the table if it doesn't exist.
  - Integrated into `init()` flow to run before `loadRlsPolicies()`.
  - Uses `CREATE TABLE IF NOT EXISTS` for idempotent operation.
  - Gracefully handles creation failures without blocking startup.
  - Added console logging: "RLS policies table ready" on success.
  - Updated `docs/SECURITY_RLS.md` to reflect automatic table creation.
  - **Resolved**: Zero-configuration setup for RLS - users no longer need to manually create the policies table.
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
- Updated `docker-compose.yml` to include `myrest` service.
- Added `jsonwebtoken` dependency.
- Updated CLI (`lib/util/cmd.helper.js`) to accept `--jwtSecret`.
- Implemented JWT verification middleware in `lib/xapi.js`.
- Refactored `lib/xsql.js` `exec` method to handle connection context and inject JWT claims as MySQL session variables (e.g., `@request_jwt_claim_role`).
- Updated all SQL execution calls in `lib/xapi.js` to pass JWT claims.
- Added RPC (Stored Procedure) support via `POST /rpc/:procName`.
- Added OpenAPI 3.0 specification generation at `/api/openapi.json`.

### CORS Middleware Implementation (Completed)
- **Installed CORS Package**: Added `cors` npm package as dependency.
- **Created CORS Middleware** (`lib/adapters/middleware/corsMiddleware.js`):
  - Follows Hexagonal Architecture pattern consistent with other middleware
  - Configurable via environment variables or CLI parameters
  - Supports multiple origins (comma-separated list)
  - Intelligent origin parsing: `*` for all, single URL, or array of URLs
  - Default configuration optimized for PostgREST headers (Prefer, Range, Resolution, Content-Range)
  - Console logging for CORS configuration on startup
- **Updated CLI Helper** (`lib/util/cmd.helper.js`):
  - Added 6 new CLI parameters: `--corsOrigin`, `--corsMethods`, `--corsAllowedHeaders`, `--corsExposedHeaders`, `--corsCredentials`, `--corsMaxAge`
  - Default: Allow all origins (`*`) for development convenience
  - All parameters support environment variable equivalents (e.g., `CORS_ORIGIN`)
- **Integrated into Xapi** (`lib/xapi.js`):
  - CORS middleware applied first in middleware chain (before JWT, URL middleware)
  - Ensures preflight OPTIONS requests are handled correctly
  - Import added: `createCorsMiddleware`
- **Comprehensive Documentation** (`docs/CORS_CONFIGURATION.md`):
  - Complete guide with quick start, configuration options, usage examples
  - Security best practices (never use `*` in production, credentials handling)
  - Troubleshooting section with common CORS errors and solutions
  - Testing examples (browser console, cURL)
  - Docker Compose configuration examples
- **Updated README.md**:
  - Added CORS Configuration section with quick examples
  - Updated CLI options list to include all CORS parameters
  - Added environment variables section for Docker usage
  - Link to comprehensive CORS documentation
- **Testing**:
  - All existing tests still pass (22 unit tests ✅)
  - CORS middleware ready for integration testing with browsers
- **Zero Breaking Changes**: CORS enabled by default with permissive settings for backward compatibility

**Implementation follows SOLID principles:**
- Single Responsibility: CORS middleware only handles CORS concerns
- Open/Closed: Extensible via configuration without modifying code
- Dependency Inversion: Configuration injected via config object

## Next Steps
- Consider Phase 4 refactoring: Extract Repositories for database abstraction
- Consider Phase 5 refactoring: Further extract controllers
- Potential enhancements: Input validation layer, performance optimizations

## Active Decisions
- Emulating PostgREST's RLS mechanism by using MySQL Session Variables (`SET @var = val`) scoped to the connection for each request.
- Using `pool.getConnection()` instead of `pool.query()` when claims are present to ensure variable scope.

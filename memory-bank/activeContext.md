# Active Context

## Current Focus
- Adding Docker Compose configuration for local testing.
- Implementing Security and Row Level Security (RLS) for MySQL.
- PostgREST compatibility.

## Recent Changes
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

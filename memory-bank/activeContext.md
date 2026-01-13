# Active Context

## Current Focus
Preparing for the migration to a **PostgREST-compatible API**. The goal is to make the API 100% compatible with PostgREST access patterns and SDKs.

## Recent Changes
-   **SDK Verification**: Verified compatibility with `@supabase/postgrest-js` client SDK.
-   **Response Format**:
    -   Implemented `Content-Range` header and `Prefer: count=exact`.
    -   Implemented `Prefer: return=representation` for `POST`.
    -   Implemented `Accept: application/vnd.pgrst.object+json` for singular object responses (`.single()` in SDK).
-   **Methods**:
    -   Added `PATCH` support for horizontal updates (bulk/filter-based updates).
    -   Fixed `select=*` handling.
-   **Modern Database Support**: Successfully migrated from `mysql` to `mysql2`.

## Active Decisions
-   **Response Headers**: `Content-Range` is returned for list endpoints.
-   **Singular Responses**: API returns a plain JSON object (instead of array) when `Accept: application/vnd.pgrst.object+json` is present and result count is 1. Returns 406 otherwise.
-   **Patch**: Implemented `PATCH` method to support PostgREST update style (query params for filtering, body for values).
-   **Migration Strategy**: Implemented `postgrestWhereClause.helper.js` to handle PostgREST-style query parameters and integrated it into `xsql.js`.

## Current State
-   Driver update (`mysql2`) is complete.
-   PostgREST syntax support implemented for filtering, ordering, pagination.
-   Response format updated to match PostgREST expectations.
-   Integration tests for PostgREST features passed (75 tests passing).
-   SDK compatibility verified with standard operations (select, insert, update, filters, pagination).

## Next Steps
-   Refactor/Cleanup old syntax support if we decide to drop it.
-   Consider implementing `rpc` (Stored Procedures) endpoint if needed (Postponed).

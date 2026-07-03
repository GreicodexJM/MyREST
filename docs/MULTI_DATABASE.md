# Multi-Database Mode

One MyREST instance can serve **multiple MySQL databases on the same server/cluster**, removing the need to deploy one container per database. Schema selection follows PostgREST semantics, so Supabase SDK compatibility is preserved.

## Enabling

```bash
myrest -h dbhost -u user -p pass --databases editor_db,reports_db,billing_db
# or in Docker:
docker run -e DATABASE_URL='mysql://user:pass@dbhost:3306/editor_db' \
           -e DATABASES='editor_db,reports_db,billing_db' \
           greicodex/myrest
```

- `--databases` (env `DATABASES`) is an explicit allowlist. System schemas (`mysql`, `information_schema`, `performance_schema`, `sys`) are rejected at startup.
- `--database` / the `DATABASE_URL` path remains the connection's default schema and is automatically part of the allowlist.
- Without `--databases`, MyREST behaves exactly as before (single-database mode, no behavioral changes).

## Selecting a database per request

Three mechanisms, checked in this order:

### 1. Explicit `db.table` names

```
GET  /api/reports_db.messages
POST /api/editor_db.documents
```

Works everywhere a table name appears. Required **only** for table names that exist in more than one database when no profile header is sent.

### 2. PostgREST profile headers (Supabase SDK native)

- `Accept-Profile: <db>` — GET/HEAD requests
- `Content-Profile: <db>` — POST/PUT/PATCH/DELETE and RPC

This is what the Supabase SDK sends:

```js
// per-client default database
const supabase = createClient(url, key, { db: { schema: 'reports_db' } });

// or per query
supabase.schema('editor_db').from('documents').select('*');
```

An unknown or system schema in a profile header returns **406** (PostgREST behavior).

### 3. Unqualified names (unique match)

A bare table name that exists in exactly one exposed database resolves to it automatically. If the name exists in several databases the request fails with **400** listing the qualified candidates — no guessing (fail-loudly policy).

## Semantics

- **Relations/embedding**: foreign keys and PostgREST resource embedding (`select=*,customers(*)`) operate within one database. Embedded resources resolve in the primary table's database. Cross-database FKs are not captured.
- **RLS**: each database gets its own `_rls_policies` table, auto-created at startup. Policies apply to that database's tables.
- **RPC**: `/rpc/:procName` resolves procedures with the same rules (`db.proc`, `Content-Profile`, or unique match).
- **Schema refresh**: `POST /api/schema/refresh` (and the 60s auto-refresh) reloads all databases. In multi-database mode, tables created after startup become routable immediately after a refresh.
- **OpenAPI / route listing**: resources are reported with qualified names.

## Compatibility notes

- Existing single-database deployments are unaffected — the mode only activates with `--databases`.
- The MySQL user must have privileges on every exposed database.
- Grant-level isolation between databases is the MySQL user's responsibility; all exposed databases share the gateway's credentials and JWT configuration. Use separate instances when tenants must not share a credential boundary.

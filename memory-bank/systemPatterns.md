# System Patterns

## Architecture
The application follows a layered architecture, separating the HTTP interface, business logic (route handling), and data access.

### Components
1.  **Entry Point (`index.js`, `bin/index.js`)**:
    -   Parses CLI arguments using `commander`.
    -   Initializes Express app.
    -   Creates MySQL connection pool.
    -   Instantiates `Xapi`.

2.  **API Layer (`lib/xapi.js`)**:
    -   **`Xapi` Class**:
        -   Initializes middleware (`urlMiddleware`, `errorMiddleware`).
        -   Setup routes dynamically based on schema (`setupRoutes`).
        -   Implements Request Handlers (`list`, `read`, `create`, `update`, `delete`, `nestedList`, etc.).
        -   Handles file upload/download using `multer`.

3.  **Data Access Layer (`lib/xsql.js`)**:
    -   **`Xsql` Class**:
        -   **Introspection**: Queries `information_schema` to build an in-memory representation of the database (`metaDb`), including tables, columns, primary keys, and foreign keys.
        -   **Query Building**: Dynamically constructs SQL strings based on input parameters (where clauses, sorting, limits).
        -   **Execution**: Wraps `mysql` pool `query` method in a Promise.

4.  **Utilities (`lib/util/`)**:
    -   `cmd.helper.js`: Handles command-line arguments.
    -   `whereClause.helper.js`: Parses URL `_where` parameters into SQL WHERE clauses.
    -   `data.helper.js`: Helper functions for array/object manipulation.

## Key Design Decisions
-   **Dynamic Routing**: Routes are not hardcoded. They are generated at runtime based on the database schema.
-   **Schema Caching**: Database schema is read once at startup and cached in `Xsql.metaDb` to avoid repeated metadata queries.
-   **URL-to-SQL Mapping**: A custom DSL in URL parameters (e.g., `_where=(col,eq,val)`) maps directly to SQL operations.
-   **Express Middleware**: Used for extracting table names from URLs (`urlMiddleware`) and global error handling.

## Data Flow
1.  **Startup**: `Xapi` initializes `Xsql` -> `Xsql` reads DB schema -> `Xapi` generates routes.
2.  **Request**:
    -   User hits `/api/users?_where=(id,eq,1)`.
    -   `urlMiddleware` identifies `_tableName` as `users`.
    -   `Xapi.list` is invoked.
    -   `Xapi` calls `Xsql.getColumnsForSelectStmt`, `Xsql.getWhereClause`, `Xsql.getOrderByClause`, `Xsql.getLimitClause`.
    -   `Xsql` builds the SQL query.
    -   `Xsql` executes query.
    -   `Xapi` returns JSON response.

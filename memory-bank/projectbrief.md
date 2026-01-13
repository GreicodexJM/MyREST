# Project Brief: MyREST (xmysql)

MyREST (based on `xmysql`) is a command-line tool that automatically generates a RESTful API for any MySQL database. It inspects the database schema and provides endpoints for CRUD operations, complex queries, and file handling without requiring manual boilerplate code.

## Core Features
-   **Zero Configuration**: Connects to a MySQL database and serves APIs instantly.
-   **CRUD Operations**: Automatic `GET`, `POST`, `PUT`, `DELETE` routes for all tables.
-   **Advanced Querying**:
    -   Pagination (`_p`, `_size`)
    -   Sorting (`_sort`)
    -   Column filtering (`_fields`)
    -   Row filtering (`_where`) with comparison and logical operators.
    -   Group By and Aggregate functions.
-   **Relationships**: Automatic detection of foreign keys to provide nested routes (e.g., `/api/parent/id/child`).
-   **Dynamic Queries**: Support for running raw SQL queries via API (local only).
-   **File Handling**: Upload and download capabilities (local only).
-   **Docker Support**: Ready-to-use Docker container.

## Goals
-   Provide a "magic" solution for generating APIs from existing legacy databases.
-   Support rapid prototyping and development.
-   Maintain simplicity in setup and usage.
-   **PostgREST Compatibility**: Migrate the API to be 100% compatible with PostgREST standards and SDKs, enabling the use of the extensive PostgREST ecosystem with MySQL databases.
-   **Modern Database Support**: Ensure full compatibility with modern MySQL flavors, including MySQL 8+ and MariaDB, supporting newer authentication plugins and features.

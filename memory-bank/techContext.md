# Tech Context

## Core Technologies
-   **Node.js**: Engine (Requires >= 7.6.0 for async/await support).
-   **Express.js**: Web server framework for handling HTTP requests and routing.
-   **MySQL**: Relational database management system.
    -   **mysqljs/mysql**: Replaced by `mysql2` to support modern authentication.

## Dependencies
-   **Runtime**:
    -   `commander`: CLI argument parsing.
    -   `body-parser`: Request body parsing (JSON, URL-encoded).
    -   `morgan`: HTTP request logging.
    -   `multer`: Middleware for handling `multipart/form-data` (file uploads).
    -   `mysql2`: Database driver (supports MySQL 8+).
    -   `colors`: Console output coloring.
    -   `serve-favicon`: Favicon serving.
-   **Development/Testing**:
    -   `mocha`: Test framework.
    -   `should`: Assertion library.
    -   `supertest`: HTTP assertions.

## Development Environment
-   **Linting**: `.eslintrc` present (likely ESLint).
-   **Docker**: `dockerfile` and `docker-entrypoint.sh` provided for containerization.
-   **CI**: `.travis.yml` indicates usage of Travis CI.

## Constraints
-   **Database Compatibility**: Primarily designed for MySQL. Supports MySQL 8+ via `mysql2`.
-   **Local vs Remote**: Some features (Dynamic Queries, File Upload/Download) are restricted to local usage (localhost/127.0.0.1) for security or implementation reasons.
-   **Node Version**: Requires async/await support.

# Product Context

## Problem Statement
Developing REST APIs for existing databases often involves writing repetitive boilerplate code for CRUD operations, query parameter handling, and relationship management. This is time-consuming, especially for legacy databases or rapid prototyping where a full-blown framework might be overkill.

## Solution
MyREST (myrest) solves this by introspecting the MySQL database schema and dynamically generating Express.js routes. It acts as a bridge between the database and the HTTP client, translating URL parameters into SQL queries automatically.

**Evolution**: The product is evolving to adopt the **PostgREST** API standard. This will allow users to leverage existing PostgREST client libraries (SDKs) and tooling while using a MySQL backend.

## User Experience
-   **Setup**: The user installs the tool globally or uses Docker, then runs a single command pointing to their database.
-   **Interaction**: The user interacts with the generated API using standard HTTP methods and specific query parameters for filtering and sorting.
-   **Discovery**: The root endpoint `/` lists all available routes, allowing users to explore the API.

## Key Workflows
1.  **Installation**: `npm install -g myrest` or Docker pull.
2.  **Execution**: `myrest -h host -u user -p password -d dbname`.
3.  **Consumption (Legacy)**: HTTP requests using myrest conventions (`_where`, `_sort`, etc.).
4.  **Consumption (Target - PostgREST)**: HTTP requests using PostgREST syntax (e.g., `?select=*&age=gt.20`).
    -   Compatible with PostgREST JS, Swift, Python, etc. SDKs.

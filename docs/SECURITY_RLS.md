# Security and Row Level Security (RLS) Guide

MyREST (myrest) provides built-in support for JWT authentication and Row Level Security (RLS) using MySQL Views. This guide explains how to secure your API and implement granular access control.

## Overview

The security model mimics [PostgREST](https://postgrest.org/):
1.  **Authentication**: The API validates a JSON Web Token (JWT) sent in the request header.
2.  **Authorization**: The API injects the JWT claims into the MySQL session as user-defined variables.
3.  **RLS**: You create MySQL Views that reference these session variables to filter data dynamically based on the current user.

## 1. Setup

### Prerequisites
-   A running MySQL database.
-   `myrest` installed.
-   A JWT secret (a secure random string).

### Starting the Server
Start `myrest` with the `--jwtSecret` option:

```bash
myrest -h localhost -u root -p password -d my_database --jwtSecret "my_super_secure_secret"
```

### Enforcing Authentication
By default, requests without a JWT are allowed (anonymous access). To block requests without a valid token, use the `--jwtRequired` flag:

```bash
myrest -h localhost -u root -p password -d my_database --jwtSecret "my_super_secure_secret" --jwtRequired
```

## 2. Authentication

Clients must include the JWT in the `Authorization` header of every request:

```http
GET /api/orders HTTP/1.1
Authorization: Bearer <your_jwt_token>
```

### Generating a JWT
You can generate a JWT using any standard library or online tool (like [jwt.io](https://jwt.io)). The payload should contain claims that identify the user or their role.

**Example Payload:**
```json
{
  "sub": "user_123",
  "role": "customer",
  "email": "alice@example.com",
  "iat": 1616239022
}
```

## 3. Implementing Row Level Security (RLS)

When a request is received, `myrest` automatically executes `SET` statements for each claim in the JWT before running the API query. The variables are prefixed with `@request_jwt_claim_`.

For the example payload above, `myrest` executes:
```sql
SET @request_jwt_claim_sub = 'user_123';
SET @request_jwt_claim_role = 'customer';
SET @request_jwt_claim_email = 'alice@example.com';
```

### Step-by-Step RLS Example

#### 1. Create a Base Table
Assume you have a table `orders` that stores data for all customers.

```sql
CREATE TABLE orders (
    order_id INT AUTO_INCREMENT PRIMARY KEY,
    customer_id VARCHAR(50),
    amount DECIMAL(10,2),
    details TEXT
);
```

#### 2. Create a Secure View
Create a view that filters `orders` based on the `customer_id` matching the `sub` claim from the JWT.

```sql
CREATE VIEW my_orders AS
SELECT * 
FROM orders
WHERE customer_id = @request_jwt_claim_sub;
```

> **Note**: MySQL user-defined variables (`@var`) return `NULL` if they are not set. If a user queries this view without a valid JWT (and if your API allows it), the query will return no rows (since `customer_id = NULL` is false), ensuring security by default.

#### 3. Access the API
Instead of exposing the raw `orders` table, you direct users to the `my_orders` endpoint.

**Request:**
```http
GET /api/my_orders
Authorization: Bearer <token_for_user_123>
```

**Result:**
The API returns only the rows where `customer_id` is 'user_123'.

## Advanced Usage

### Role-Based Access Control (RBAC)
You can use the `role` claim to implement logic for admins vs. regular users.

```sql
CREATE VIEW all_orders_secure AS
SELECT * 
FROM orders
WHERE 
    -- Admins see everything
    @request_jwt_claim_role = 'admin'
    OR 
    -- Users see only their own data
    customer_id = @request_jwt_claim_sub;
```

### Variable Sanitization
`myrest` sanitizes claim keys to ensure they are valid MySQL variable names. Any character that is not alphanumeric or an underscore is replaced with an underscore `_`.

-   Claim: `https://example.com/role`
-   Variable: `@request_jwt_claim_https___example_com_role`

## Troubleshooting

### Debugging Session Variables
To verify what variables are being set, you can temporarily create a view that selects them:

```sql
CREATE VIEW debug_session AS
SELECT 
    @request_jwt_claim_sub as sub,
    @request_jwt_claim_role as role;
```

Query `/api/debug_session` with your token to see the values.

### Common Issues
-   **401 Unauthorized**: The token is missing, expired, or signed with a different secret than the one provided to `--jwtSecret`.
-   **Empty Results**: Ensure the JWT claims match the data in your table. Check if the variable names in your View match the prefix `@request_jwt_claim_`.

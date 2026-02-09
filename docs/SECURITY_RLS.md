# Security and Row Level Security (RLS) Guide

MyREST (myrest) provides built-in support for JWT authentication and Row Level Security (RLS) using gateway-enforced policies. This guide explains how to secure your API and implement granular access control.

## Overview

The security model mimics [PostgREST](https://postgrest.org/):
1.  **Authentication**: The API validates a JSON Web Token (JWT) sent in the request header.
2.  **Authorization**: The API injects the JWT claims into the MySQL session as user-defined variables.
3.  **RLS Policies**: You define security policies in the `_rls_policies` table that are automatically enforced by the gateway for all API operations.

### How It Works

Unlike PostgreSQL's native RLS (which uses database-level policies), MyREST implements **gateway-enforced RLS**:
- Policies are stored in the `_rls_policies` table
- MyREST loads policies at startup and caches them in memory
- For each API request, MyREST automatically injects policy WHERE clauses into SQL queries
- Policies filter data based on JWT claims (e.g., `@request_jwt_claim_role`)

**Key Benefits:**
- ✅ **Single endpoint per table** - No need for separate views per role
- ✅ **Dynamic policies** - Update policies without schema changes
- ✅ **PostgREST compatible** - Same security model as PostgreSQL RLS
- ✅ **Centralized security** - All policies in one table

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

When a request is received, `myrest` automatically:
1. Validates the JWT and extracts claims
2. Executes `SET` statements for each claim (prefixed with `@request_jwt_claim_`)
3. Looks up policies from the `_rls_policies` table
4. Injects policy WHERE clauses into all SQL queries

For the example payload above, `myrest` executes:
```sql
SET @request_jwt_claim_sub = 'user_123';
SET @request_jwt_claim_role = 'customer';
SET @request_jwt_claim_email = 'alice@example.com';
```

### Step-by-Step RLS Example

#### 1. Create the RLS Policies Table

First, create the policies table (this should be done once during setup):

```sql
CREATE TABLE _rls_policies (
  id INT PRIMARY KEY AUTO_INCREMENT,
  table_name VARCHAR(255) NOT NULL,
  policy_name VARCHAR(255) NOT NULL,
  operation ENUM('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'ALL') DEFAULT 'ALL',
  using_expression TEXT NOT NULL,
  check_expression TEXT DEFAULT NULL,
  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_policy (table_name, policy_name),
  INDEX idx_table_operation (table_name, operation, enabled)
);
```

#### 2. Create Your Data Table

```sql
CREATE TABLE orders (
    order_id INT AUTO_INCREMENT PRIMARY KEY,
    customer_id VARCHAR(50),
    amount DECIMAL(10,2),
    details TEXT
);
```

#### 3. Define Security Policies

Create policies that filter data based on JWT claims:

```sql
-- Policy: Users can only see their own orders
INSERT INTO _rls_policies (table_name, policy_name, operation, using_expression)
VALUES ('orders', 'user_isolation', 'ALL', 'customer_id = @request_jwt_claim_sub');
```

**That's it!** The policy is automatically enforced on all operations (SELECT, INSERT, UPDATE, DELETE).

#### 4. Access the API

Users access the table directly - no views needed:

**Request:**
```http
GET /api/orders
Authorization: Bearer <token_for_user_123>
```

**Result:**
The API automatically filters and returns only rows where `customer_id` is 'user_123'.

**Behind the scenes, MyREST transforms:**
```sql
SELECT * FROM orders
```

**Into:**
```sql
SELECT * FROM orders WHERE (customer_id = @request_jwt_claim_sub)
```

## Advanced Usage

### Role-Based Access Control (RBAC)

Create separate policies for different operations and roles:

```sql
-- Admins can see all orders
INSERT INTO _rls_policies (table_name, policy_name, operation, using_expression)
VALUES ('orders', 'admin_read_all', 'SELECT', '@request_jwt_claim_role = "admin" OR customer_id = @request_jwt_claim_sub');

-- Only admins can update orders
INSERT INTO _rls_policies (table_name, policy_name, operation, using_expression)
VALUES ('orders', 'admin_update', 'UPDATE', '@request_jwt_claim_role = "admin"');

-- Only admins can delete orders
INSERT INTO _rls_policies (table_name, policy_name, operation, using_expression)
VALUES ('orders', 'admin_delete', 'DELETE', '@request_jwt_claim_role = "admin"');
```

### Multi-Tenant Applications

Implement tenant isolation:

```sql
-- All operations restricted to user's tenant
INSERT INTO _rls_policies (table_name, policy_name, operation, using_expression)
VALUES ('documents', 'tenant_isolation', 'ALL', 'tenant_id = @request_jwt_claim_tenant_id');
```

### Combining Multiple Policies

Multiple policies for the same table/operation are combined with **AND** (all must pass):

```sql
-- Policy 1: User must be active
INSERT INTO _rls_policies (table_name, policy_name, operation, using_expression)
VALUES ('sensitive_data', 'user_active', 'SELECT', '@request_jwt_claim_status = "active"');

-- Policy 2: User must be in correct department
INSERT INTO _rls_policies (table_name, policy_name, operation, using_expression)
VALUES ('sensitive_data', 'dept_check', 'SELECT', 'department_id = @request_jwt_claim_dept_id');

-- Both policies must pass for SELECT operations
```

### Operation-Specific Policies

Control different operations separately:

```sql
-- Anyone with role 'reader' or 'writer' can read
INSERT INTO _rls_policies (table_name, policy_name, operation, using_expression)
VALUES ('articles', 'read_policy', 'SELECT', '@request_jwt_claim_role IN ("reader", "writer")');

-- Only 'writer' role can update
INSERT INTO _rls_policies (table_name, policy_name, operation, using_expression)
VALUES ('articles', 'write_policy', 'UPDATE', '@request_jwt_claim_role = "writer"');

-- Only 'writer' role can delete
INSERT INTO _rls_policies (table_name, policy_name, operation, using_expression)
VALUES ('articles', 'delete_policy', 'DELETE', '@request_jwt_claim_role = "writer"');
```

### Policy Management

**Reloading Policies:**

Policies are loaded at server startup. To reload policies without restarting:

```javascript
// Add a policy reload endpoint (for admins only)
app.post('/api/_reload_policies', async (req, res) => {
  await api.mysql.reloadPolicies();
  res.json({ message: 'Policies reloaded' });
});
```

**Disabling Policies:**

```sql
-- Temporarily disable a policy
UPDATE _rls_policies 
SET enabled = FALSE 
WHERE policy_name = 'temp_policy';
```

**Deleting Policies:**

```sql
-- Remove a policy
DELETE FROM _rls_policies 
WHERE table_name = 'orders' AND policy_name = 'old_policy';
```

### Variable Sanitization

`myrest` sanitizes claim keys to ensure they are valid MySQL variable names. Any character that is not alphanumeric or an underscore is replaced with an underscore `_`.

-   Claim: `https://example.com/role`
-   Variable: `@request_jwt_claim_https___example_com_role`

### Tables Without Policies

Tables without entries in `_rls_policies` have **no restrictions** - all authenticated users can access them (assuming JWT authentication is enabled). This allows you to selectively apply RLS only where needed.

## Troubleshooting

### Debugging Policies

**Check which policies are loaded:**

```sql
SELECT * FROM _rls_policies WHERE enabled = TRUE;
```

**Test a policy expression manually:**

```sql
-- Set test session variables
SET @request_jwt_claim_role = 'admin';
SET @request_jwt_claim_sub = 'user_123';

-- Test the policy expression
SELECT * FROM orders WHERE (customer_id = @request_jwt_claim_sub);
```

### Debugging Session Variables

Create a debug endpoint to see what variables are set:

```sql
CREATE VIEW debug_session AS
SELECT 
    @request_jwt_claim_sub as sub,
    @request_jwt_claim_role as role,
    @request_jwt_claim_email as email;
```

Query `/api/debug_session` with your token to see the values.

### Common Issues

-   **401 Unauthorized**: The token is missing, expired, or signed with a different secret than the one provided to `--jwtSecret`.
-   **Empty Results**: 
    - Check if policies exist for the table (`SELECT * FROM _rls_policies WHERE table_name = 'your_table'`)
    - Verify JWT claims match policy expressions
    - Test policy expressions manually with `SET @request_jwt_claim_...`
-   **Policies Not Applied**: Policies are loaded at startup. Restart the server or call the reload endpoint after policy changes.
-   **All Operations Blocked**: Check if you have conflicting policies or policies with `1=0` expressions.

## Migration from Views

If you previously used views for RLS, you can migrate to the policy system:

**Old approach (views):**
```sql
CREATE VIEW my_orders AS
SELECT * FROM orders WHERE customer_id = @request_jwt_claim_sub;
```

**New approach (policies):**
```sql
INSERT INTO _rls_policies (table_name, policy_name, operation, using_expression)
VALUES ('orders', 'user_isolation', 'ALL', 'customer_id = @request_jwt_claim_sub');

-- Now access /api/orders directly (no view needed)
```

**Benefits of migration:**
- Single endpoint per table
- Dynamic policy updates
- Better performance (no view overhead)
- Easier to manage and audit

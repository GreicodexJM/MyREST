# CORS Configuration

MyREST includes built-in support for CORS (Cross-Origin Resource Sharing) to enable secure cross-origin requests from web browsers. CORS is configured via environment variables or CLI parameters.

## Table of Contents

- [Quick Start](#quick-start)
- [Configuration Options](#configuration-options)
- [Usage Examples](#usage-examples)
- [Security Best Practices](#security-best-practices)
- [Troubleshooting](#troubleshooting)

## Quick Start

By default, CORS is enabled with permissive settings (allowing all origins). For production, you should configure specific origins:

```bash
# Allow all origins (default)
myrest -u user -p password -d mydb

# Allow specific origin
myrest -u user -p password -d mydb --corsOrigin https://myapp.com

# Allow multiple origins
myrest -u user -p password -d mydb --corsOrigin "https://app1.com,https://app2.com"

# Using environment variables (with Docker)
CORS_ORIGIN=https://myapp.com myrest -u user -p password -d mydb
```

## Configuration Options

All CORS options can be configured via CLI parameters or environment variables:

| CLI Parameter | Environment Variable | Default | Description |
|---------------|---------------------|---------|-------------|
| `--corsOrigin` | `CORS_ORIGIN` | `*` | Allowed origins. Use `*` for all, single URL, or comma-separated list |
| `--corsMethods` | `CORS_METHODS` | `GET,POST,PUT,PATCH,DELETE,OPTIONS` | Allowed HTTP methods |
| `--corsAllowedHeaders` | `CORS_ALLOWED_HEADERS` | `Content-Type,Authorization,Prefer,Range,Resolution,Accept` | Headers that clients can include in requests |
| `--corsExposedHeaders` | `CORS_EXPOSED_HEADERS` | `Content-Range,Location` | Headers that browsers can access in responses |
| `--corsCredentials` | `CORS_CREDENTIALS` | `false` | Allow cookies and authentication headers |
| `--corsMaxAge` | `CORS_MAX_AGE` | `3600` | Cache duration for preflight requests (seconds) |

### Default Headers Explained

**Allowed Headers:**
- `Content-Type` - Standard content type header
- `Authorization` - JWT authentication (Bearer tokens)
- `Prefer` - PostgREST preference headers (e.g., `return=representation`)
- `Range` - Pagination range requests
- `Resolution` - Conflict resolution for upserts
- `Accept` - Response format preferences

**Exposed Headers:**
- `Content-Range` - Pagination metadata
- `Location` - Resource location for created items

## Usage Examples

### Example 1: Development Environment (Allow All)

```bash
# CLI
myrest -u root -p password -d mydb --corsOrigin "*"

# Docker Compose
environment:
  CORS_ORIGIN: "*"
```

### Example 2: Production (Single Origin)

```bash
# CLI
myrest -u root -p password -d mydb \
  --corsOrigin "https://myapp.com" \
  --corsCredentials

# Docker Compose
environment:
  CORS_ORIGIN: "https://myapp.com"
  CORS_CREDENTIALS: "true"
```

### Example 3: Multiple Origins

```bash
# CLI
myrest -u root -p password -d mydb \
  --corsOrigin "https://app.com,https://app2.com,https://admin.app.com"

# Docker Compose
environment:
  CORS_ORIGIN: "https://app.com,https://app2.com,https://admin.app.com"
```

### Example 4: Custom Configuration

```bash
myrest -u root -p password -d mydb \
  --corsOrigin "https://myapp.com" \
  --corsMethods "GET,POST,PUT,DELETE" \
  --corsAllowedHeaders "Content-Type,Authorization,X-Custom-Header" \
  --corsExposedHeaders "Content-Range,X-Total-Count" \
  --corsCredentials \
  --corsMaxAge "7200"
```

### Example 5: Docker Compose Full Configuration

```yaml
version: '3.8'
services:
  myrest:
    image: myrest:latest
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: mysql://user:password@mysql:3306/mydb
      CORS_ORIGIN: "https://myapp.com,https://admin.myapp.com"
      CORS_METHODS: "GET,POST,PUT,PATCH,DELETE,OPTIONS"
      CORS_ALLOWED_HEADERS: "Content-Type,Authorization,Prefer"
      CORS_EXPOSED_HEADERS: "Content-Range,Location"
      CORS_CREDENTIALS: "true"
      CORS_MAX_AGE: "3600"
```

## Security Best Practices

### 1. **Never Use Wildcard (`*`) in Production**

```bash
# ❌ BAD - Allows any origin
--corsOrigin "*"

# ✅ GOOD - Specific origins
--corsOrigin "https://myapp.com,https://admin.myapp.com"
```

### 2. **Be Careful with Credentials**

When enabling `corsCredentials`, you **cannot** use wildcard origins:

```bash
# ❌ INVALID - Wildcard + credentials
--corsOrigin "*" --corsCredentials

# ✅ VALID - Specific origin + credentials
--corsOrigin "https://myapp.com" --corsCredentials
```

### 3. **Limit Allowed Methods**

Only allow HTTP methods your API actually uses:

```bash
# If you only need read/write operations:
--corsMethods "GET,POST,PUT,DELETE"
```

### 4. **Minimize Exposed Headers**

Only expose headers that clients need:

```bash
--corsExposedHeaders "Content-Range"
```

### 5. **Environment-Specific Configuration**

Use different configurations for different environments:

```bash
# Development
CORS_ORIGIN=*

# Staging
CORS_ORIGIN=https://staging.myapp.com

# Production
CORS_ORIGIN=https://myapp.com
```

## Troubleshooting

### CORS Error: "No 'Access-Control-Allow-Origin' header"

**Problem:** The requesting origin is not in the allowed list.

**Solution:**
1. Check your `corsOrigin` configuration
2. Ensure the origin matches exactly (including protocol and port)
3. For development, temporarily use `*` to verify CORS is working

```bash
# Check origin in browser console
console.log(window.location.origin); // e.g., "https://myapp.com"

# Configure MyREST to allow that origin
--corsOrigin "https://myapp.com"
```

### CORS Error: "Preflight request failed"

**Problem:** OPTIONS preflight request is failing.

**Solution:**
1. Ensure `OPTIONS` is in allowed methods (it is by default)
2. Check that all required headers are in `corsAllowedHeaders`
3. Verify network connectivity

```bash
# Test preflight manually
curl -X OPTIONS http://localhost:3000/api/users \
  -H "Origin: https://myapp.com" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type" \
  -v
```

### CORS Error: "Credentials flag is 'true'"

**Problem:** Using wildcard origin with credentials.

**Solution:** Specify explicit origins:

```bash
# ❌ Invalid
--corsOrigin "*" --corsCredentials

# ✅ Valid
--corsOrigin "https://myapp.com" --corsCredentials
```

### Custom Headers Not Working

**Problem:** Browser blocks custom request headers.

**Solution:** Add them to `corsAllowedHeaders`:

```bash
# If using custom header "X-Custom-Header"
--corsAllowedHeaders "Content-Type,Authorization,X-Custom-Header"
```

### Response Headers Not Accessible

**Problem:** JavaScript cannot read response headers.

**Solution:** Add them to `corsExposedHeaders`:

```bash
# If you need to read "X-Total-Count" header
--corsExposedHeaders "Content-Range,X-Total-Count"
```

## Testing CORS Configuration

### Browser Console Test

```javascript
// Test from browser console
fetch('http://localhost:3000/api/users', {
  method: 'GET',
  headers: {
    'Content-Type': 'application/json'
  }
})
.then(response => {
  console.log('Success!', response);
  console.log('Content-Range:', response.headers.get('Content-Range'));
})
.catch(error => console.error('CORS Error:', error));
```

### cURL Test

```bash
# Test GET request with origin
curl -X GET http://localhost:3000/api/users \
  -H "Origin: https://myapp.com" \
  -v

# Test preflight (OPTIONS) request
curl -X OPTIONS http://localhost:3000/api/users \
  -H "Origin: https://myapp.com" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type,Authorization" \
  -v
```

## Additional Resources

- [MDN CORS Documentation](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)
- [CORS npm package](https://www.npmjs.com/package/cors)
- [PostgREST API Standards](https://postgrest.org/)
- [MyREST Security Documentation](./SECURITY_RLS.md)

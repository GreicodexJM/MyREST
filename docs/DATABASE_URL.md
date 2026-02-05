# DATABASE_URL Configuration

MyREST now supports database connection configuration via a single `DATABASE_URL` environment variable or command-line parameter. This provides a convenient and standardized way to configure database connections, especially useful for cloud deployments and environments where connection strings are commonly used.

## Features

- **Single Connection String**: Configure all database parameters in one URL
- **SSL Support**: Built-in support for SSL/TLS connections with multiple configuration options
- **Backward Compatible**: Existing individual parameter configuration still works
- **Cloud-Friendly**: Standard format used by many cloud platforms (Heroku, Railway, etc.)

## URL Format

```
mysql://[user[:password]@]host[:port]/database[?parameters]
```

### Basic Structure

- **Protocol**: `mysql://` (required)
- **User**: Database username (optional, defaults to `root`)
- **Password**: Database password (optional, URL-encoded)
- **Host**: Database hostname or IP address (required)
- **Port**: Database port (optional, defaults to `3306`)
- **Database**: Database name (required)
- **Parameters**: Query string parameters for additional configuration (optional)

## SSL Configuration

The `ssl` query parameter controls SSL/TLS encryption for database connections:

### SSL Options

1. **Basic SSL** (`ssl=true` or `ssl=1`):
   ```
   mysql://user:pass@host:3306/database?ssl=true
   ```
   - Enables SSL with relaxed certificate validation
   - Use for development or self-signed certificates

2. **Strict SSL** (`ssl=required`):
   ```
   mysql://user:pass@host:3306/database?ssl=required
   ```
   - Enables SSL with strict certificate validation
   - Recommended for production environments

3. **No SSL** (`ssl=false` or omit parameter):
   ```
   mysql://user:pass@host:3306/database
   ```
   - Plain unencrypted connection (default)

4. **Advanced SSL Configuration** (JSON):
   ```
   mysql://user:pass@host:3306/database?ssl={"rejectUnauthorized":true,"ca":"path/to/ca.pem"}
   ```
   - Provide custom SSL configuration as JSON
   - Supports all mysql2 SSL options

## Usage Examples

### Command Line

#### Basic Connection
```bash
myrest --databaseUrl "mysql://root:password@localhost:3306/mydb"
```

#### With SSL Enabled
```bash
myrest --databaseUrl "mysql://root:password@db.example.com:3306/mydb?ssl=true"
```

#### With Strict SSL
```bash
myrest --databaseUrl "mysql://admin:secret@secure-db.com:3306/production?ssl=required"
```

#### Special Characters in Password
Passwords with special characters must be URL-encoded:
```bash
# Password: p@ssw0rd!
myrest --databaseUrl "mysql://root:p%40ssw0rd%21@localhost:3306/mydb"
```

### Docker Environment Variable

#### docker run
```bash
docker run -d \
  -p 3000:3000 \
  -e DATABASE_URL="mysql://root:password@host.docker.internal:3306/mydb?ssl=true" \
  greicodex/myrest:latest
```

#### docker-compose.yml
```yaml
services:
  myrest:
    image: greicodex/myrest:latest
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=mysql://root:password@mysql:3306/mydb?ssl=true
    depends_on:
      - mysql
```

### Cloud Platforms

Many cloud platforms provide DATABASE_URL automatically:

#### Heroku
```bash
# Heroku sets DATABASE_URL automatically
# Just deploy - no configuration needed!
```

#### Railway
```yaml
environment:
  DATABASE_URL: ${{Postgres.DATABASE_URL}}  # Railway variable
```

#### DigitalOcean App Platform
```yaml
envs:
  - key: DATABASE_URL
    value: ${db.DATABASE_URL}  # Auto-populated from managed database
```

## Additional Parameters

You can add other connection parameters to the query string:

### Connection Limit
```
mysql://user:pass@host:3306/db?connectionLimit=20
```

### Multiple Parameters
Combine parameters with `&`:
```
mysql://user:pass@host:3306/db?ssl=true&connectionLimit=15
```

## Backward Compatibility

Individual parameters still work and can override URL values:

```bash
# DATABASE_URL provides base configuration
myrest --databaseUrl "mysql://root:password@localhost:3306/mydb" \
      --database "different_db"  # Overrides database from URL
```

**Priority Order** (highest to lowest):
1. Individual CLI parameters (`-h`, `-u`, `-p`, `-d`, `-P`)
2. DATABASE_URL values
3. Default values

## Environment Variables

### Using DATABASE_URL
```bash
export DATABASE_URL="mysql://root:password@localhost:3306/mydb?ssl=true"
myrest --databaseUrl "$DATABASE_URL"
```

### Docker Environment
```bash
# In docker-compose.yml or .env file
DATABASE_URL=mysql://root:password@mysql:3306/mydb?ssl=true
```

### Traditional Individual Parameters (Still Supported)
```bash
DATABASE_HOST=localhost
DATABASE_USER=root
DATABASE_PASSWORD=password
DATABASE_NAME=mydb
```

## Security Best Practices

1. **Never commit DATABASE_URL to version control**
   - Use `.env` files (add to `.gitignore`)
   - Use environment variables
   - Use secrets management tools

2. **Use SSL in Production**
   ```
   mysql://user:pass@host:3306/db?ssl=required
   ```

3. **URL-Encode Sensitive Characters**
   - Special characters in passwords must be encoded
   - Use online URL encoders or libraries

4. **Restrict Access**
   - Use database-level firewalls
   - Limit IP addresses that can connect
   - Use strong passwords

## Troubleshooting

### Invalid URL Format
```
Error: Invalid DATABASE_URL format: Invalid URL
```
**Solution**: Check URL structure, ensure `mysql://` protocol is present

### SSL Connection Failed
```
Error: SSL connection failed
```
**Solutions**:
- Try `ssl=true` instead of `ssl=required` for self-signed certificates
- Verify server supports SSL
- Check certificate paths if using custom CA

### Authentication Failed
```
Error: Access denied for user
```
**Solutions**:
- Verify username and password
- Check if password needs URL encoding
- Ensure user has access from connection host

### Connection Refused
```
Error: connect ECONNREFUSED
```
**Solutions**:
- Verify host and port are correct
- Check database server is running
- Verify firewall rules allow connection

## Migration Guide

### From Individual Parameters to DATABASE_URL

**Before:**
```bash
myrest -h db.example.com -u admin -p secret -d mydb -P 3306
```

**After:**
```bash
myrest --databaseUrl "mysql://admin:secret@db.example.com:3306/mydb"
```

**Docker Before:**
```yaml
environment:
  - DATABASE_HOST=mysql
  - DATABASE_USER=root
  - DATABASE_PASSWORD=toor
  - DATABASE_NAME=mydb
```

**Docker After:**
```yaml
environment:
  - DATABASE_URL=mysql://root:toor@mysql:3306/mydb
```

## URL Encoding Reference

Common characters that need encoding in passwords:

| Character | Encoded |
|-----------|---------|
| `@`       | `%40`   |
| `:`       | `%3A`   |
| `/`       | `%2F`   |
| `?`       | `%3F`   |
| `#`       | `%23`   |
| `&`       | `%26`   |
| `=`       | `%3D`   |
| `+`       | `%2B`   |
| `%`       | `%25`   |
| ` ` (space)| `%20`  |

## Additional Resources

- [MySQL2 SSL Options](https://github.com/sidorares/node-mysql2#ssl-options)
- [URL Standard](https://url.spec.whatwg.org/)
- [MySQL Connection URI](https://dev.mysql.com/doc/refman/8.0/en/connecting-using-uri-or-key-value-pairs.html)

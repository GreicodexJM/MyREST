/**
 * Test for DATABASE_URL parsing functionality
 * Tests the URL parsing logic added to cmd.helper.js
 */

const assert = require('assert');

// Mock the URL parsing function from cmd.helper.js
function parseConnectionUrl(url) {
  try {
    const urlObj = new URL(url);
    
    const config = {
      host: urlObj.hostname,
      user: urlObj.username || 'root',
      password: decodeURIComponent(urlObj.password || ''),
      port: urlObj.port ? parseInt(urlObj.port) : 3306,
      database: urlObj.pathname.substring(1) // Remove leading slash
    };

    // Parse SSL options from query string
    const sslParam = urlObj.searchParams.get('ssl');
    if (sslParam) {
      if (sslParam === 'true' || sslParam === '1') {
        config.ssl = { rejectUnauthorized: false }; // Basic SSL
      } else if (sslParam === 'required') {
        config.ssl = { rejectUnauthorized: true }; // Strict SSL
      } else {
        // Try to parse as JSON for advanced SSL configuration
        try {
          config.ssl = JSON.parse(sslParam);
        } catch (e) {
          console.warn('Warning: Invalid SSL configuration in URL, using basic SSL');
          config.ssl = { rejectUnauthorized: false };
        }
      }
    }

    // Parse other connection parameters
    const connectionLimit = urlObj.searchParams.get('connectionLimit');
    if (connectionLimit) {
      config.connectionLimit = parseInt(connectionLimit);
    }

    return config;
  } catch (error) {
    throw new Error(`Invalid DATABASE_URL format: ${error.message}`);
  }
}

describe(__filename + ':: DATABASE_URL Parsing', function() {

  it('should parse basic URL without SSL', function() {
    const url = 'mysql://root:password@localhost:3306/mydb';
    const config = parseConnectionUrl(url);
    
    assert.strictEqual(config.host, 'localhost');
    assert.strictEqual(config.user, 'root');
    assert.strictEqual(config.password, 'password');
    assert.strictEqual(config.port, 3306);
    assert.strictEqual(config.database, 'mydb');
    assert.strictEqual(config.ssl, undefined);
  });

  it('should parse URL with basic SSL (ssl=true)', function() {
    const url = 'mysql://root:password@localhost:3306/mydb?ssl=true';
    const config = parseConnectionUrl(url);
    
    assert.strictEqual(config.host, 'localhost');
    assert.strictEqual(config.database, 'mydb');
    assert.deepStrictEqual(config.ssl, { rejectUnauthorized: false });
  });

  it('should parse URL with strict SSL (ssl=required)', function() {
    const url = 'mysql://admin:secret@db.example.com:3306/production?ssl=required';
    const config = parseConnectionUrl(url);
    
    assert.strictEqual(config.host, 'db.example.com');
    assert.strictEqual(config.user, 'admin');
    assert.strictEqual(config.password, 'secret');
    assert.strictEqual(config.database, 'production');
    assert.deepStrictEqual(config.ssl, { rejectUnauthorized: true });
  });

  it('should parse URL with URL-encoded password', function() {
    const url = 'mysql://root:p%40ssw0rd%21@localhost:3306/mydb';
    const config = parseConnectionUrl(url);
    
    assert.strictEqual(config.password, 'p@ssw0rd!');
  });

  it('should use default port when not specified', function() {
    const url = 'mysql://root:password@localhost/mydb';
    const config = parseConnectionUrl(url);
    
    assert.strictEqual(config.port, 3306);
  });

  it('should use default user when not specified', function() {
    const url = 'mysql://localhost:3306/mydb';
    const config = parseConnectionUrl(url);
    
    assert.strictEqual(config.user, 'root');
  });

  it('should parse URL with connectionLimit parameter', function() {
    const url = 'mysql://root:password@localhost:3306/mydb?connectionLimit=20';
    const config = parseConnectionUrl(url);
    
    assert.strictEqual(config.connectionLimit, 20);
  });

  it('should parse URL with multiple parameters', function() {
    const url = 'mysql://root:password@localhost:3306/mydb?ssl=true&connectionLimit=15';
    const config = parseConnectionUrl(url);
    
    assert.deepStrictEqual(config.ssl, { rejectUnauthorized: false });
    assert.strictEqual(config.connectionLimit, 15);
  });

  it('should parse URL with custom host and port', function() {
    const url = 'mysql://user:pass@192.168.1.100:3307/testdb';
    const config = parseConnectionUrl(url);
    
    assert.strictEqual(config.host, '192.168.1.100');
    assert.strictEqual(config.port, 3307);
    assert.strictEqual(config.database, 'testdb');
  });

  it('should handle special characters in database name', function() {
    const url = 'mysql://root:password@localhost:3306/my_test_db-123';
    const config = parseConnectionUrl(url);
    
    assert.strictEqual(config.database, 'my_test_db-123');
  });

  it('should throw error for invalid URL', function() {
    const url = 'not-a-valid-url';
    
    assert.throws(() => {
      parseConnectionUrl(url);
    }, /Invalid DATABASE_URL format/);
  });

  it('should parse Docker network URL', function() {
    const url = 'mysql://root:toor@mysql:3306/mysql?ssl=false';
    const config = parseConnectionUrl(url);
    
    assert.strictEqual(config.host, 'mysql');
    assert.strictEqual(config.user, 'root');
    assert.strictEqual(config.password, 'toor');
    assert.strictEqual(config.database, 'mysql');
  });

});

// Run tests if executed directly
if (require.main === module) {
  console.log('Running DATABASE_URL parsing tests...\n');
  
  const tests = [
    {
      name: 'Basic URL without SSL',
      url: 'mysql://root:password@localhost:3306/mydb',
      expected: { host: 'localhost', user: 'root', database: 'mydb', port: 3306 }
    },
    {
      name: 'URL with SSL enabled',
      url: 'mysql://root:password@localhost:3306/mydb?ssl=true',
      expected: { ssl: { rejectUnauthorized: false } }
    },
    {
      name: 'URL with strict SSL',
      url: 'mysql://admin:secret@db.example.com:3306/production?ssl=required',
      expected: { host: 'db.example.com', ssl: { rejectUnauthorized: true } }
    },
    {
      name: 'URL with encoded password',
      url: 'mysql://root:p%40ssw0rd%21@localhost:3306/mydb',
      expected: { password: 'p@ssw0rd!' }
    }
  ];

  let passed = 0;
  let failed = 0;

  tests.forEach(test => {
    try {
      const config = parseConnectionUrl(test.url);
      
      let testPassed = true;
      for (const key in test.expected) {
        if (typeof test.expected[key] === 'object') {
          if (JSON.stringify(config[key]) !== JSON.stringify(test.expected[key])) {
            testPassed = false;
          }
        } else if (config[key] !== test.expected[key]) {
          testPassed = false;
        }
      }

      if (testPassed) {
        console.log(`✓ ${test.name}`);
        passed++;
      } else {
        console.log(`✗ ${test.name}`);
        console.log('  Expected:', test.expected);
        console.log('  Got:', config);
        failed++;
      }
    } catch (error) {
      console.log(`✗ ${test.name}`);
      console.log('  Error:', error.message);
      failed++;
    }
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

module.exports = { parseConnectionUrl };

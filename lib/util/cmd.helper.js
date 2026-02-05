'use strict';
const program = require('commander');
const colors = require('colors');

program.on('--help', () => {
  console.log('')
  console.log('  Examples:'.blue)
  console.log('')
  console.log('    $ myrest -u username -p password -P dbport -d databaseSchema'.blue)
  console.log('')
})

program
  .version('0.0.9')
  .option('-h, --host <n>', 'hostname')
  .option('-d, --database <n>', 'database schema name')
  .option('-u, --user <n>', 'username of database / root by default')
  .option('-p, --password <n>', 'password of database / empty by default')
  .option('-P, --dbPort <n>', 'database port number / 3306 by default')
  .option('-n, --portNumber <n>', 'port number / 3000 by default')
  .option('-s, --storageFolder <n>', 'storage folder / current working dir by default / available only with local')
  .option('--databaseUrl <n>', 'database connection URL (e.g., mysql://user:pass@host:port/db?ssl=true)')
  .option('--jwtSecret <n>', 'JWT secret for token validation')
  .option('--jwtRequired', 'Require JWT for all requests (default: false)')
  .parse(process.argv)


function paintHelp(txt) {
  return colors.magenta(txt) //display the help text in a color
}

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
          console.warn('Warning: Invalid SSL configuration in URL, using basic SSL'.yellow);
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

function processInvalidArguments(program) {

  let err = '';

  if (!program.password && !program.databaseUrl) {
    err += 'Error: password for database is missing (or provide --databaseUrl)\n';
  }

  if (!program.database && !program.databaseUrl) {
    err += 'Error: database name is missing (or provide --databaseUrl)\n';
  }

  if (err !== '') {
    program.outputHelp(paintHelp)
    console.log(err.red)
  }
}

exports.handle = program => {

  /**************** START : Parse DATABASE_URL if provided ****************/
  if (program.databaseUrl) {
    try {
      const urlConfig = parseConnectionUrl(program.databaseUrl);
      
      // Override individual parameters with URL values
      // Individual parameters take precedence if explicitly set
      program.host = program.host || urlConfig.host;
      program.user = program.user || urlConfig.user;
      program.password = program.password || urlConfig.password;
      program.port = program.dbPort ? parseInt(program.dbPort) : urlConfig.port;
      program.database = program.database || urlConfig.database;
      
      // Set SSL configuration if present in URL
      if (urlConfig.ssl) {
        program.ssl = urlConfig.ssl;
      }
      
      // Set connectionLimit if present in URL
      if (urlConfig.connectionLimit) {
        program.connectionLimit = urlConfig.connectionLimit;
      }
      
      console.log('Using DATABASE_URL for connection'.green);
    } catch (error) {
      console.error(error.message.red);
      process.exit(1);
    }
  }
  /**************** END : Parse DATABASE_URL ****************/

  /**************** START : default values ****************/
  program.portNumber = program.portNumber || 3000;
  program.user = program.user || 'root';
  program.password = program.password || '';
  program.port = program.port || parseInt(program.dbPort || 3306);
  program.host = program.host || 'localhost';
  program.storageFolder = program.storageFolder || process.cwd()
  program.jwtSecret = program.jwtSecret || '';

  program.connectionLimit = program.connectionLimit || 10;

  if (program.host === 'localhost' || program.host === '127.0.0.1' || program.host === '::1') {
    program.dynamic = 1
  }
  //console.log(program.rawArgs);
  /**************** END : default values ****************/


  if (program.database && program.host && program.user && program.port) {
    console.log('Starting server at:', 'http://' + program.host + ':' + program.portNumber)
    if (program.ssl) {
      console.log('SSL enabled for database connection'.green);
    }
  } else {
    processInvalidArguments(program)
    process.exit(1)
  }

};

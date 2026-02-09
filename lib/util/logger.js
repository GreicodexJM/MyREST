'use strict';

/**
 * Centralized Logger
 * Provides structured logging with different levels
 * 
 * Features:
 * - Multiple log levels (DEBUG, INFO, WARN, ERROR)
 * - Structured data logging
 * - Environment-aware (verbose in dev, concise in prod)
 * - Colorized console output
 */

const colors = require('colors');

// Log levels
const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  NONE: 4
};

class Logger {
  constructor(options = {}) {
    this.level = this._parseLogLevel(options.level || process.env.LOG_LEVEL || 'INFO');
    this.enableColors = options.enableColors !== false;
    this.enableTimestamp = options.enableTimestamp !== false;
    this.environment = options.environment || process.env.NODE_ENV || 'development';
  }

  /**
   * Parses log level string to numeric value
   * @private
   */
  _parseLogLevel(level) {
    const upperLevel = level.toUpperCase();
    return LOG_LEVELS[upperLevel] !== undefined ? LOG_LEVELS[upperLevel] : LOG_LEVELS.INFO;
  }

  /**
   * Formats log message with timestamp and level
   * @private
   */
  _format(level, message, data) {
    let output = '';

    // Add timestamp
    if (this.enableTimestamp) {
      const timestamp = new Date().toISOString();
      output += `[${timestamp}] `;
    }

    // Add level
    output += `[${level}] `;

    // Add message
    output += message;

    // Add structured data in development
    if (data && Object.keys(data).length > 0 && this.environment === 'development') {
      output += ' ' + JSON.stringify(data, null, 2);
    } else if (data && Object.keys(data).length > 0) {
      output += ' ' + JSON.stringify(data);
    }

    return output;
  }

  /**
   * Applies color to log output
   * @private
   */
  _colorize(level, text) {
    if (!this.enableColors) {
      return text;
    }

    switch (level) {
      case 'DEBUG':
        return colors.gray(text);
      case 'INFO':
        return colors.cyan(text);
      case 'WARN':
        return colors.yellow(text);
      case 'ERROR':
        return colors.red(text);
      default:
        return text;
    }
  }

  /**
   * Logs a debug message
   * Use for detailed debugging information
   */
  debug(message, data = {}) {
    if (this.level <= LOG_LEVELS.DEBUG) {
      const formatted = this._format('DEBUG', message, data);
      console.log(this._colorize('DEBUG', formatted));
    }
  }

  /**
   * Logs an info message
   * Use for general informational messages
   */
  info(message, data = {}) {
    if (this.level <= LOG_LEVELS.INFO) {
      const formatted = this._format('INFO', message, data);
      console.log(this._colorize('INFO', formatted));
    }
  }

  /**
   * Logs a warning message
   * Use for warning conditions
   */
  warn(message, data = {}) {
    if (this.level <= LOG_LEVELS.WARN) {
      const formatted = this._format('WARN', message, data);
      console.warn(this._colorize('WARN', formatted));
    }
  }

  /**
   * Logs an error message
   * Use for error conditions
   */
  error(message, error = null, data = {}) {
    if (this.level <= LOG_LEVELS.ERROR) {
      const errorData = { ...data };
      
      if (error) {
        errorData.error = error.message;
        if (this.environment === 'development' && error.stack) {
          errorData.stack = error.stack;
        }
      }

      const formatted = this._format('ERROR', message, errorData);
      console.error(this._colorize('ERROR', formatted));
    }
  }

  /**
   * Logs HTTP request information
   */
  http(method, path, statusCode, duration, data = {}) {
    const message = `${method} ${path} ${statusCode} - ${duration}ms`;
    
    if (statusCode >= 500) {
      this.error(message, null, data);
    } else if (statusCode >= 400) {
      this.warn(message, data);
    } else {
      this.info(message, data);
    }
  }

  /**
   * Logs SQL query execution
   */
  sql(query, params = [], duration = null, error = null) {
    if (error) {
      this.error('SQL Query Failed', error, { query, params });
    } else if (this.environment === 'development') {
      const data = { query, params };
      if (duration !== null) {
        data.duration = `${duration}ms`;
      }
      this.debug('SQL Query', data);
    }
  }

  /**
   * Logs database operations
   */
  database(operation, details = {}) {
    this.info(`Database: ${operation}`, details);
  }

  /**
   * Logs service initialization
   */
  serviceInit(serviceName, details = {}) {
    this.info(`Service initialized: ${serviceName}`, details);
  }

  /**
   * Logs performance metrics
   */
  performance(operation, duration, details = {}) {
    const data = { duration: `${duration}ms`, ...details };
    
    if (duration > 1000) {
      this.warn(`Slow operation: ${operation}`, data);
    } else {
      this.debug(`Performance: ${operation}`, data);
    }
  }

  /**
   * Creates a child logger with additional context
   */
  child(context = {}) {
    const childLogger = new Logger({
      level: Object.keys(LOG_LEVELS).find(k => LOG_LEVELS[k] === this.level),
      enableColors: this.enableColors,
      enableTimestamp: this.enableTimestamp,
      environment: this.environment
    });
    
    childLogger.defaultContext = context;
    
    // Override methods to include context
    const originalDebug = childLogger.debug.bind(childLogger);
    const originalInfo = childLogger.info.bind(childLogger);
    const originalWarn = childLogger.warn.bind(childLogger);
    const originalError = childLogger.error.bind(childLogger);
    
    childLogger.debug = (msg, data = {}) => originalDebug(msg, { ...context, ...data });
    childLogger.info = (msg, data = {}) => originalInfo(msg, { ...context, ...data });
    childLogger.warn = (msg, data = {}) => originalWarn(msg, { ...context, ...data });
    childLogger.error = (msg, err, data = {}) => originalError(msg, err, { ...context, ...data });
    
    return childLogger;
  }
}

// Create default logger instance
const defaultLogger = new Logger();

// Export both class and default instance
module.exports = defaultLogger;
module.exports.Logger = Logger;
module.exports.LOG_LEVELS = LOG_LEVELS;

'use strict';

/**
 * Base Error Class
 * Parent class for all custom application errors
 */
class BaseError extends Error {
  constructor(message, statusCode = 500, details = {}) {
    super(message);
    
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.details = details;
    this.timestamp = new Date().toISOString();
    
    // Maintains proper stack trace for where error was thrown
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Converts error to JSON format for API responses
   */
  toJSON() {
    return {
      error: this.name,
      message: this.message,
      statusCode: this.statusCode,
      details: this.details,
      timestamp: this.timestamp
    };
  }

  /**
   * Converts error to string format
   */
  toString() {
    return `${this.name}: ${this.message}`;
  }
}

module.exports = BaseError;

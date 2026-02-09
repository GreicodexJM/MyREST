'use strict';

/**
 * Custom Error Classes
 * Domain-specific error types for better error handling
 */

const BaseError = require('./BaseError');

/**
 * ValidationError
 * Thrown when input validation fails
 */
class ValidationError extends BaseError {
  constructor(message, details = {}) {
    super(message, 400, details);
  }
}

/**
 * NotFoundError
 * Thrown when a requested resource is not found
 */
class NotFoundError extends BaseError {
  constructor(resource, identifier = null) {
    const message = identifier 
      ? `${resource} with identifier '${identifier}' not found`
      : `${resource} not found`;
    super(message, 404, { resource, identifier });
  }
}

/**
 * DatabaseError
 * Thrown when a database operation fails
 */
class DatabaseError extends BaseError {
  constructor(message, originalError = null, details = {}) {
    super(message, 500, {
      ...details,
      originalError: originalError ? originalError.message : null
    });
    this.originalError = originalError;
  }
}

/**
 * AuthenticationError
 * Thrown when authentication fails
 */
class AuthenticationError extends BaseError {
  constructor(message = 'Authentication failed', details = {}) {
    super(message, 401, details);
  }
}

/**
 * AuthorizationError
 * Thrown when user lacks permission for an action
 */
class AuthorizationError extends BaseError {
  constructor(message = 'Insufficient permissions', details = {}) {
    super(message, 403, details);
  }
}

/**
 * ConflictError
 * Thrown when there's a conflict (e.g., duplicate key)
 */
class ConflictError extends BaseError {
  constructor(message, details = {}) {
    super(message, 409, details);
  }
}

/**
 * BadRequestError
 * Thrown when request is malformed or invalid
 */
class BadRequestError extends BaseError {
  constructor(message, details = {}) {
    super(message, 400, details);
  }
}

/**
 * ServiceUnavailableError
 * Thrown when a service is temporarily unavailable
 */
class ServiceUnavailableError extends BaseError {
  constructor(service, details = {}) {
    super(`Service ${service} is currently unavailable`, 503, { service, ...details });
  }
}

/**
 * TimeoutError
 * Thrown when an operation times out
 */
class TimeoutError extends BaseError {
  constructor(operation, timeout, details = {}) {
    super(`Operation '${operation}' timed out after ${timeout}ms`, 504, {
      operation,
      timeout,
      ...details
    });
  }
}

/**
 * FileError
 * Thrown when file operations fail
 */
class FileError extends BaseError {
  constructor(message, details = {}) {
    super(message, 400, details);
  }
}

/**
 * ConfigurationError
 * Thrown when there's a configuration problem
 */
class ConfigurationError extends BaseError {
  constructor(message, details = {}) {
    super(message, 500, details);
  }
}

module.exports = {
  BaseError,
  ValidationError,
  NotFoundError,
  DatabaseError,
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  BadRequestError,
  ServiceUnavailableError,
  TimeoutError,
  FileError,
  ConfigurationError
};

'use strict';

const CONSTANTS = require('../../domain/constants');
const logger = require('../../util/logger');
const { BaseError } = require('../../domain/errors');

/**
 * Enhanced Centralized Error Handling Middleware
 * Catches and formats errors from route handlers with structured logging
 * 
 * Error Types Handled:
 * 1. Custom BaseError instances -> Use statusCode from error
 * 2. MySQL/Database errors with .code -> 400 Bad Request
 * 3. Standard errors with .message -> 500 Internal Server Error
 * 4. Unknown errors -> 500 Internal Server Error
 * 
 * Features:
 * - Structured logging with context
 * - Custom error class support
 * - Environment-aware error details
 * - Request context tracking
 * 
 * @param {Error} err - Error object
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Express next function
 */
function errorMiddleware(err, req, res, next) {
  // Build error context for logging
  const errorContext = {
    method: req.method,
    path: req.path,
    query: req.query,
    ip: req.ip,
    userAgent: req.get ? req.get('user-agent') : undefined
  };

  // Handle custom BaseError instances
  if (err instanceof BaseError) {
    logger.error(
      `${err.name}: ${err.message}`,
      err,
      { ...errorContext, details: err.details }
    );

    // Return structured error response
    const response = {
      error: err.name,
      message: err.message
    };

    // Include details in development mode
    if (process.env.NODE_ENV === 'development') {
      response.details = err.details;
      response.stack = err.stack;
    }

    return res.status(err.statusCode).json(response);
  }

  // Handle MySQL/Database errors with error codes
  if (err && err.code) {
    logger.error('Database error', err, { ...errorContext, code: err.code });
    
    // Maintain backward compatibility: return error object directly
    return res.status(CONSTANTS.HTTP_STATUS.BAD_REQUEST).json({ 
      error: err 
    });
  }

  // Handle standard errors with message
  if (err && err.message) {
    logger.error('Internal server error', err, errorContext);
    
    // Maintain backward compatibility with old error format
    return res.status(CONSTANTS.HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ 
      error: CONSTANTS.ERROR_MESSAGES.INTERNAL_SERVER_ERROR.replace('{0}', err.message)
    });
  }

  // Handle unknown errors
  logger.error('Unknown error', null, { ...errorContext, error: String(err) });
  
  return res.status(CONSTANTS.HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ 
    error: CONSTANTS.ERROR_MESSAGES.INTERNAL_SERVER_ERROR.replace('{0}', String(err))
  });
}

module.exports = errorMiddleware;

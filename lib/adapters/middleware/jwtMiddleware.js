'use strict';

const jwt = require('jsonwebtoken');
const CONSTANTS = require('../../domain/constants');

/**
 * JWT Authentication Middleware
 * Validates JWT tokens and attaches decoded user to request
 * 
 * @param {Object} config - Configuration object
 * @param {string} config.jwtSecret - Secret key for JWT verification
 * @param {boolean} config.jwtRequired - Whether JWT is required for all requests
 * @returns {Function} Express middleware function
 */
function createJwtMiddleware(config) {
  if (!config || !config.jwtSecret) {
    throw new Error('JWT secret is required for JWT middleware');
  }

  return function jwtMiddleware(req, res, next) {
    const authHeader = req.headers[CONSTANTS.HEADERS.AUTHORIZATION];
    
    // Check if Bearer token is present
    if (authHeader && authHeader.split(' ')[0] === 'Bearer') {
      const token = authHeader.split(' ')[1];
      
      jwt.verify(token, config.jwtSecret, (err, decoded) => {
        if (err) {
          console.error('JWT verification failed:', err.message);
          return res.status(CONSTANTS.HTTP_STATUS.UNAUTHORIZED).json({ 
            error: CONSTANTS.ERROR_MESSAGES.UNAUTHORIZED_INVALID_TOKEN 
          });
        }
        
        // Attach decoded user to request
        req.user = decoded;
        next();
      });
    } else {
      // No token provided
      if (config.jwtRequired) {
        return res.status(CONSTANTS.HTTP_STATUS.UNAUTHORIZED).json({ 
          error: CONSTANTS.ERROR_MESSAGES.UNAUTHORIZED_TOKEN_REQUIRED 
        });
      }
      
      // Proceed without authentication (anonymous access)
      next();
    }
  };
}

module.exports = createJwtMiddleware;

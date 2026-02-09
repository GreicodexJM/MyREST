'use strict';

/**
 * Database Connection Manager
 * Handles connection pooling, query execution, and context injection
 * 
 * This repository abstracts database operations and provides:
 * - Connection pooling management
 * - Session variable injection (for RLS)
 * - Transaction support
 * - Query execution with context
 */
class DatabaseConnectionManager {
  
  constructor(pool) {
    this.pool = pool;
  }

  /**
   * Executes a query with optional context (JWT claims) injection
   * If context is provided, sets MySQL session variables before executing query
   * 
   * @param {string} query - SQL query to execute
   * @param {Array} params - Query parameters
   * @param {Object} context - Optional context object (JWT claims)
   * @returns {Promise<Array>} Query results
   */
  executeQuery(query, params = [], context = null) {
    return new Promise((resolve, reject) => {
      // Simple case: no context, use pool directly
      if (!context || Object.keys(context).length === 0) {
        this.pool.query(query, params, (error, rows) => {
          if (error) {
            console.error('Database query error:', error);
            return reject(error);
          }
          return resolve(rows);
        });
        return;
      }

      // Complex case: context provided, need session variables
      this.pool.getConnection((err, connection) => {
        if (err) {
          console.error('Database connection error:', err);
          return reject(err);
        }

        // Set session variables from context
        this._setSessionVariables(connection, context)
          .then(() => {
            // Execute main query
            connection.query(query, params, (error, rows) => {
              connection.release();
              if (error) {
                console.error('Database query error:', error);
                return reject(error);
              }
              return resolve(rows);
            });
          })
          .catch(error => {
            connection.release();
            console.error('Session variable error:', error);
            return reject(error);
          });
      });
    });
  }

  /**
   * Executes a callback with a dedicated connection
   * Useful for multi-query operations that need the same connection
   * 
   * @param {Function} callback - Callback function receiving connection
   * @param {Object} context - Optional context object
   * @returns {Promise<any>} Result from callback
   */
  executeWithConnection(callback, context = null) {
    return new Promise((resolve, reject) => {
      this.pool.getConnection((err, connection) => {
        if (err) {
          console.error('Database connection error:', err);
          return reject(err);
        }

        const wrappedConnection = this._wrapConnection(connection, context);

        Promise.resolve()
          .then(() => {
            // Set session variables if context provided
            if (context && Object.keys(context).length > 0) {
              return this._setSessionVariables(connection, context);
            }
          })
          .then(() => callback(wrappedConnection))
          .then(result => {
            connection.release();
            resolve(result);
          })
          .catch(error => {
            connection.release();
            console.error('Execute with connection error:', error);
            reject(error);
          });
      });
    });
  }

  /**
   * Executes a callback within a transaction
   * Automatically commits on success, rolls back on error
   * 
   * @param {Function} callback - Callback function receiving connection
   * @param {Object} context - Optional context object
   * @returns {Promise<any>} Result from callback
   */
  executeInTransaction(callback, context = null) {
    return new Promise((resolve, reject) => {
      this.pool.getConnection((err, connection) => {
        if (err) {
          console.error('Database connection error:', err);
          return reject(err);
        }

        connection.beginTransaction(transErr => {
          if (transErr) {
            connection.release();
            console.error('Transaction begin error:', transErr);
            return reject(transErr);
          }

          const wrappedConnection = this._wrapConnection(connection, context);

          Promise.resolve()
            .then(() => {
              // Set session variables if context provided
              if (context && Object.keys(context).length > 0) {
                return this._setSessionVariables(connection, context);
              }
            })
            .then(() => callback(wrappedConnection))
            .then(result => {
              connection.commit(commitErr => {
                if (commitErr) {
                  connection.rollback(() => {
                    connection.release();
                    console.error('Transaction commit error:', commitErr);
                    reject(commitErr);
                  });
                } else {
                  connection.release();
                  resolve(result);
                }
              });
            })
            .catch(error => {
              connection.rollback(() => {
                connection.release();
                console.error('Transaction error:', error);
                reject(error);
              });
            });
        });
      });
    });
  }

  /**
   * Sets MySQL session variables from context object
   * Variables are prefixed with @request_jwt_claim_
   * 
   * @private
   * @param {Object} connection - MySQL connection
   * @param {Object} context - Context object with claims
   * @returns {Promise<void>}
   */
  _setSessionVariables(connection, context) {
    return new Promise((resolve, reject) => {
      if (!context || Object.keys(context).length === 0) {
        return resolve();
      }

      let setStatements = [];
      let setParams = [];

      for (let key in context) {
        // Sanitize key to be safe for MySQL variable name
        let safeKey = key.replace(/[^a-zA-Z0-9_]/g, '_');
        setStatements.push(`@request_jwt_claim_${safeKey} = ?`);
        
        let val = context[key];
        // Convert objects to JSON strings
        if (typeof val === 'object' && val !== null) {
          val = JSON.stringify(val);
        }
        setParams.push(val);
      }

      if (setStatements.length === 0) {
        return resolve();
      }

      let setQuery = 'SET ' + setStatements.join(', ');
      connection.query(setQuery, setParams, (error) => {
        if (error) {
          console.error('Set session variables error:', error);
          return reject(error);
        }
        resolve();
      });
    });
  }

  /**
   * Wraps a connection object to provide promise-based query method
   * 
   * @private
   * @param {Object} connection - MySQL connection
   * @param {Object} context - Context object
   * @returns {Object} Wrapped connection
   */
  _wrapConnection(connection, context) {
    return {
      query: (query, params) => {
        return new Promise((resolve, reject) => {
          connection.query(query, params, (error, rows) => {
            if (error) {
              console.error('Connection query error:', error);
              return reject(error);
            }
            resolve(rows);
          });
        });
      },
      escape: connection.escape.bind(connection),
      escapeId: connection.escapeId.bind(connection),
      raw: connection
    };
  }

  /**
   * Gets a raw pool query method (for backward compatibility)
   * @returns {Function} Pool query method
   */
  getPoolQuery() {
    return this.pool.query.bind(this.pool);
  }

  /**
   * Gets pool escape method
   * @returns {Function} Pool escape method
   */
  getEscape() {
    return this.pool.escape.bind(this.pool);
  }

  /**
   * Gets pool escapeId method
   * @returns {Function} Pool escapeId method
   */
  getEscapeId() {
    return this.pool.escapeId.bind(this.pool);
  }

  /**
   * Gets the raw pool object (for advanced use cases)
   * @returns {Object} MySQL pool
   */
  getRawPool() {
    return this.pool;
  }
}

module.exports = DatabaseConnectionManager;

'use strict';

const CONSTANTS = require('../constants.js');

/**
 * Procedure Service
 * Handles stored procedure and function execution
 * 
 * This service provides:
 * - Stored procedure invocation
 * - Function execution
 * - Parameter mapping and validation
 */
class ProcedureService {
  
  constructor(xsql) {
    this.xsql = xsql;
  }

  /**
   * Calls a stored procedure or function
   * 
   * @param {string} procName - Procedure/function name
   * @param {Object} args - Arguments object
   * @param {Object} context - JWT context for RLS
   * @returns {Promise<Array>} Procedure results
   */
  async call(procName, args = {}, context = null) {
    // Get routine metadata
    const routine = this.xsql.metaDb.routines[procName];
    
    if (!routine) {
      throw new Error(`Function ${procName} not found`);
    }

    // Build parameters array in correct order
    const { params, placeholders } = this._buildParameters(routine, args);

    // Build query based on routine type
    let query;
    let queryParams;

    if (routine.type === 'PROCEDURE') {
      query = `CALL ??(${placeholders.join(',')})`;
      queryParams = [procName, ...params];
    } else {
      // FUNCTION
      query = `SELECT ??(${placeholders.join(',')}) as result`;
      queryParams = [procName, ...params];
    }

    // Execute query
    const results = await this.xsql.exec(query, queryParams, context);

    // Format results based on routine type
    return this._formatResults(routine, results);
  }

  /**
   * Builds parameter array and placeholders from routine metadata and arguments
   * 
   * @private
   * @param {Object} routine - Routine metadata
   * @param {Object} args - Argument object
   * @returns {Object} {params: Array, placeholders: Array}
   */
  _buildParameters(routine, args) {
    const params = [];
    const placeholders = [];

    // Parameters are already sorted by ordinal position in metadata
    for (const p of routine.params) {
      const val = args[p.name];

      // Handle missing parameters: pass NULL
      if (val === undefined) {
        params.push(null);
      } else {
        params.push(val);
      }

      placeholders.push('?');
    }

    return { params, placeholders };
  }

  /**
   * Formats procedure/function results
   * 
   * @private
   * @param {Object} routine - Routine metadata
   * @param {Array} results - Raw query results
   * @returns {Array} Formatted results
   */
  _formatResults(routine, results) {
    if (routine.type === 'PROCEDURE') {
      // Procedures may return multiple result sets
      // mysql2 returns [result1, result2, ..., okPacket]
      if (Array.isArray(results) && results.length > 0 && Array.isArray(results[0])) {
        // Return first result set (most common case)
        return results[0];
      }
      return results;
    } else {
      // Functions return single value
      return results;
    }
  }

  /**
   * Lists all available procedures and functions
   * 
   * @returns {Array<Object>} Array of routine information
   */
  listRoutines() {
    const routines = [];

    for (const [name, routine] of Object.entries(this.xsql.metaDb.routines)) {
      routines.push({
        name,
        type: routine.type,
        parameters: routine.params.map(p => ({
          name: p.name,
          type: p.type,
          mode: p.mode,
          position: p.pos
        }))
      });
    }

    return routines;
  }

  /**
   * Gets metadata for a specific routine
   * 
   * @param {string} procName - Procedure/function name
   * @returns {Object|null} Routine metadata or null if not found
   */
  getRoutineMetadata(procName) {
    const routine = this.xsql.metaDb.routines[procName];
    
    if (!routine) {
      return null;
    }

    return {
      name: procName,
      type: routine.type,
      parameters: routine.params.map(p => ({
        name: p.name,
        type: p.type,
        mode: p.mode,
        position: p.pos
      }))
    };
  }

  /**
   * Validates if a routine exists
   * 
   * @param {string} procName - Procedure/function name
   * @returns {boolean} True if routine exists
   */
  exists(procName) {
    return procName in this.xsql.metaDb.routines;
  }

  /**
   * Gets routines by type (PROCEDURE or FUNCTION)
   * 
   * @param {string} type - Type filter ('PROCEDURE' or 'FUNCTION')
   * @returns {Array<Object>} Filtered routines
   */
  getRoutinesByType(type) {
    const routines = [];

    for (const [name, routine] of Object.entries(this.xsql.metaDb.routines)) {
      if (routine.type === type) {
        routines.push({
          name,
          type: routine.type,
          parameters: routine.params.map(p => ({
            name: p.name,
            type: p.type,
            mode: p.mode,
            position: p.pos
          }))
        });
      }
    }

    return routines;
  }

  /**
   * Calls a procedure with named parameters (alias for call)
   * 
   * @param {string} procName - Procedure name
   * @param {Object} args - Named arguments
   * @param {Object} context - JWT context
   * @returns {Promise<Array>} Results
   */
  async callProcedure(procName, args = {}, context = null) {
    const routine = this.xsql.metaDb.routines[procName];
    
    if (!routine || routine.type !== 'PROCEDURE') {
      throw new Error(`Procedure ${procName} not found`);
    }

    return this.call(procName, args, context);
  }

  /**
   * Calls a function with named parameters (alias for call)
   * 
   * @param {string} funcName - Function name
   * @param {Object} args - Named arguments
   * @param {Object} context - JWT context
   * @returns {Promise<Array>} Results
   */
  async callFunction(funcName, args = {}, context = null) {
    const routine = this.xsql.metaDb.routines[funcName];
    
    if (!routine || routine.type !== 'FUNCTION') {
      throw new Error(`Function ${funcName} not found`);
    }

    return this.call(funcName, args, context);
  }
}

module.exports = ProcedureService;

'use strict';

const CONSTANTS = require('../constants');

/**
 * Row Level Security (RLS) Service
 * Handles loading, caching, and applying RLS policies to queries
 * 
 * This service provides centralized RLS policy management to eliminate
 * code duplication across CRUD operations.
 */
class RlsService {
  
  constructor(connectionManager) {
    this.connectionManager = connectionManager;
    this.rlsPolicies = {}; // Cache for RLS policies
  }

  /**
   * Ensures the RLS policies table exists in the database
   * Creates it if it doesn't exist
   * 
   * @returns {Promise<void>}
   */
  async ensureRlsPoliciesTable() {
    try {
      await this.connectionManager.executeQuery(CONSTANTS.RLS_TABLE.SCHEMA, []);
      console.log('RLS policies table ready');
    } catch (err) {
      console.error('Failed to create _rls_policies table:', err.message);
      // Don't block startup - gracefully degrade
    }
  }

  /**
   * Loads RLS policies from database into memory cache
   * Groups policies by table and operation for efficient lookup
   * 
   * @returns {Promise<void>}
   */
  async loadRlsPolicies() {
    try {
      const results = await this.connectionManager.executeQuery(
        `SELECT * FROM ${CONSTANTS.RLS_TABLE.NAME} WHERE enabled = TRUE`,
        []
      );
      
      // Group by table and operation
      this.rlsPolicies = {};
      for (const policy of results) {
        const tableName = policy.table_name;
        
        if (!this.rlsPolicies[tableName]) {
          this.rlsPolicies[tableName] = {
            SELECT: [],
            INSERT: [],
            UPDATE: [],
            DELETE: []
          };
        }
        
        // Handle 'ALL' operation - applies to all operations
        if (policy.operation === CONSTANTS.RLS_OPERATIONS.ALL) {
          this.rlsPolicies[tableName].SELECT.push(policy);
          this.rlsPolicies[tableName].INSERT.push(policy);
          this.rlsPolicies[tableName].UPDATE.push(policy);
          this.rlsPolicies[tableName].DELETE.push(policy);
        } else {
          this.rlsPolicies[tableName][policy.operation].push(policy);
        }
      }
      
      console.log('RLS policies loaded:', Object.keys(this.rlsPolicies).length, 'tables with policies');
    } catch (err) {
      console.error('Failed to load RLS policies:', err.message);
    }
  }

  /**
   * Reloads RLS policies from database
   * Useful after policies are added/updated/deleted
   * 
   * @returns {Promise<void>}
   */
  async reloadPolicies() {
    return this.loadRlsPolicies();
  }

  /**
   * Gets the WHERE clause for RLS policies
   * 
   * @param {string} tableName - Table name
   * @param {string} operation - Operation type (SELECT, INSERT, UPDATE, DELETE)
   * @returns {string|null} WHERE clause or null if no policies
   */
  getPolicyWhereClause(tableName, operation) {
    if (!this.rlsPolicies[tableName]) {
      return null;
    }
    
    const policies = this.rlsPolicies[tableName][operation] || [];
    if (policies.length === 0) {
      return null;
    }
    
    // Combine all policies with AND (all must pass)
    const conditions = policies.map(p => `(${p.using_expression})`);
    return conditions.join(' AND ');
  }

  /**
   * Injects RLS policy into an existing WHERE clause
   * Handles cases where WHERE clause may or may not exist
   * 
   * @param {Object} whereObj - Object with query and params properties
   * @param {string} tableName - Table name
   * @param {string} operation - Operation type (SELECT, INSERT, UPDATE, DELETE)
   * @param {string} prefix - Prefix to use if creating new WHERE clause (e.g., ' where ', ' WHERE ')
   * @returns {void} - Modifies whereObj in place
   */
  injectPolicyIntoWhere(whereObj, tableName, operation, prefix = ' where ') {
    const rlsClause = this.getPolicyWhereClause(tableName, operation);
    
    if (!rlsClause) {
      return; // No policies to inject
    }
    
    if (whereObj.query) {
      // WHERE clause already exists, combine with AND
      const whereRegex = /\s*where\s+/i;
      whereObj.query = whereObj.query.replace(whereRegex, `${prefix}(${rlsClause}) AND `);
    } else {
      // No WHERE clause, create one with just the RLS policy
      whereObj.query = `${prefix}${rlsClause}`;
    }
  }

  /**
   * Builds a complete WHERE clause by combining RLS policy with primary key condition
   * Used for single-record operations (read, update, delete by ID)
   * 
   * @param {string} tableName - Table name
   * @param {string} operation - Operation type (SELECT, UPDATE, DELETE)
   * @param {string} pkClause - Primary key WHERE clause (e.g., "id = 123")
   * @returns {string} Complete WHERE clause
   */
  buildWhereWithPolicy(tableName, operation, pkClause) {
    const rlsClause = this.getPolicyWhereClause(tableName, operation);
    
    if (rlsClause) {
      return `(${rlsClause}) AND ${pkClause}`;
    }
    
    return pkClause;
  }

  /**
   * Gets policy check expressions for INSERT operations
   * Returns array of check expressions that must be validated
   * 
   * @param {string} tableName - Table name
   * @returns {Array<string>} Array of check expressions
   */
  getInsertCheckExpressions(tableName) {
    if (!this.rlsPolicies[tableName]) {
      return [];
    }
    
    const policies = this.rlsPolicies[tableName].INSERT || [];
    return policies
      .filter(p => p.check_expression)
      .map(p => p.check_expression);
  }
}

module.exports = RlsService;

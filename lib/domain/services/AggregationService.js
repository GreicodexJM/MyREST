'use strict';

const CONSTANTS = require('../constants.js');

/**
 * Aggregation Service
 * Handles groupBy and aggregate operations
 * 
 * This service provides:
 * - Group By functionality with sorting
 * - Aggregate functions (min, max, avg, sum, stddev, variance)
 * - Query building for statistical operations
 */
class AggregationService {
  
  constructor(xsql) {
    this.xsql = xsql;
  }

  /**
   * Performs GROUP BY operation on specified fields
   * 
   * @param {string} tableName - Table name
   * @param {Object} queryParams - Query parameters
   * @param {Object} context - JWT context for RLS
   * @returns {Promise<Array>} Grouped results with counts
   */
  async groupBy(tableName, queryParams, context = null) {
    // Validate required fields parameter
    if (!queryParams._fields && !queryParams.fields) {
      throw new Error(CONSTANTS.ERROR_MESSAGES.MISSING_FIELDS_PARAM);
    }

    const fields = queryParams._fields || queryParams.fields;
    let query = 'SELECT ' + fields + ', COUNT(*) as count FROM ?? GROUP BY ' + fields;
    let params = [tableName];

    // Replicate original logic exactly:
    // Mutate queryParams directly if needed (like original code)
    if (!queryParams.sort && !queryParams._sort) {
      queryParams._sort = '-count';
    } else if (queryParams.sort && !queryParams._sort) {
      queryParams._sort = queryParams.sort;
    }
    
    query += this.xsql.getOrderByClause(queryParams, tableName);

    // Execute query
    const results = await this.xsql.exec(query, params, context);
    return results;
  }

  /**
   * Performs aggregate operations on numeric fields
   * Returns min, max, avg, sum, stddev, and variance for each field
   * 
   * @param {string} tableName - Table name
   * @param {Object} queryParams - Query parameters
   * @param {Object} context - JWT context for RLS
   * @returns {Promise<Array>} Aggregated statistics
   */
  async aggregate(tableName, queryParams, context = null) {
    // Validate required fields parameter
    if (!queryParams._fields && !queryParams.fields) {
      throw new Error(CONSTANTS.ERROR_MESSAGES.MISSING_NUMERIC_FIELDS);
    }

    const fieldsParam = queryParams._fields || queryParams.fields;
    const fields = fieldsParam.split(',');

    let query = 'SELECT ';
    let params = [];

    // Build aggregate functions for each field
    for (let i = 0; i < fields.length; ++i) {
      if (i > 0) {
        query += ', ';
      }

      const field = fields[i].trim();

      // Add all aggregate functions for this field
      query += 'MIN(??) as ?, ';
      params.push(field, 'min_of_' + field);

      query += 'MAX(??) as ?, ';
      params.push(field, 'max_of_' + field);

      query += 'AVG(??) as ?, ';
      params.push(field, 'avg_of_' + field);

      query += 'SUM(??) as ?, ';
      params.push(field, 'sum_of_' + field);

      query += 'STDDEV(??) as ?, ';
      params.push(field, 'stddev_of_' + field);

      query += 'VARIANCE(??) as ?';
      params.push(field, 'variance_of_' + field);
    }

    query += ' FROM ??';
    params.push(tableName);

    // Execute query
    const results = await this.xsql.exec(query, params, context);
    return results;
  }

  /**
   * Builds a GROUP BY query with custom grouping and aggregation
   * Advanced version allowing custom aggregate functions
   * 
   * @param {string} tableName - Table name
   * @param {Array<string>} groupFields - Fields to group by
   * @param {Array<Object>} aggregates - Aggregate definitions [{func: 'SUM', field: 'amount', alias: 'total'}]
   * @param {Object} options - Additional options (where, having, orderBy, limit)
   * @param {Object} context - JWT context for RLS
   * @returns {Promise<Array>} Custom grouped and aggregated results
   */
  async customGroupBy(tableName, groupFields, aggregates, options = {}, context = null) {
    let query = 'SELECT ';
    let params = [];

    // Add group fields
    const groupByClause = groupFields.map(f => '??').join(', ');
    query += groupByClause;
    params.push(...groupFields);

    // Add aggregate functions
    if (aggregates && aggregates.length > 0) {
      query += ', ';
      const aggParts = aggregates.map(agg => {
        params.push(agg.field, agg.alias);
        return `${agg.func}(??) as ??`;
      });
      query += aggParts.join(', ');
    }

    query += ' FROM ??';
    params.push(tableName);

    // Add WHERE clause if provided
    if (options.where) {
      query += ' WHERE ' + options.where.query;
      params.push(...options.where.params);
    }

    // Add GROUP BY
    query += ' GROUP BY ' + groupFields.map(f => '??').join(', ');
    params.push(...groupFields);

    // Add HAVING clause if provided
    if (options.having) {
      query += ' HAVING ' + options.having.query;
      params.push(...options.having.params);
    }

    // Add ORDER BY if provided
    if (options.orderBy) {
      query += ' ORDER BY ' + options.orderBy;
    }

    // Add LIMIT if provided
    if (options.limit) {
      query += ' LIMIT ?';
      params.push(options.limit);
    }

    // Execute query
    const results = await this.xsql.exec(query, params, context);
    return results;
  }

  /**
   * Gets distinct values for a field
   * 
   * @param {string} tableName - Table name
   * @param {string} fieldName - Field name
   * @param {Object} options - Options (where, orderBy, limit)
   * @param {Object} context - JWT context for RLS
   * @returns {Promise<Array>} Distinct values
   */
  async distinct(tableName, fieldName, options = {}, context = null) {
    let query = 'SELECT DISTINCT ?? FROM ??';
    let params = [fieldName, tableName];

    // Add WHERE clause if provided
    if (options.where) {
      query += ' WHERE ' + options.where.query;
      params.push(...options.where.params);
    }

    // Add ORDER BY if provided
    if (options.orderBy) {
      query += ' ORDER BY ??';
      params.push(fieldName);
      if (options.orderBy.toLowerCase() === 'desc') {
        query += ' DESC';
      }
    }

    // Add LIMIT if provided
    if (options.limit) {
      query += ' LIMIT ?';
      params.push(options.limit);
    }

    // Execute query
    const results = await this.xsql.exec(query, params, context);
    return results;
  }

  /**
   * Gets count of distinct values for a field
   * 
   * @param {string} tableName - Table name
   * @param {string} fieldName - Field name
   * @param {Object} options - Options (where)
   * @param {Object} context - JWT context for RLS
   * @returns {Promise<number>} Count of distinct values
   */
  async countDistinct(tableName, fieldName, options = {}, context = null) {
    let query = 'SELECT COUNT(DISTINCT ??) as distinct_count FROM ??';
    let params = [fieldName, tableName];

    // Add WHERE clause if provided
    if (options.where) {
      query += ' WHERE ' + options.where.query;
      params.push(...options.where.params);
    }

    // Execute query
    const results = await this.xsql.exec(query, params, context);
    return results[0].distinct_count;
  }
}

module.exports = AggregationService;

'use strict';

const dataHelp = require('../../util/data.helper.js');

/**
 * Schema Repository
 * Handles database schema introspection and metadata caching
 * 
 * This repository is responsible for:
 * - Loading database schema metadata
 * - Caching table, column, key, and procedure information
 * - Providing schema information to services
 */
class SchemaRepository {
  
  constructor(databaseConnectionManager, databaseName) {
    this.connectionManager = databaseConnectionManager;
    this.databaseName = databaseName;
    this.metaDb = {
      tables: {},
      routines: {}
    };
  }

  /**
   * Loads complete database schema
   * Entry point for schema initialization
   * 
   * @returns {Promise<Object>} Metadata object
   */
  async loadDatabaseSchema() {
    try {
      // Load table schema
      const schemaResults = await this._querySchema();
      
      this._initializeTables(schemaResults);
      this._loadTableColumns(schemaResults);
      this._loadPrimaryKeys(schemaResults);
      this._loadForeignKeys(schemaResults);
      
      // Load stored procedures and functions
      const procedureResults = await this._queryProcedures();
      this._loadProcedures(procedureResults);
      
      // Flush tables (OSX MySQL workaround)
      await this._flushTables();
      
      console.log('Database schema loaded successfully');
      console.log('  Tables:', Object.keys(this.metaDb.tables).length);
      console.log('  Routines:', Object.keys(this.metaDb.routines).length);
      
      return this.metaDb;
    } catch (error) {
      console.error('Failed to load database schema:', error);
      throw error;
    }
  }

  /**
   * Gets the metadata database object
   * 
   * @returns {Object} Metadata object with tables and routines
   */
  getMetaDb() {
    return this.metaDb;
  }

  /**
   * Gets metadata for a specific table
   * 
   * @param {string} tableName - Table name
   * @returns {Object|null} Table metadata or null if not found
   */
  getTableMetadata(tableName) {
    return this.metaDb.tables[tableName] || null;
  }

  /**
   * Gets metadata for a specific routine (procedure/function)
   * 
   * @param {string} routineName - Routine name
   * @returns {Object|null} Routine metadata or null if not found
   */
  getRoutineMetadata(routineName) {
    return this.metaDb.routines[routineName] || null;
  }

  /**
   * Checks if a table exists in the schema
   * 
   * @param {string} tableName - Table name
   * @returns {boolean} True if table exists
   */
  tableExists(tableName) {
    return tableName in this.metaDb.tables;
  }

  /**
   * Gets list of all table names
   * 
   * @returns {Array<string>} Array of table names
   */
  getTableNames() {
    return Object.keys(this.metaDb.tables);
  }

  /**
   * Gets list of all routine names
   * 
   * @returns {Array<string>} Array of routine names
   */
  getRoutineNames() {
    return Object.keys(this.metaDb.routines);
  }

  /**
   * Queries database schema from information_schema
   * 
   * @private
   * @returns {Promise<Array>} Schema query results
   */
  async _querySchema() {
    const query = dataHelp.getSchemaQuery();
    const params = [this.databaseName];
    
    return await this.connectionManager.executeQuery(query, params);
  }

  /**
   * Queries stored procedures and functions from information_schema
   * 
   * @private
   * @returns {Promise<Array>} Procedure query results
   */
  async _queryProcedures() {
    const query = dataHelp.getProceduresQuery();
    const params = [this.databaseName];
    
    return await this.connectionManager.executeQuery(query, params);
  }

  /**
   * Initializes empty table structures in metaDb
   * 
   * @private
   * @param {Array} schemaResults - Results from schema query
   */
  _initializeTables(schemaResults) {
    for (let i = 0; i < schemaResults.length; ++i) {
      const schemaRow = schemaResults[i];
      const tableName = schemaRow['table_name'] || schemaRow['TABLE_NAME'];

      if (!(tableName in this.metaDb.tables)) {
        this.metaDb.tables[tableName] = {
          primaryKeys: [],
          foreignKeys: [],
          columns: [],
          indicies: []
        };
      }
    }
  }

  /**
   * Loads column information into table metadata
   * 
   * @private
   * @param {Array} schemaResults - Results from schema query
   */
  _loadTableColumns(schemaResults) {
    for (let i = 0; i < schemaResults.length; ++i) {
      const schemaRow = schemaResults[i];
      const tableName = schemaRow['table_name'] || schemaRow['TABLE_NAME'];
      
      const col = {
        column_name: schemaRow['column_name'] || schemaRow['COLUMN_NAME'],
        ordinal_position: schemaRow['ordinal_position'] || schemaRow['ORDINAL_POSITION'],
        column_key: schemaRow['column_key'] || schemaRow['COLUMN_KEY'],
        data_type: schemaRow['data_type'] || schemaRow['DATA_TYPE'],
        column_type: schemaRow['column_type'] || schemaRow['COLUMN_TYPE'],
        is_nullable: schemaRow['is_nullable'] || schemaRow['IS_NULLABLE'],
        column_default: schemaRow['column_default'] || schemaRow['COLUMN_DEFAULT']
      };

      dataHelp.findOrInsertObjectArrayByKey(
        col, 
        'column_name', 
        this.metaDb.tables[tableName]['columns']
      );
    }
  }

  /**
   * Loads primary key information into table metadata
   * 
   * @private
   * @param {Array} schemaResults - Results from schema query
   */
  _loadPrimaryKeys(schemaResults) {
    for (let i = 0; i < schemaResults.length; ++i) {
      const schemaRow = schemaResults[i];
      const tableName = schemaRow['table_name'] || schemaRow['TABLE_NAME'];
      const columnKey = schemaRow['column_key'] || schemaRow['COLUMN_KEY'];

      if (columnKey === 'PRI') {
        const pk = {
          column_name: schemaRow['column_name'] || schemaRow['COLUMN_NAME'],
          ordinal_position: schemaRow['ordinal_position'] || schemaRow['ORDINAL_POSITION'],
          column_key: columnKey,
          data_type: schemaRow['data_type'] || schemaRow['DATA_TYPE'],
          column_type: schemaRow['column_type'] || schemaRow['COLUMN_TYPE']
        };

        dataHelp.findOrInsertObjectArrayByKey(
          pk, 
          'column_name', 
          this.metaDb.tables[tableName]['primaryKeys']
        );
      }
    }
  }

  /**
   * Loads foreign key information into table metadata
   * 
   * @private
   * @param {Array} schemaResults - Results from schema query
   */
  _loadForeignKeys(schemaResults) {
    for (let i = 0; i < schemaResults.length; ++i) {
      const schemaRow = schemaResults[i];
      const tableName = schemaRow['table_name'] || schemaRow['TABLE_NAME'];
      const referencedTableName = schemaRow['referenced_table_name'] || schemaRow['REFERENCED_TABLE_NAME'];

      if (referencedTableName) {
        const fk = {
          column_name: schemaRow['column_name'] || schemaRow['COLUMN_NAME'],
          table_name: tableName,
          referenced_table_name: referencedTableName,
          referenced_column_name: schemaRow['referenced_column_name'] || schemaRow['REFERENCED_COLUMN_NAME'],
          data_type: schemaRow['data_type'] || schemaRow['DATA_TYPE'],
          column_type: schemaRow['column_type'] || schemaRow['COLUMN_TYPE']
        };

        dataHelp.findOrInsertObjectArrayByKey(
          fk, 
          'column_name', 
          this.metaDb.tables[tableName]['foreignKeys']
        );
      }
    }
  }

  /**
   * Loads stored procedure and function information
   * 
   * @private
   * @param {Array} procedureResults - Results from procedure query
   */
  _loadProcedures(procedureResults) {
    for (let i = 0; i < procedureResults.length; ++i) {
      const row = procedureResults[i];
      const routineName = row['ROUTINE_NAME'];
      
      if (!(routineName in this.metaDb.routines)) {
        this.metaDb.routines[routineName] = {
          type: row['ROUTINE_TYPE'],
          params: []
        };
      }
      
      // Add parameter if exists
      if (row['PARAMETER_NAME']) {
        this.metaDb.routines[routineName].params.push({
          name: row['PARAMETER_NAME'],
          type: row['DATA_TYPE'],
          mode: row['PARAMETER_MODE'],
          pos: row['ORDINAL_POSITION']
        });
      }
    }
  }

  /**
   * Flushes table cache
   * OSX MySQL server has limitations related to open_tables
   * 
   * @private
   * @returns {Promise<void>}
   */
  async _flushTables() {
    try {
      await this.connectionManager.executeQuery('FLUSH TABLES', []);
    } catch (error) {
      console.warn('Failed to flush tables (non-critical):', error.message);
      // Non-critical, don't throw
    }
  }

  /**
   * Reloads the entire database schema
   * Useful when schema changes occur
   * 
   * @returns {Promise<Object>} Updated metadata object
   */
  async reloadSchema() {
    // Reset metadata
    this.metaDb = {
      tables: {},
      routines: {}
    };
    
    return await this.loadDatabaseSchema();
  }

  /**
   * Gets column information for a specific table and column
   * 
   * @param {string} tableName - Table name
   * @param {string} columnName - Column name
   * @returns {Object|null} Column metadata or null if not found
   */
  getColumnInfo(tableName, columnName) {
    const table = this.metaDb.tables[tableName];
    if (!table) return null;
    
    return table.columns.find(col => col.column_name === columnName) || null;
  }

  /**
   * Gets primary keys for a specific table
   * 
   * @param {string} tableName - Table name
   * @returns {Array} Array of primary key objects
   */
  getPrimaryKeys(tableName) {
    const table = this.metaDb.tables[tableName];
    return table ? table.primaryKeys : [];
  }

  /**
   * Gets foreign keys for a specific table
   * 
   * @param {string} tableName - Table name
   * @returns {Array} Array of foreign key objects
   */
  getForeignKeys(tableName) {
    const table = this.metaDb.tables[tableName];
    return table ? table.foreignKeys : [];
  }

  /**
   * Gets columns for a specific table
   * 
   * @param {string} tableName - Table name
   * @returns {Array} Array of column objects
   */
  getColumns(tableName) {
    const table = this.metaDb.tables[tableName];
    return table ? table.columns : [];
  }
}

module.exports = SchemaRepository;

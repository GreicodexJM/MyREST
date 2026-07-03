'use strict';

const dataHelp = require('../../util/data.helper.js');
const { ValidationError, NotFoundError, NotAcceptableError } = require('../errors');

/**
 * Schema Repository
 * Handles database schema introspection and metadata caching
 *
 * This repository is responsible for:
 * - Loading database schema metadata (one or many databases)
 * - Caching table, column, key, and procedure information
 * - Providing schema information to services
 * - Resolving table/routine names to metadata keys (multi-database mode)
 *
 * Modes:
 * - Single-database (default): metaDb keys are bare table/routine names —
 *   identical to historical behavior.
 * - Multi-database (databases array provided): metaDb keys are qualified
 *   as `database.table` / `database.routine`, and a name index supports
 *   resolving unqualified names deterministically.
 */
class SchemaRepository {

  constructor(databaseConnectionManager, databaseName, databases = null) {
    this.connectionManager = databaseConnectionManager;
    this.databaseName = databaseName;
    this.multiSchema = Array.isArray(databases) && databases.length > 0;
    this.databases = this.multiSchema ? databases.slice() : [databaseName];
    this.metaDb = {
      tables: {},
      routines: {}
    };
    this.tableNameIndex = {};   // short name -> [qualified keys]
    this.routineNameIndex = {}; // short name -> [qualified keys]
  }

  /**
   * Builds the metaDb key for a table
   *
   * @private
   * @param {string} schema - Database/schema name
   * @param {string} tableName - Table name
   * @returns {string} metaDb key (qualified in multi-database mode)
   */
  _tableKey(schema, tableName) {
    return this.multiSchema ? `${schema}.${tableName}` : tableName;
  }

  /**
   * Extracts schema and table name from a schema query result row
   *
   * @private
   */
  _rowIdentity(schemaRow) {
    return {
      schema: schemaRow['table_schema'] || schemaRow['TABLE_SCHEMA'],
      tableName: schemaRow['table_name'] || schemaRow['TABLE_NAME']
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
      console.log('  Databases:', this.databases.join(', '));
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
   * Whether multi-database mode is active
   *
   * @returns {boolean}
   */
  isMultiSchema() {
    return this.multiSchema;
  }

  /**
   * Gets the list of exposed databases
   *
   * @returns {Array<string>}
   */
  getDatabases() {
    return this.databases;
  }

  /**
   * Resolves a client-supplied table name to a metaDb key.
   *
   * Resolution order (multi-database mode):
   * 1. Qualified `db.table` names are validated and used as-is
   * 2. A profile schema (Accept-Profile / Content-Profile) scopes the lookup
   * 3. An unqualified name matching exactly one database resolves to it
   * 4. An unqualified name matching several databases is ambiguous -> error
   *
   * In single-database mode the name is returned unchanged (historical
   * behavior: route existence already guarantees validity).
   *
   * @param {string} name - Table name from URL (may be `db.table`)
   * @param {string|null} profileSchema - Schema from profile header, if any
   * @returns {string} metaDb table key
   * @throws {NotAcceptableError|NotFoundError|ValidationError}
   */
  resolveTable(name, profileSchema = null) {
    if (!this.multiSchema) {
      return name;
    }

    if (name.includes('.')) {
      const idx = name.indexOf('.');
      const schema = name.slice(0, idx);
      const tableName = name.slice(idx + 1);

      if (!this.databases.includes(schema)) {
        throw new NotAcceptableError(
          `Database '${schema}' is not exposed by this gateway. Exposed databases: ${this.databases.join(', ')}`
        );
      }

      const key = `${schema}.${tableName}`;
      if (!(key in this.metaDb.tables)) {
        throw new NotFoundError('Table', key);
      }
      return key;
    }

    if (profileSchema) {
      const key = `${profileSchema}.${name}`;
      if (!(key in this.metaDb.tables)) {
        throw new NotFoundError('Table', key);
      }
      return key;
    }

    const candidates = this.tableNameIndex[name] || [];
    if (candidates.length === 0) {
      throw new NotFoundError('Table', name);
    }
    if (candidates.length > 1) {
      throw new ValidationError(
        `Table name '${name}' is ambiguous across databases. ` +
        `Qualify it (e.g. '${candidates[0]}') or select a database with the Accept-Profile/Content-Profile header. ` +
        `Candidates: ${candidates.join(', ')}`
      );
    }
    return candidates[0];
  }

  /**
   * Resolves a client-supplied routine (procedure/function) name to a
   * metaDb key. Same rules as resolveTable.
   *
   * @param {string} name - Routine name (may be `db.routine`)
   * @param {string|null} profileSchema - Schema from profile header, if any
   * @returns {string} metaDb routine key
   * @throws {NotAcceptableError|NotFoundError|ValidationError}
   */
  resolveRoutine(name, profileSchema = null) {
    if (!this.multiSchema) {
      return name;
    }

    if (name.includes('.')) {
      const idx = name.indexOf('.');
      const schema = name.slice(0, idx);

      if (!this.databases.includes(schema)) {
        throw new NotAcceptableError(
          `Database '${schema}' is not exposed by this gateway. Exposed databases: ${this.databases.join(', ')}`
        );
      }
      return name;
    }

    if (profileSchema) {
      return `${profileSchema}.${name}`;
    }

    const candidates = this.routineNameIndex[name] || [];
    if (candidates.length === 0) {
      throw new NotFoundError('Routine', name);
    }
    if (candidates.length > 1) {
      throw new ValidationError(
        `Routine name '${name}' is ambiguous across databases. ` +
        `Qualify it (e.g. '${candidates[0]}') or select a database with the Content-Profile header. ` +
        `Candidates: ${candidates.join(', ')}`
      );
    }
    return candidates[0];
  }

  /**
   * Gets metadata for a specific table
   *
   * @param {string} tableName - Table name (metaDb key)
   * @returns {Object|null} Table metadata or null if not found
   */
  getTableMetadata(tableName) {
    return this.metaDb.tables[tableName] || null;
  }

  /**
   * Gets metadata for a specific routine (procedure/function)
   *
   * @param {string} routineName - Routine name (metaDb key)
   * @returns {Object|null} Routine metadata or null if not found
   */
  getRoutineMetadata(routineName) {
    return this.metaDb.routines[routineName] || null;
  }

  /**
   * Checks if a table exists in the schema
   *
   * @param {string} tableName - Table name (metaDb key)
   * @returns {boolean} True if table exists
   */
  tableExists(tableName) {
    return tableName in this.metaDb.tables;
  }

  /**
   * Gets list of all table names
   *
   * @returns {Array<string>} Array of table names (metaDb keys)
   */
  getTableNames() {
    return Object.keys(this.metaDb.tables);
  }

  /**
   * Gets list of all routine names
   *
   * @returns {Array<string>} Array of routine names (metaDb keys)
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
    const params = [this.databases];

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
    const params = [this.databases];

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
      const { schema, tableName } = this._rowIdentity(schemaResults[i]);
      const key = this._tableKey(schema, tableName);

      if (!(key in this.metaDb.tables)) {
        this.metaDb.tables[key] = {
          primaryKeys: [],
          foreignKeys: [],
          columns: [],
          indicies: []
        };

        if (this.multiSchema) {
          if (!this.tableNameIndex[tableName]) {
            this.tableNameIndex[tableName] = [];
          }
          this.tableNameIndex[tableName].push(key);
        }
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
      const { schema, tableName } = this._rowIdentity(schemaRow);
      const key = this._tableKey(schema, tableName);

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
        this.metaDb.tables[key]['columns']
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
      const { schema, tableName } = this._rowIdentity(schemaRow);
      const key = this._tableKey(schema, tableName);
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
          this.metaDb.tables[key]['primaryKeys']
        );
      }
    }
  }

  /**
   * Loads foreign key information into table metadata
   *
   * In multi-database mode both table_name and referenced_table_name are
   * stored qualified (`db.table`) so relational lookups operate on metaDb
   * keys. Only same-database foreign keys are captured (the schema query
   * constrains the join).
   *
   * @private
   * @param {Array} schemaResults - Results from schema query
   */
  _loadForeignKeys(schemaResults) {
    for (let i = 0; i < schemaResults.length; ++i) {
      const schemaRow = schemaResults[i];
      const { schema, tableName } = this._rowIdentity(schemaRow);
      const key = this._tableKey(schema, tableName);
      const referencedTableName = schemaRow['referenced_table_name'] || schemaRow['REFERENCED_TABLE_NAME'];

      if (referencedTableName) {
        const fk = {
          column_name: schemaRow['column_name'] || schemaRow['COLUMN_NAME'],
          table_name: key,
          referenced_table_name: this._tableKey(schema, referencedTableName),
          referenced_column_name: schemaRow['referenced_column_name'] || schemaRow['REFERENCED_COLUMN_NAME'],
          data_type: schemaRow['data_type'] || schemaRow['DATA_TYPE'],
          column_type: schemaRow['column_type'] || schemaRow['COLUMN_TYPE']
        };

        dataHelp.findOrInsertObjectArrayByKey(
          fk,
          'column_name',
          this.metaDb.tables[key]['foreignKeys']
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
      const schema = row['ROUTINE_SCHEMA'];
      const key = this.multiSchema ? `${schema}.${routineName}` : routineName;

      if (!(key in this.metaDb.routines)) {
        this.metaDb.routines[key] = {
          type: row['ROUTINE_TYPE'],
          params: []
        };

        if (this.multiSchema) {
          if (!this.routineNameIndex[routineName]) {
            this.routineNameIndex[routineName] = [];
          }
          this.routineNameIndex[routineName].push(key);
        }
      }

      // Add parameter if exists
      if (row['PARAMETER_NAME']) {
        this.metaDb.routines[key].params.push({
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
    this.tableNameIndex = {};
    this.routineNameIndex = {};

    return await this.loadDatabaseSchema();
  }

  /**
   * Gets column information for a specific table and column
   *
   * @param {string} tableName - Table name (metaDb key)
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
   * @param {string} tableName - Table name (metaDb key)
   * @returns {Array} Array of primary key objects
   */
  getPrimaryKeys(tableName) {
    const table = this.metaDb.tables[tableName];
    return table ? table.primaryKeys : [];
  }

  /**
   * Gets foreign keys for a specific table
   *
   * @param {string} tableName - Table name (metaDb key)
   * @returns {Array} Array of foreign key objects
   */
  getForeignKeys(tableName) {
    const table = this.metaDb.tables[tableName];
    return table ? table.foreignKeys : [];
  }

  /**
   * Gets columns for a specific table
   *
   * @param {string} tableName - Table name (metaDb key)
   * @returns {Array} Array of column objects
   */
  getColumns(tableName) {
    const table = this.metaDb.tables[tableName];
    return table ? table.columns : [];
  }
}

module.exports = SchemaRepository;

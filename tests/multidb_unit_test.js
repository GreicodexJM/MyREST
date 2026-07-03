'use strict';

const should = require('should');
const SchemaRepository = require('../lib/domain/repositories/SchemaRepository.js');
const { ValidationError, NotFoundError, NotAcceptableError } = require('../lib/domain/errors');

// Minimal schema query rows for two databases sharing a table name
function fakeSchemaRows() {
  const row = (schema, table, column, key) => ({
    table_schema: schema,
    table_name: table,
    column_name: column,
    ordinal_position: 1,
    column_key: key || '',
    data_type: 'int',
    column_type: 'int(11)',
    is_nullable: 'NO',
    column_default: null
  });

  return [
    row('db1', 'offices', 'officeCode', 'PRI'),
    row('db1', 'warehouses', 'id', 'PRI'),
    row('db2', 'offices', 'officeCode', 'PRI')
  ];
}

function fakeConnectionManager() {
  return {
    executeQuery: async (query) => {
      if (query.includes('information_schema.columns')) return fakeSchemaRows();
      if (query.includes('information_schema.ROUTINES')) return [];
      return [];
    }
  };
}

describe(__filename + ':: Multi-database SchemaRepository', function () {

  describe('single-database mode (unchanged behavior)', function () {
    let repo;
    before(async function () {
      repo = new SchemaRepository(fakeConnectionManager(), 'db1');
      await repo.loadDatabaseSchema();
    });

    it('keys tables by bare name', function () {
      repo.isMultiSchema().should.be.false();
      repo.tableExists('offices').should.be.true();
      repo.tableExists('db1.offices').should.be.false();
    });

    it('resolveTable is a passthrough', function () {
      repo.resolveTable('anything').should.equal('anything');
    });
  });

  describe('multi-database mode', function () {
    let repo;
    before(async function () {
      repo = new SchemaRepository(fakeConnectionManager(), 'db1', ['db1', 'db2']);
      await repo.loadDatabaseSchema();
    });

    it('keys tables by qualified name', function () {
      repo.isMultiSchema().should.be.true();
      repo.tableExists('db1.offices').should.be.true();
      repo.tableExists('db2.offices').should.be.true();
      repo.tableExists('offices').should.be.false();
    });

    it('resolves explicit qualified names', function () {
      repo.resolveTable('db2.offices').should.equal('db2.offices');
    });

    it('rejects qualified names for schemas outside the allowlist with 406', function () {
      (() => repo.resolveTable('otherdb.offices')).should.throw(NotAcceptableError);
    });

    it('rejects qualified names for missing tables with 404', function () {
      (() => repo.resolveTable('db2.warehouses')).should.throw(NotFoundError);
    });

    it('resolves via profile schema', function () {
      repo.resolveTable('offices', 'db1').should.equal('db1.offices');
      repo.resolveTable('offices', 'db2').should.equal('db2.offices');
    });

    it('profile schema misses are 404', function () {
      (() => repo.resolveTable('warehouses', 'db2')).should.throw(NotFoundError);
    });

    it('resolves unqualified unique names across databases', function () {
      repo.resolveTable('warehouses').should.equal('db1.warehouses');
    });

    it('rejects unqualified colliding names with 400 listing candidates', function () {
      let err = null;
      try {
        repo.resolveTable('offices');
      } catch (e) {
        err = e;
      }
      should.exist(err);
      err.should.be.instanceof(ValidationError);
      err.statusCode.should.equal(400);
      err.message.should.match(/ambiguous/);
      err.message.should.match(/db1\.offices/);
      err.message.should.match(/db2\.offices/);
    });

    it('unknown unqualified names are 404', function () {
      (() => repo.resolveTable('nope')).should.throw(NotFoundError);
    });

    it('reloadSchema rebuilds the name index without duplicates', async function () {
      await repo.reloadSchema();
      repo.resolveTable('warehouses').should.equal('db1.warehouses');
      (() => repo.resolveTable('offices')).should.throw(ValidationError);
    });
  });

  describe('QueryBuilderService.qualifyRelated', function () {
    const QueryBuilderService = require('../lib/domain/services/QueryBuilderService.js');
    const qb = new QueryBuilderService({ tables: {}, routines: {} });

    it('qualifies embeds with the parent database', function () {
      qb.qualifyRelated('db1.orders', 'customers').should.equal('db1.customers');
    });

    it('leaves already-qualified names and single-db names alone', function () {
      qb.qualifyRelated('db1.orders', 'db2.customers').should.equal('db2.customers');
      qb.qualifyRelated('orders', 'customers').should.equal('customers');
    });
  });
});

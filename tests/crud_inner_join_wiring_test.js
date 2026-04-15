'use strict';

// Proves that CrudService.list / nestedList consume the inner-join
// accumulator populated by QueryBuilder when the select string contains
// a `!inner` embed, and append the resulting EXISTS fragment to the outer
// WHERE clause (including the count query).

var should = require('should');
var QueryBuilderService = require('../lib/domain/services/QueryBuilderService.js');
var CrudService = require('../lib/domain/services/CrudService.js');

describe(__filename + ':: CrudService inner-join wiring', function () {

  var mockMetaDb = {
    tables: {
      documents: {
        columns: [
          { column_name: 'id' },
          { column_name: 'name' },
          { column_name: 'trading_partner_id' }
        ],
        primaryKeys: [{ column_name: 'id' }],
        foreignKeys: [
          { column_name: 'trading_partner_id', referenced_table_name: 'trading_partners', referenced_column_name: 'id' }
        ]
      },
      trading_partners: {
        columns: [{ column_name: 'id' }, { column_name: 'name' }],
        primaryKeys: [{ column_name: 'id' }],
        foreignKeys: []
      }
    }
  };

  // Minimal xsql-shaped fake that records the SQL the service ships to the DB.
  function makeFakeXsql() {
    var qb = new QueryBuilderService(mockMetaDb);
    var calls = [];
    return {
      queryBuilder: qb,
      metaDb: mockMetaDb,
      getColumnsForSelectStmt: function (tbl, p) { return qb.getColumnsForSelectStmt(tbl, p); },
      getAndClearInnerJoinConditions: function () { return qb.getAndClearInnerJoinConditions(); },
      getWhereClause: function () { /* user filters not exercised here */ },
      getOrderByClause: function () { return ''; },
      getLimitClause: function () { return [0, 50]; },
      exec: function (q, p) {
        calls.push({ q: q, p: p });
        // CrudService expects count queries to return [{ no_of_rows: N }].
        if (/count\(1\)\s+as\s+no_of_rows/i.test(q)) {
          return Promise.resolve([{ no_of_rows: 0 }]);
        }
        return Promise.resolve([]);
      },
      getCalls: function () { return calls; }
    };
  }

  var noopRls = {
    injectPolicyIntoWhere: function () {},
    getPolicyWhereClause: function () { return null; }
  };

  it('appends EXISTS fragment to outer WHERE on list() with !inner', async function () {
    var xsql = makeFakeXsql();
    var svc = new CrudService(xsql, noopRls);

    await svc.list('documents', { select: 'id,trading_partners!inner(name)' });

    var calls = xsql.getCalls();
    var rowQuery = calls[calls.length - 1].q;
    rowQuery.should.containEql('EXISTS');
    rowQuery.should.containEql('trading_partners');
    rowQuery.should.match(/from \?\?\s+where.*EXISTS.*limit/i);
  });

  it('leaves WHERE clean on list() with !left (no accumulation)', async function () {
    var xsql = makeFakeXsql();
    var svc = new CrudService(xsql, noopRls);

    await svc.list('documents', { select: 'id,trading_partners!left(name)' });

    var calls = xsql.getCalls();
    calls[calls.length - 1].q.should.not.containEql('EXISTS');
  });

  it('applies EXISTS fragment to the count query too when countTotal is set', async function () {
    var xsql = makeFakeXsql();
    var svc = new CrudService(xsql, noopRls);

    await svc.list('documents', { select: 'id,trading_partners!inner(name)' }, { countTotal: true });

    var calls = xsql.getCalls();
    calls.length.should.be.greaterThanOrEqual(2);
    var countQuery = calls[0].q;
    countQuery.should.containEql('count(1)');
    countQuery.should.containEql('EXISTS');
  });
});

'use strict';

var should = require('should');
var selectParser = require('../lib/util/selectParser.helper.js');
var QueryBuilderService = require('../lib/domain/services/QueryBuilderService.js');

describe(__filename + ':: Join Modifier Parser Tests', function () {

  it('should parse table!left(cols) syntax', function (done) {
    var result = selectParser.parseSelect('id,trading_partners!left(name)');

    result.length.should.be.equal(2);
    result[0].type.should.be.equal('column');
    result[0].name.should.be.equal('id');

    result[1].type.should.be.equal('relation');
    result[1].name.should.be.equal('trading_partners');
    result[1].joinType.should.be.equal('left');
    result[1].columns.should.be.equal('name');
    should.not.exist(result[1].hint);

    done();
  });

  it('should parse table!inner(cols) syntax', function (done) {
    var result = selectParser.parseSelect('id,trading_partners!inner(name,code)');

    result.length.should.be.equal(2);

    result[1].type.should.be.equal('relation');
    result[1].name.should.be.equal('trading_partners');
    result[1].joinType.should.be.equal('inner');
    result[1].columns.should.be.equal('name,code');

    done();
  });

  it('should parse hint:table!left(cols) combined syntax', function (done) {
    var result = selectParser.parseSelect('tp_id:trading_partners!left(name)');

    result.length.should.be.equal(1);
    result[0].type.should.be.equal('relation');
    result[0].name.should.be.equal('trading_partners');
    result[0].hint.should.be.equal('tp_id');
    result[0].joinType.should.be.equal('left');
    result[0].columns.should.be.equal('name');

    done();
  });

  it('should parse hint:table!inner(cols) combined syntax', function (done) {
    var result = selectParser.parseSelect('tp_id:trading_partners!inner(name)');

    result.length.should.be.equal(1);
    result[0].type.should.be.equal('relation');
    result[0].name.should.be.equal('trading_partners');
    result[0].hint.should.be.equal('tp_id');
    result[0].joinType.should.be.equal('inner');
    result[0].columns.should.be.equal('name');

    done();
  });

  it('should not set joinType when no modifier is present', function (done) {
    var result = selectParser.parseSelect('trading_partners(name)');

    result.length.should.be.equal(1);
    result[0].type.should.be.equal('relation');
    result[0].name.should.be.equal('trading_partners');
    result[0].columns.should.be.equal('name');
    should.not.exist(result[0].joinType);

    done();
  });

  it('should not set joinType on plain columns', function (done) {
    var result = selectParser.parseSelect('id,name');

    result.length.should.be.equal(2);
    result[0].type.should.be.equal('column');
    should.not.exist(result[0].joinType);
    result[1].type.should.be.equal('column');
    should.not.exist(result[1].joinType);

    done();
  });

  it('should handle case-insensitive join types', function (done) {
    var result = selectParser.parseSelect('trading_partners!LEFT(name)');

    result[0].joinType.should.be.equal('left');

    done();
  });

  it('should parse mixed: columns, relations with and without modifiers', function (done) {
    var result = selectParser.parseSelect('id,orders!inner(total),customers!left(name),tags(id)');

    result.length.should.be.equal(4);

    result[0].type.should.be.equal('column');
    result[0].name.should.be.equal('id');

    result[1].type.should.be.equal('relation');
    result[1].name.should.be.equal('orders');
    result[1].joinType.should.be.equal('inner');
    result[1].columns.should.be.equal('total');

    result[2].type.should.be.equal('relation');
    result[2].name.should.be.equal('customers');
    result[2].joinType.should.be.equal('left');
    result[2].columns.should.be.equal('name');

    result[3].type.should.be.equal('relation');
    result[3].name.should.be.equal('tags');
    should.not.exist(result[3].joinType);
    result[3].columns.should.be.equal('id');

    done();
  });

  it('parseItem should be exported and work directly', function (done) {
    var result = selectParser.parseItem('orders!inner(id,total)');

    result.type.should.be.equal('relation');
    result.name.should.be.equal('orders');
    result.joinType.should.be.equal('inner');
    result.columns.should.be.equal('id,total');

    done();
  });
});

describe(__filename + ':: Join Modifier QueryBuilder Tests', function () {

  // Mock metaDb for QueryBuilder tests
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
        columns: [
          { column_name: 'id' },
          { column_name: 'name' },
          { column_name: 'code' }
        ],
        primaryKeys: [{ column_name: 'id' }],
        foreignKeys: []
      },
      line_items: {
        columns: [
          { column_name: 'id' },
          { column_name: 'document_id' },
          { column_name: 'quantity' }
        ],
        primaryKeys: [{ column_name: 'id' }],
        foreignKeys: [
          { column_name: 'document_id', referenced_table_name: 'documents', referenced_column_name: 'id' }
        ]
      }
    }
  };

  it('should not accumulate inner join conditions for !left modifier', function (done) {
    var qb = new QueryBuilderService(mockMetaDb);
    // N:1 relation (documents -> trading_partners via FK), !left
    var cols = qb.resolveSelectColumns('documents', 'id,trading_partners!left(name)');
    var conditions = qb.getAndClearInnerJoinConditions();

    conditions.length.should.be.equal(0);
    cols.should.containEql('AS trading_partners');

    done();
  });

  it('should not accumulate conditions when no modifier is present', function (done) {
    var qb = new QueryBuilderService(mockMetaDb);
    var cols = qb.resolveSelectColumns('documents', 'id,trading_partners(name)');
    var conditions = qb.getAndClearInnerJoinConditions();

    conditions.length.should.be.equal(0);

    done();
  });

  it('should accumulate WHERE EXISTS for N:1 relation with !inner', function (done) {
    var qb = new QueryBuilderService(mockMetaDb);
    // documents has FK trading_partner_id -> trading_partners
    // This is N:1 (parent has FK to child), so fkToChild path
    var cols = qb.resolveSelectColumns('documents', 'id,trading_partners!inner(name)');
    var conditions = qb.getAndClearInnerJoinConditions();

    conditions.length.should.be.equal(1);
    conditions[0].should.containEql('EXISTS');
    conditions[0].should.containEql('trading_partners');

    done();
  });

  it('should accumulate WHERE EXISTS for 1:N relation with !inner', function (done) {
    var qb = new QueryBuilderService(mockMetaDb);
    // documents is parent, line_items has FK to documents
    // This is 1:N (child has FK to parent), so fkToParent path
    var cols = qb.resolveSelectColumns('documents', 'id,line_items!inner(quantity)');
    var conditions = qb.getAndClearInnerJoinConditions();

    conditions.length.should.be.equal(1);
    conditions[0].should.containEql('EXISTS');
    conditions[0].should.containEql('line_items');
    conditions[0].should.containEql('document_id');

    done();
  });

  it('should clear conditions after getAndClearInnerJoinConditions', function (done) {
    var qb = new QueryBuilderService(mockMetaDb);
    qb.resolveSelectColumns('documents', 'id,line_items!inner(quantity)');

    var first = qb.getAndClearInnerJoinConditions();
    first.length.should.be.equal(1);

    var second = qb.getAndClearInnerJoinConditions();
    second.length.should.be.equal(0);

    done();
  });

  it('should accumulate multiple inner join conditions', function (done) {
    var qb = new QueryBuilderService(mockMetaDb);
    var cols = qb.resolveSelectColumns('documents', 'id,trading_partners!inner(name),line_items!inner(quantity)');
    var conditions = qb.getAndClearInnerJoinConditions();

    conditions.length.should.be.equal(2);

    done();
  });

  it('should pass hint through with join modifier for N:1 relation', function (done) {
    var qb = new QueryBuilderService(mockMetaDb);
    // trading_partner_id:trading_partners!inner(name) — hint + joinType
    var cols = qb.resolveSelectColumns('documents', 'id,trading_partner_id:trading_partners!inner(name)');
    var conditions = qb.getAndClearInnerJoinConditions();

    conditions.length.should.be.equal(1);
    conditions[0].should.containEql('EXISTS');
    cols.should.containEql('AS trading_partners');

    done();
  });
});

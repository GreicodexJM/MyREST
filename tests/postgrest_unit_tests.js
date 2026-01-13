'use strict';

var should = require('should');
var postgrestWhereClause = require('../lib/util/postgrestWhereClause.helper.js');

describe('postgrest where clause unit tests', function () {

  it('eq operator ?id=eq.123 should PASS', function (done) {
    var err = postgrestWhereClause.getWhereClause({ id: 'eq.123' })
    err.query.should.be.equal('?? = ?')
    err.params[0].should.be.equal('id')
    err.params[1].should.be.equal('123')
    done()
  });

  it('gt operator ?age=gt.18 should PASS', function (done) {
    var err = postgrestWhereClause.getWhereClause({ age: 'gt.18' })
    err.query.should.be.equal('?? > ?')
    err.params[0].should.be.equal('age')
    err.params[1].should.be.equal('18')
    done()
  });

  it('multiple conditions ?age=gt.18&status=eq.active should PASS', function (done) {
    var err = postgrestWhereClause.getWhereClause({ age: 'gt.18', status: 'eq.active' })
    err.query.should.be.equal('?? > ? AND ?? = ?')
    err.params[0].should.be.equal('age')
    err.params[1].should.be.equal('18')
    err.params[2].should.be.equal('status')
    err.params[3].should.be.equal('active')
    done()
  });

  it('multiple conditions on same column ?age=gt.18&age=lt.30 should PASS', function (done) {
    // Express parses ?age=gt.18&age=lt.30 as { age: ['gt.18', 'lt.30'] }
    var err = postgrestWhereClause.getWhereClause({ age: ['gt.18', 'lt.30'] })
    err.query.should.be.equal('?? > ? AND ?? < ?')
    err.params[0].should.be.equal('age')
    err.params[1].should.be.equal('18')
    err.params[2].should.be.equal('age')
    err.params[3].should.be.equal('30')
    done()
  });

  it('is null operator ?status=is.null should PASS', function (done) {
    var err = postgrestWhereClause.getWhereClause({ status: 'is.null' })
    err.query.should.be.equal('?? IS NULL') // Or ?? IS ? with null param, but helpers handles it specific
    err.params[0].should.be.equal('status')
    // value param might be skipped if handled in query string
    // Let's check implementation: if c.value === null && op === '=', query is '?? IS NULL', params pushes column only.
    // Wait, getComparisonOperator('is') returns 'IS'.
    // parseCondition: val='null' -> val=null.
    // loop: c.value === null. c.operator is 'IS'.
    // Logic: if (c.value === null) { if (op==='=') ... return `?? ${c.operator} NULL` }
    // So it returns `?? IS NULL`.
    // params: push column. if (c.value !== null ...) 
    // So params should have 1 element.
    err.params.length.should.be.equal(1)
    done()
  });

  it('in operator ?id=in.(1,2,3) should PASS', function (done) {
    var err = postgrestWhereClause.getWhereClause({ id: 'in.(1,2,3)' })
    err.query.should.be.equal('?? IN (?)')
    err.params[0].should.be.equal('id')
    err.params[1].should.be.eql(['1', '2', '3']) // eql for deep equality
    done()
  });
  
  it('like operator ?name=like.John* should PASS', function (done) {
    var err = postgrestWhereClause.getWhereClause({ name: 'like.John*' })
    err.query.should.be.equal('?? LIKE ?')
    err.params[0].should.be.equal('name')
    err.params[1].should.be.equal('John*')
    done()
  });
  
  it('ignore unknown operators ?id=unknown.123 should PASS (ignore)', function (done) {
    var err = postgrestWhereClause.getWhereClause({ id: 'unknown.123' })
    err.query.should.be.equal('')
    err.params.length.should.be.equal(0)
    done()
  });

  it('ignore reserved keywords ?select=id,name should PASS (ignore)', function (done) {
    var err = postgrestWhereClause.getWhereClause({ select: 'id,name' })
    err.query.should.be.equal('')
    err.params.length.should.be.equal(0)
    done()
  });

});

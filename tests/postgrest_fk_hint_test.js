'use strict';

var should = require('should');
var selectParser = require('../lib/util/selectParser.helper.js');

describe(__filename + ':: PostgREST FK Hint Syntax Unit Tests', function () {

  it('should parse simple column:table() hint syntax', function (done) {
    var result = selectParser.parseSelect('id,trading_partner_id:trading_partner_templates(*)');
    
    result.length.should.be.equal(2);
    result[0].type.should.be.equal('column');
    result[0].name.should.be.equal('id');
    
    result[1].type.should.be.equal('relation');
    result[1].name.should.be.equal('trading_partner_templates');
    result[1].hint.should.be.equal('trading_partner_id');
    result[1].columns.should.be.equal('*');
    
    done();
  });

  it('should parse column:table(nested_cols) with specific columns', function (done) {
    var result = selectParser.parseSelect('user_id:users(id,name,email)');
    
    result.length.should.be.equal(1);
    result[0].type.should.be.equal('relation');
    result[0].name.should.be.equal('users');
    result[0].hint.should.be.equal('user_id');
    result[0].columns.should.be.equal('id,name,email');
    
    done();
  });

  it('should parse mixed syntax: regular columns, relations without hints, and relations with hints', function (done) {
    var result = selectParser.parseSelect('id,name,category_id:categories(*),tags(name)');
    
    result.length.should.be.equal(4);
    
    result[0].type.should.be.equal('column');
    result[0].name.should.be.equal('id');
    
    result[1].type.should.be.equal('column');
    result[1].name.should.be.equal('name');
    
    result[2].type.should.be.equal('relation');
    result[2].name.should.be.equal('categories');
    result[2].hint.should.be.equal('category_id');
    result[2].columns.should.be.equal('*');
    
    result[3].type.should.be.equal('relation');
    result[3].name.should.be.equal('tags');
    should.not.exist(result[3].hint);
    result[3].columns.should.be.equal('name');
    
    done();
  });

  it('should parse nested relations with hints', function (done) {
    var result = selectParser.parseSelect('id,author_id:authors(id,name,country_id:countries(name))');
    
    result.length.should.be.equal(2);
    
    result[0].type.should.be.equal('column');
    result[0].name.should.be.equal('id');
    
    result[1].type.should.be.equal('relation');
    result[1].name.should.be.equal('authors');
    result[1].hint.should.be.equal('author_id');
    result[1].columns.should.be.equal('id,name,country_id:countries(name)');
    
    done();
  });

  it('should handle relation without hint (backward compatibility)', function (done) {
    var result = selectParser.parseSelect('id,users(id,name)');
    
    result.length.should.be.equal(2);
    
    result[0].type.should.be.equal('column');
    result[0].name.should.be.equal('id');
    
    result[1].type.should.be.equal('relation');
    result[1].name.should.be.equal('users');
    should.not.exist(result[1].hint);
    result[1].columns.should.be.equal('id,name');
    
    done();
  });

  it('should parse all columns with relation hint', function (done) {
    var result = selectParser.parseSelect('*,trading_partner_id:trading_partner_templates(*)');
    
    result.length.should.be.equal(2);
    
    result[0].type.should.be.equal('column');
    result[0].name.should.be.equal('*');
    
    result[1].type.should.be.equal('relation');
    result[1].name.should.be.equal('trading_partner_templates');
    result[1].hint.should.be.equal('trading_partner_id');
    result[1].columns.should.be.equal('*');
    
    done();
  });

  it('should parse column exclusion with relation hint', function (done) {
    var result = selectParser.parseSelect('*,-password,user_id:profiles(*)');
    
    result.length.should.be.equal(3);
    
    result[0].type.should.be.equal('column');
    result[0].name.should.be.equal('*');
    
    result[1].type.should.be.equal('column');
    result[1].name.should.be.equal('-password');
    
    result[2].type.should.be.equal('relation');
    result[2].name.should.be.equal('profiles');
    result[2].hint.should.be.equal('user_id');
    result[2].columns.should.be.equal('*');
    
    done();
  });

});

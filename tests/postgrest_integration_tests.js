'use strict';

var bodyParser = require('body-parser')
var express = require('express')
var mysql = require('mysql2')
var Xapi = require('../lib/xapi.js')
var should = require('should');
var request = require('supertest')

var args = {}
var app = {}
var agent = {}
var api = {}
var mysqlPool = {}
var server = {}

args['host'] = 'localhost'
args['user'] = 'root'
args['password'] = 'toor'
args['database'] = 'classicmodels'
args['decimalNumbers'] = true

describe(__filename + ':: myrest : postgrest integration tests', function () {

  before(function (done) {
    mysqlPool = mysql.createPool(args)
    app = express()
    app.use(bodyParser.json())
    app.use(bodyParser.urlencoded({ extended: true }))
    agent = request.agent(app);

    api = new Xapi(args, mysqlPool, app)
    api.init(function (err, results) {
      if (err) {
        process.exit(1)
      }
      server = app.listen(3002)
      done();
    })
  });

  after(function (done) {
    mysqlPool.end(function (err) {
      server.close(done);
    })
  });

  it('GET /api/payments?customerNumber=eq.103 should PASS', function (done) {
    agent.get('/api/payments?customerNumber=eq.103')
      .expect(200)
      .end(function (err, res) {
        if (err) return done(err);
        res.body.length.should.be.above(0);
        res.body[0]['customerNumber'].should.be.equal(103);
        return done();
      });
  });

  it('GET /api/payments?amount=gte.1000&customerNumber=lte.120 should PASS', function (done) {
    agent.get('/api/payments?amount=gte.1000&customerNumber=lte.120')
      .expect(200)
      .end(function (err, res) {
        if (err) return done(err);
        res.body.length.should.be.equal(13); // Same number as equivalent _where test
        return done();
      });
  });

  it('GET /api/offices?city=eq.Boston should PASS', function (done) {
    agent.get('/api/offices?city=eq.Boston')
      .expect(200)
      .end(function (err, res) {
        if (err) return done(err);
        res.body.length.should.be.equal(1);
        res.body[0]['city'].should.be.equal('Boston');
        return done();
      });
  });
  
  it('GET /api/offices?city=in.(Boston,NYC,Paris) should PASS', function (done) {
    agent.get('/api/offices?city=in.(Boston,NYC,Paris)')
      .expect(200)
      .end(function (err, res) {
        if (err) return done(err);
        // Boston: 1, NYC: 1, Paris: 1. Total 3.
        res.body.length.should.be.equal(3); 
        return done();
      });
  });

  it('GET /api/payments?select=checkNumber,amount should PASS', function (done) {
    agent.get('/api/payments?select=checkNumber,amount')
      .expect(200)
      .end(function (err, res) {
        if (err) return done(err);
        res.body.length.should.be.above(0);
        Object.keys(res.body[0]).length.should.be.equal(2);
        res.body[0].should.have.property('checkNumber');
        res.body[0].should.have.property('amount');
        return done();
      });
  });

  it('GET /api/payments?order=amount.desc&limit=1 should PASS', function (done) {
    agent.get('/api/payments?order=amount.desc&limit=1')
      .expect(200)
      .end(function (err, res) {
        if (err) return done(err);
        res.body.length.should.be.equal(1);
        // Highest amount in sample data is 120166.58
        res.body[0]['amount'].should.be.equal(120166.58);
        return done();
      });
  });

  it('GET /api/payments?limit=5&offset=5 should PASS', function (done) {
    agent.get('/api/payments?limit=5&offset=5')
      .expect(200)
      .end(function (err, res) {
        if (err) return done(err);
        res.body.length.should.be.equal(5);
        return done();
      });
  });

  it('DELETE /api/productlines?productLine=eq.TestDelete should PASS', function (done) {
    // First Insert
    agent.post('/api/productlines')
      .send({ productLine: 'TestDelete', textDescription: 'To be deleted' })
      .expect(200)
      .end(function(err, res) {
          if(err) return done(err);
          
          // Then Delete with filter
          agent.delete('/api/productlines?productLine=eq.TestDelete')
            .expect(200)
            .end(function(err, res) {
              if(err) return done(err);
              res.body.affectedRows.should.be.equal(1);
              
              // Verify deleted
               agent.get('/api/productlines?productLine=eq.TestDelete')
                 .expect(200)
                 .end(function(err, res) {
                   if(err) return done(err);
                   res.body.length.should.be.equal(0);
                   done();
                 });
            });
      });
  });

});

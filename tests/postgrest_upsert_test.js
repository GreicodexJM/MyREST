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

describe('myrest : postgrest upsert tests', function () {

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
      server = app.listen(3004)
      done();
    })
  });

  after(function (done) {
    mysqlPool.end(function (err) {
      server.close(done);
    })
  });

  it('Upsert - Merge Duplicates (Single)', function (done) {
    // 1. Create a row
    agent.post('/api/productlines')
      .send({ productLine: 'UpsertTest', textDescription: 'Original' })
      .expect(200)
      .end(function(err, res) {
          if(err) return done(err);
          
          // 2. Upsert (Update)
          agent.post('/api/productlines')
            .set('Resolution', 'merge-duplicates')
            .send({ productLine: 'UpsertTest', textDescription: 'Updated' })
            .expect(200)
            .end(function(err, res) {
                if(err) return done(err);
                
                // 3. Verify Update
                agent.get('/api/productlines/UpsertTest')
                  .expect(200)
                  .end(function(err, res) {
                      if(err) return done(err);
                      res.body[0].textDescription.should.equal('Updated');
                      
                      // Cleanup
                      agent.delete('/api/productlines/UpsertTest').end(done);
                  });
            });
      });
  });

  it('Upsert - Ignore Duplicates (Single)', function (done) {
    // 1. Create a row
    agent.post('/api/productlines')
      .send({ productLine: 'IgnoreTest', textDescription: 'Original' })
      .expect(200)
      .end(function(err, res) {
          if(err) return done(err);
          
          // 2. Insert Ignore
          agent.post('/api/productlines')
            .set('Resolution', 'ignore-duplicates')
            .send({ productLine: 'IgnoreTest', textDescription: 'New' })
            .expect(200)
            .end(function(err, res) {
                if(err) return done(err);
                
                // 3. Verify NOT Updated
                agent.get('/api/productlines/IgnoreTest')
                  .expect(200)
                  .end(function(err, res) {
                      if(err) return done(err);
                      res.body[0].textDescription.should.equal('Original');
                      
                      // Cleanup
                      agent.delete('/api/productlines/IgnoreTest').end(done);
                  });
            });
      });
  });

});

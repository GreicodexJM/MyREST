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

describe('myrest : postgrest embedding tests', function () {

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
      server = app.listen(3003)
      done();
    })
  });

  after(function (done) {
    mysqlPool.end(function (err) {
      server.close(done);
    })
  });

  it('1:N - Customers with Orders: should return array of orders', function (done) {
    // customers 103 has orders
    agent.get('/api/customers?customerNumber=eq.103&select=customerNumber,customerName,orders(orderNumber,status)')
      .expect(200)
      .end(function (err, res) {
        if (err) return done(err);
        res.body.length.should.be.equal(1);
        var cust = res.body[0];
        cust.should.have.property('orders');
        cust.orders.should.be.an.Array();
        cust.orders.length.should.be.above(0);
        cust.orders[0].should.have.property('orderNumber');
        cust.orders[0].should.have.property('status');
        return done();
      });
  });

  it('N:1 - Orders with Customer: should return customer object', function (done) {
    agent.get('/api/orders?orderNumber=eq.10123&select=orderNumber,customers(customerNumber,customerName)')
      .expect(200)
      .end(function (err, res) {
        if (err) return done(err);
        res.body.length.should.be.equal(1);
        var order = res.body[0];
        order.should.have.property('customers');
        order.customers.should.be.an.Object();
        order.customers.should.have.property('customerName');
        // It should NOT be an array
        Array.isArray(order.customers).should.be.false();
        return done();
      });
  });

  it('Nested - Customers -> Orders -> OrderDetails', function (done) {
    agent.get('/api/customers?customerNumber=eq.103&select=customerNumber,orders(orderNumber,orderdetails(productCode,quantityOrdered))')
      .expect(200)
      .end(function (err, res) {
        if (err) return done(err);
        res.body.length.should.be.equal(1);
        var cust = res.body[0];
        cust.orders.should.be.an.Array();
        cust.orders[0].should.have.property('orderdetails');
        cust.orders[0].orderdetails.should.be.an.Array();
        cust.orders[0].orderdetails[0].should.have.property('productCode');
        return done();
      });
  });
  
  it('Empty Relation - Customer with no orders (if any)', function(done) {
     // Insert a dummy customer with no orders
     agent.post('/api/customers')
       .send({ 
           customerNumber: 9999, 
           customerName: 'No Orders Inc', 
           contactLastName: 'Doe', 
           contactFirstName: 'John', 
           phone: '123', 
           addressLine1: 'Street', 
           city: 'City', 
           country: 'USA' 
       })
       .end(function(err, res) {
           agent.get('/api/customers?customerNumber=eq.9999&select=customerNumber,orders(orderNumber)')
             .expect(200)
             .end(function(err, res) {
                 if(err) return done(err);
                 res.body.length.should.be.equal(1);
                 // Should be empty array []
                 res.body[0].orders.should.be.an.Array();
                 res.body[0].orders.length.should.be.equal(0);
                 
                 // Cleanup
                 agent.delete('/api/customers/9999').end(done);
             });
       });
  });

});

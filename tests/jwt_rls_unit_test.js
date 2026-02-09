'use strict';

var should = require('should');
var Xsql = require('../lib/xsql.js');

describe(__filename + ':: JWT and RLS Unit Tests', function () {

    it('should set session variables when context is provided', function (done) {
        
        let queriesExecuted = [];
        let connectionReleased = false;

        let mockConnection = {
            query: function(query, params, cb) {
                queriesExecuted.push({ query, params });
                cb(null, []);
            },
            release: function() {
                connectionReleased = true;
            }
        };

        let mockPool = {
            getConnection: function(cb) {
                cb(null, mockConnection);
            },
            query: function(query, params, cb) {
                // Should not be called when context is present
                done(new Error('pool.query called instead of connection.query'));
            }
        };

        let xsql = new Xsql({}, mockPool);
        
        // Mocking metaDb since exec might not need it but let's be safe if I were testing other methods
        // But exec only uses pool.

        let context = {
            role: 'user',
            sub: '123',
            email: 'test@example.com'
        };

        let mainQuery = 'SELECT * FROM users';
        let mainParams = [];

        xsql.exec(mainQuery, mainParams, context).then(() => {
            
            // Verify connection was released
            connectionReleased.should.be.true();

            // Verify queries
            // First query should be SET ...
            // Second query should be mainQuery

            queriesExecuted.length.should.be.equal(2);

            let setQuery = queriesExecuted[0];
            setQuery.query.should.startWith('SET');
            setQuery.query.should.containEql('@request_jwt_claim_role = ?');
            setQuery.query.should.containEql('@request_jwt_claim_sub = ?');
            setQuery.query.should.containEql('@request_jwt_claim_email = ?');
            
            // Check params order matches (it iterates object keys, order might vary but usually consistent in JS engines)
            // We can just check existence.
            setQuery.params.should.containEql('user');
            setQuery.params.should.containEql('123');
            setQuery.params.should.containEql('test@example.com');

            let query = queriesExecuted[1];
            query.query.should.be.equal(mainQuery);

            done();

        }).catch(done);

    });

    it('should fall back to pool.query when no context is provided', function (done) {
        
        let poolQueryCalled = false;

        let mockPool = {
            getConnection: function(cb) {
                done(new Error('pool.getConnection called instead of pool.query'));
            },
            query: function(query, params, cb) {
                poolQueryCalled = true;
                cb(null, []);
            }
        };

        let xsql = new Xsql({}, mockPool);
        let mainQuery = 'SELECT * FROM users';

        xsql.exec(mainQuery, [], null).then(() => {
            poolQueryCalled.should.be.true();
            done();
        }).catch(done);

    });

    it('should sanitize context keys', function (done) {
        
        let queriesExecuted = [];

        let mockConnection = {
            query: function(query, params, cb) {
                queriesExecuted.push({ query, params });
                cb(null, []);
            },
            release: function() {}
        };

        let mockPool = {
            getConnection: function(cb) {
                cb(null, mockConnection);
            }
        };

        let xsql = new Xsql({}, mockPool);
        
        let context = {
            'bad-key; --': 'val'
        };

        xsql.exec('SELECT 1', [], context).then(() => {
            
            let setQuery = queriesExecuted[0].query;
            // bad-key; -- should be replaced by bad_key____
            // regex was /[^a-zA-Z0-9_]/g replaced with _
            
            setQuery.should.containEql('@request_jwt_claim_bad_key____ = ?');
            done();

        }).catch(done);


    });

});

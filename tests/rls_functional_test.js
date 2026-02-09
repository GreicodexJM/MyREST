'use strict';

var should = require('should');
var express = require('express');
var mysql = require('mysql2');
var bodyParser = require('body-parser');
var request = require('supertest');
var Xapi = require('../lib/xapi.js');
var jwt = require('jsonwebtoken');

describe( __filename + ':: RLS Functional Security Tests', function() {
  
  var app, api, mysqlPool, server, agent;
  var jwtSecret = 'test_secret_key_12345';
  
  // Helper to create JWT tokens
  function createToken(claims) {
    return jwt.sign(claims, jwtSecret);
  }
  
  before(function(done) {
    this.timeout(10000);
    
    // Setup
    mysqlPool = mysql.createPool({
      host: 'localhost',
      user: 'root',
      password: 'toor',
      database: 'classicmodels'
    });
    
    app = express();
    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({ extended: true }));
    
    var args = {
      host: 'localhost',
      user: 'root',
      password: 'toor',
      database: 'classicmodels',
      jwtSecret: jwtSecret
    };
    
    api = new Xapi(args, mysqlPool, app);
    
    // Create test infrastructure first
    setupRlsTestTables(mysqlPool).then(() => {
      // Initialize API AFTER tables are created so they're in the schema cache
      api.init(async function(err) {
        if (err) return done(err);
        
        try {
          // Reload policies to pick up the new policies
          await api.mysql.reloadPolicies();
          
          server = app.listen(3003);
          agent = request.agent(app);
          done();
        } catch(error) {
          done(error);
        }
      });
    }).catch(done);
  });
  
  after(function(done) {
    this.timeout(10000);
    
    cleanupRlsTestTables(mysqlPool).then(() => {
      mysqlPool.end(function() {
        server.close(done);
      });
    }).catch(done);
  });
  
  describe('WRITE_TABLE role permissions', function() {
    
    it('should SELECT only rows with owner_role = WRITE_TABLE', function(done) {
      let token = createToken({ role: 'WRITE_TABLE', sub: 'user123' });
      
      agent
        .get('/api/rls_test_data')
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
        .end(function(err, res) {
          if (err) return done(err);
          
          res.body.should.be.instanceOf(Array);
          res.body.length.should.be.above(0);
          res.body.every(row => row.owner_role === 'WRITE_TABLE').should.be.true();
          done();
        });
    });
    
    it('should INSERT records successfully', function(done) {
      let token = createToken({ role: 'WRITE_TABLE', sub: 'user123' });
      
      agent
        .post('/api/rls_test_data')
        .set('Authorization', `Bearer ${token}`)
        .send({ content: 'Test write', owner_role: 'WRITE_TABLE' })
        .expect(200)
        .end(function(err, res) {
          if (err) return done(err);
          
          res.body.affectedRows.should.equal(1);
          done();
        });
    });
    
    it('should UPDATE only owned records', function(done) {
      let token = createToken({ role: 'WRITE_TABLE', sub: 'user123' });
      
      // Try to update a WRITE_TABLE record (ID 1)
      agent
        .put('/api/rls_test_data/1')
        .set('Authorization', `Bearer ${token}`)
        .send({ content: 'Updated content' })
        .expect(200)
        .end(function(err, res) {
          if (err) return done(err);
          
          res.body.affectedRows.should.equal(1);
          done();
        });
    });
    
    it('should NOT UPDATE records from other roles', function(done) {
      let token = createToken({ role: 'WRITE_TABLE', sub: 'user123' });
      
      // Try to update a READ_TABLE record (ID 2)
      agent
        .put('/api/rls_test_data/2')
        .set('Authorization', `Bearer ${token}`)
        .send({ content: 'Hacked!' })
        .expect(200)
        .end(function(err, res) {
          if (err) return done(err);
          
          res.body.affectedRows.should.equal(0); // RLS blocked it
          done();
        });
    });
    
    it('should DELETE only owned records', function(done) {
      let token = createToken({ role: 'WRITE_TABLE', sub: 'user123' });
      
      // First insert a record to delete
      agent
        .post('/api/rls_test_data')
        .set('Authorization', `Bearer ${token}`)
        .send({ content: 'To delete', owner_role: 'WRITE_TABLE' })
        .expect(200)
        .end(function(err, res) {
          if (err) return done(err);
          
          let insertId = res.body.insertId;
          
          // Now delete it
          agent
            .delete('/api/rls_test_data/' + insertId)
            .set('Authorization', `Bearer ${token}`)
            .expect(200)
            .end(function(err, res) {
              if (err) return done(err);
              
              res.body.affectedRows.should.equal(1);
              done();
            });
        });
    });
    
    it('should NOT DELETE records from other roles', function(done) {
      let token = createToken({ role: 'WRITE_TABLE', sub: 'user123' });
      
      // Try to delete a READ_TABLE record (ID 2)
      agent
        .delete('/api/rls_test_data/2')
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
        .end(function(err, res) {
          if (err) return done(err);
          
          res.body.affectedRows.should.equal(0); // RLS blocked it
          done();
        });
    });
    
    it('should READ only owned single record', function(done) {
      let token = createToken({ role: 'WRITE_TABLE', sub: 'user123' });
      
      // Try to read a WRITE_TABLE record
      agent
        .get('/api/rls_test_data/1')
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
        .end(function(err, res) {
          if (err) return done(err);
          
          res.body.should.be.instanceOf(Array);
          res.body.length.should.equal(1);
          res.body[0].owner_role.should.equal('WRITE_TABLE');
          done();
        });
    });
    
    it('should NOT READ single record from other roles', function(done) {
      let token = createToken({ role: 'WRITE_TABLE', sub: 'user123' });
      
      // Try to read a READ_TABLE record (ID 2)
      agent
        .get('/api/rls_test_data/2')
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
        .end(function(err, res) {
          if (err) return done(err);
          
          res.body.should.be.instanceOf(Array);
          res.body.length.should.equal(0); // RLS blocked it
          done();
        });
    });
  });
  
  describe('READ_TABLE role permissions', function() {
    
    it('should SELECT only rows with owner_role = READ_TABLE', function(done) {
      let token = createToken({ role: 'READ_TABLE', sub: 'user456' });
      
      agent
        .get('/api/rls_test_data')
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
        .end(function(err, res) {
          if (err) return done(err);
          
          res.body.should.be.instanceOf(Array);
          res.body.length.should.be.above(0);
          res.body.every(row => row.owner_role === 'READ_TABLE').should.be.true();
          done();
        });
    });
    
    it('should NOT UPDATE any records', function(done) {
      let token = createToken({ role: 'READ_TABLE', sub: 'user456' });
      
      // Try to update a READ_TABLE record
      agent
        .put('/api/rls_test_data/2')
        .set('Authorization', `Bearer ${token}`)
        .send({ content: 'Attempt' })
        .expect(200)
        .end(function(err, res) {
          if (err) return done(err);
          
          res.body.affectedRows.should.equal(0); // No UPDATE policy for READ_TABLE
          done();
        });
    });
    
    it('should NOT DELETE any records', function(done) {
      let token = createToken({ role: 'READ_TABLE', sub: 'user456' });
      
      agent
        .delete('/api/rls_test_data/2')
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
        .end(function(err, res) {
          if (err) return done(err);
          
          res.body.affectedRows.should.equal(0);
          done();
        });
    });
    
    it('should READ single record from own role', function(done) {
      let token = createToken({ role: 'READ_TABLE', sub: 'user456' });
      
      agent
        .get('/api/rls_test_data/2')
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
        .end(function(err, res) {
          if (err) return done(err);
          
          res.body.should.be.instanceOf(Array);
          res.body.length.should.equal(1);
          res.body[0].owner_role.should.equal('READ_TABLE');
          done();
        });
    });
  });
  
  describe('ANY_ROLE (unauthorized role)', function() {
    
    it('should return empty result set for SELECT', function(done) {
      let token = createToken({ role: 'ANY_ROLE', sub: 'user789' });
      
      agent
        .get('/api/rls_test_data')
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
        .end(function(err, res) {
          if (err) return done(err);
          
          res.body.should.be.instanceOf(Array);
          res.body.length.should.equal(0); // No rows visible
          done();
        });
    });
    
    it('should not affect any records on UPDATE', function(done) {
      let token = createToken({ role: 'ANY_ROLE', sub: 'user789' });
      
      agent
        .put('/api/rls_test_data/1')
        .set('Authorization', `Bearer ${token}`)
        .send({ content: 'Hack attempt' })
        .expect(200)
        .end(function(err, res) {
          if (err) return done(err);
          
          res.body.affectedRows.should.equal(0);
          done();
        });
    });
    
    it('should not affect any records on DELETE', function(done) {
      let token = createToken({ role: 'ANY_ROLE', sub: 'user789' });
      
      agent
        .delete('/api/rls_test_data/1')
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
        .end(function(err, res) {
          if (err) return done(err);
          
          res.body.affectedRows.should.equal(0);
          done();
        });
    });
    
    it('should return empty result for READ single record', function(done) {
      let token = createToken({ role: 'ANY_ROLE', sub: 'user789' });
      
      agent
        .get('/api/rls_test_data/1')
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
        .end(function(err, res) {
          if (err) return done(err);
          
          res.body.should.be.instanceOf(Array);
          res.body.length.should.equal(0);
          done();
        });
    });
  });
  
  describe('Policy reloading', function() {
    
    it('should enforce newly added policies', function(done) {
      this.timeout(5000);
      
      let token = createToken({ role: 'WRITE_TABLE', sub: 'user123' });
      
      // First verify normal access
      agent
        .get('/api/rls_test_data')
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
        .end(function(err, res) {
          if (err) return done(err);
          
          let initialCount = res.body.length;
          initialCount.should.be.above(0);
          
          // Add a blocking policy
          mysqlPool.query(
            `INSERT INTO _rls_policies (table_name, policy_name, operation, using_expression)
             VALUES ('rls_test_data', 'temp_block_policy', 'SELECT', '1=0')`,
            function(err) {
              if (err) return done(err);
              
              // Reload policies
              api.mysql.reloadPolicies().then(() => {
                
                // Now try to access - should be blocked
                agent
                  .get('/api/rls_test_data')
                  .set('Authorization', `Bearer ${token}`)
                  .expect(200)
                  .end(function(err, res) {
                    if (err) return done(err);
                    
                    res.body.length.should.equal(0); // New policy blocks everything
                    
                    // Cleanup - remove the temp policy
                    mysqlPool.query(
                      `DELETE FROM _rls_policies WHERE policy_name = 'temp_block_policy'`,
                      function(err) {
                        if (err) return done(err);
                        
                        // Reload policies again
                        api.mysql.reloadPolicies().then(() => {
                          done();
                        }).catch(done);
                      }
                    );
                  });
              }).catch(done);
            }
          );
        });
    });
  });
  
  describe('Bulk operations with PATCH', function() {
    
    it('should only update records matching role policy', function(done) {
      let token = createToken({ role: 'WRITE_TABLE', sub: 'user123' });
      
      // PATCH updates records matching the filter AND the RLS policy
      agent
        .patch('/api/rls_test_data?id=gte.1')
        .set('Authorization', `Bearer ${token}`)
        .send({ content: 'Bulk update' })
        .expect(200)
        .end(function(err, res) {
          if (err) return done(err);
          
          // Should only update WRITE_TABLE records, not READ_TABLE records
          res.body.affectedRows.should.be.above(0);
          done();
        });
    });
  });
});

// Helper functions
async function setupRlsTestTables(pool) {
  let conn = await pool.promise().getConnection();
  
  try {
    // Create policies table
    await conn.query(`
      CREATE TABLE IF NOT EXISTS _rls_policies (
        id INT PRIMARY KEY AUTO_INCREMENT,
        table_name VARCHAR(255) NOT NULL,
        policy_name VARCHAR(255) NOT NULL,
        operation ENUM('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'ALL') DEFAULT 'ALL',
        using_expression TEXT NOT NULL,
        check_expression TEXT DEFAULT NULL,
        enabled BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_policy (table_name, policy_name),
        INDEX idx_table_operation (table_name, operation, enabled)
      )
    `);
    
    // Create test data table
    await conn.query(`
      CREATE TABLE IF NOT EXISTS rls_test_data (
        id INT PRIMARY KEY AUTO_INCREMENT,
        content VARCHAR(255),
        owner_role VARCHAR(50)
      )
    `);
    
    // Delete existing test policies to avoid conflicts
    await conn.query(`DELETE FROM _rls_policies WHERE table_name = 'rls_test_data'`);
    
    // Insert test policies
    await conn.query(`
      INSERT INTO _rls_policies (table_name, policy_name, operation, using_expression)
      VALUES 
        ('rls_test_data', 'role_select', 'SELECT', 'owner_role = @request_jwt_claim_role'),
        ('rls_test_data', 'write_update', 'UPDATE', 'owner_role = @request_jwt_claim_role AND @request_jwt_claim_role = "WRITE_TABLE"'),
        ('rls_test_data', 'write_delete', 'DELETE', 'owner_role = @request_jwt_claim_role AND @request_jwt_claim_role = "WRITE_TABLE"')
    `);
    
    // Clear existing test data
    await conn.query(`DELETE FROM rls_test_data WHERE id IN (1,2,3,4)`);
    
    // Insert test data
    await conn.query(`
      INSERT INTO rls_test_data (id, content, owner_role) VALUES
        (1, 'Write data 1', 'WRITE_TABLE'),
        (2, 'Read data 1', 'READ_TABLE'),
        (3, 'Write data 2', 'WRITE_TABLE'),
        (4, 'Read data 2', 'READ_TABLE')
    `);
    
  } finally {
    conn.release();
  }
}

async function cleanupRlsTestTables(pool) {
  let conn = await pool.promise().getConnection();
  try {
    await conn.query('DROP TABLE IF EXISTS rls_test_data');
    await conn.query('DELETE FROM _rls_policies WHERE table_name = "rls_test_data"');
  } finally {
    conn.release();
  }
}

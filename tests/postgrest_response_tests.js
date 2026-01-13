
const request = require('supertest');
const assert = require('assert');
const express = require('express');
const bodyParser = require('body-parser');
const mysql = require('mysql2');
const Xapi = require('../lib/xapi.js');

const dbConfig = {
    host: process.env.MYSQL_HOST || '127.0.0.1',
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || 'toor',
    database: process.env.MYSQL_DATABASE || 'sys'
};

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

let xapi;
let pool;
let server;

describe('PostgREST Response Format Tests', function () {
    this.timeout(10000);

    before(function (done) {
        pool = mysql.createPool(dbConfig);
        xapi = new Xapi({ ...dbConfig, dynamic: 0 }, pool, app);

        // Setup test tables
        const setup = async () => {
            const query = (sql) => new Promise((resolve, reject) => pool.query(sql, (err, res) => err ? reject(err) : resolve(res)));
            
            await query('DROP TABLE IF EXISTS test_child');
            await query('DROP TABLE IF EXISTS test_parent');
            await query('DROP TABLE IF EXISTS test_response');

            await query(`
                CREATE TABLE test_response (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    name VARCHAR(50),
                    value INT
                )
            `);
            
            await query(`
                CREATE TABLE test_parent (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    name VARCHAR(50)
                )
            `);
            
            await query(`
                CREATE TABLE test_child (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    parent_id INT,
                    details VARCHAR(50),
                    FOREIGN KEY (parent_id) REFERENCES test_parent(id)
                )
            `);

            // Seed test_response
            let values = [];
            for(let i=0; i<15; i++) {
                values.push(`('item${i}', ${i})`);
            }
            await query(`INSERT INTO test_response (name, value) VALUES ${values.join(',')}`);

            // Seed parent/child
            await query("INSERT INTO test_parent (name) VALUES ('Parent1')");
            const parentId = (await query("SELECT id FROM test_parent LIMIT 1"))[0].id;
            
            values = [];
            for(let i=0; i<15; i++) {
                values.push(`(${parentId}, 'child${i}')`);
            }
            await query(`INSERT INTO test_child (parent_id, details) VALUES ${values.join(',')}`);
        };

        setup().then(() => {
            xapi.init((err) => {
                if (err) return done(err);
                server = app.listen(0, () => {
                    console.log('Test server running');
                    done();
                });
            });
        }).catch(done);
    });

    after(function (done) {
        server.close();
        pool.end(done);
    });

    it('should return 200 and JSON array by default', function (done) {
        request(app)
            .get('/api/test_response')
            .expect(200)
            .expect('Content-Type', /json/)
            .end(function(err, res) {
                if (err) return done(err);
                assert(Array.isArray(res.body));
                assert.equal(res.body.length, 15);
                done();
            });
    });

    it('should return Content-Range header when Prefer: count=exact is sent', function (done) {
        request(app)
            .get('/api/test_response?limit=5')
            .set('Prefer', 'count=exact')
            .expect(200)
            .expect('Content-Range', '0-4/15')
            .end(function(err, res) {
                if (err) return done(err);
                assert(Array.isArray(res.body));
                assert.equal(res.body.length, 5);
                done();
            });
    });
    
    it('should return Content-Range with correct offset', function (done) {
        request(app)
            .get('/api/test_response?limit=5&offset=5')
            .set('Prefer', 'count=exact')
            .expect(200)
            .expect('Content-Range', '5-9/15')
            .end(function(err, res) {
                if (err) return done(err);
                assert(Array.isArray(res.body));
                assert.equal(res.body.length, 5);
                assert.equal(res.body[0].value, 5);
                done();
            });
    });
    
    it('should respect filters in count', function (done) {
        request(app)
            .get('/api/test_response?value=lt.10&limit=5')
            .set('Prefer', 'count=exact')
            .expect(200)
            .expect('Content-Range', '0-4/10')
            .end(function(err, res) {
                if (err) return done(err);
                assert(Array.isArray(res.body));
                assert.equal(res.body.length, 5);
                done();
            });
    });

    it('should return Content-Range: */0 for empty result with count=exact', function (done) {
        request(app)
            .get('/api/test_response?value=gt.100')
            .set('Prefer', 'count=exact')
            .expect(200)
            .expect('Content-Range', '*/0')
            .end(function(err, res) {
                if (err) return done(err);
                assert(Array.isArray(res.body));
                assert.equal(res.body.length, 0);
                done();
            });
    });

    // Nested List Tests
    it('should return Content-Range for nested list with count=exact', function (done) {
        // Need to find parent ID first, but we know it's likely 1 or we can query
        pool.query("SELECT id FROM test_parent LIMIT 1", (err, rows) => {
            const parentId = rows[0].id;
            request(app)
                .get(`/api/test_parent/${parentId}/test_child?limit=5`)
                .set('Prefer', 'count=exact')
                .expect(200)
                .expect('Content-Range', '0-4/15')
                .end(function(err, res) {
                    if (err) return done(err);
                    assert(Array.isArray(res.body));
                    assert.equal(res.body.length, 5);
                    done();
                });
        });
    });

    // Create Tests
    it('should return 200/201 and metadata by default on create', function (done) {
        request(app)
            .post('/api/test_response')
            .send({ name: 'newitem', value: 999 })
            .expect(200) // or 201
            .end(function(err, res) {
                if (err) return done(err);
                // MyREST returns result object from mysql2
                assert(res.body.insertId);
                done();
            });
    });

    it('should return created object when Prefer: return=representation is sent', function (done) {
        request(app)
            .post('/api/test_response')
            .set('Prefer', 'return=representation')
            .send({ name: 'returned_item', value: 888 })
            .expect(201) // PostgREST uses 201 usually
            .end(function(err, res) {
                if (err) return done(err);
                assert(Array.isArray(res.body));
                assert.equal(res.body.length, 1);
                assert.equal(res.body[0].name, 'returned_item');
                assert.equal(res.body[0].value, 888);
                done();
            });
    });

});

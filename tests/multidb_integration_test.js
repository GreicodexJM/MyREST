'use strict';

/**
 * Multi-database mode integration tests
 *
 * Spins up one MyREST instance exposing two databases on the same MySQL
 * server (classicmodels + myrest_multidb_test) and verifies:
 * - PostgREST profile headers (Accept-Profile / Content-Profile)
 * - Explicit db.table namespacing
 * - Deterministic resolution for unique unqualified names
 * - 400 on colliding unqualified names, 406 on unknown schemas
 * - Supabase SDK compatibility via @supabase/postgrest-js .schema()
 * - Request-scoped table resolution under concurrency (res.locals fix)
 */

const should = require('should');
const { PostgrestClient } = require('@supabase/postgrest-js');
const express = require('express');
const bodyParser = require('body-parser');
const mysql = require('mysql2');
const Xapi = require('../lib/xapi.js');

const SECOND_DB = 'myrest_multidb_test';

const baseConfig = {
  host: process.env.MYSQL_HOST || '127.0.0.1',
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || 'toor',
  database: process.env.MYSQL_DATABASE || 'classicmodels'
};

describe(__filename + ':: Multi-database integration', function () {
  this.timeout(20000);

  let adminPool;
  let pool;
  let app;
  let server;
  let baseUrl;

  before(function (done) {
    adminPool = mysql.createPool({ ...baseConfig, multipleStatements: true });
    adminPool.query(
      `CREATE DATABASE IF NOT EXISTS ${SECOND_DB};
       DROP TABLE IF EXISTS ${SECOND_DB}.offices;
       CREATE TABLE ${SECOND_DB}.offices (
         officeCode varchar(10) NOT NULL PRIMARY KEY,
         city varchar(50) NOT NULL,
         country varchar(50) NOT NULL
       );
       INSERT INTO ${SECOND_DB}.offices (officeCode, city, country) VALUES
         ('X1', 'Caracas', 'Venezuela'),
         ('X2', 'Bogota', 'Colombia');
       DROP TABLE IF EXISTS ${SECOND_DB}.warehouses;
       CREATE TABLE ${SECOND_DB}.warehouses (
         id INT AUTO_INCREMENT PRIMARY KEY,
         name varchar(50) NOT NULL
       );
       INSERT INTO ${SECOND_DB}.warehouses (name) VALUES ('Central'), ('North');`,
      (err) => {
        if (err) return done(err);

        app = express();
        app.use(bodyParser.json());
        app.use(bodyParser.urlencoded({ extended: true }));

        const config = {
          ...baseConfig,
          databases: [baseConfig.database, SECOND_DB],
          dynamic: 0
        };

        pool = mysql.createPool(baseConfig);
        const xapi = new Xapi(config, pool, app);
        xapi.init((err2) => {
          if (err2) return done(err2);
          server = app.listen(0, () => {
            baseUrl = `http://127.0.0.1:${server.address().port}`;
            done();
          });
        });
      }
    );
  });

  after(function (done) {
    adminPool.query(`DROP DATABASE IF EXISTS ${SECOND_DB}`, () => {
      adminPool.end(() => {
        pool.end(() => {
          if (server) server.close();
          done();
        });
      });
    });
  });

  async function api(path, options = {}) {
    const response = await fetch(baseUrl + path, options);
    let body = null;
    try {
      body = await response.json();
    } catch (e) { /* non-JSON */ }
    return { status: response.status, body };
  }

  describe('resolution rules', function () {

    it('unqualified colliding table -> 400 with candidates', async function () {
      const r = await api('/api/offices?_size=1');
      r.status.should.equal(400);
      r.body.message.should.match(/ambiguous/);
      r.body.message.should.match(/classicmodels\.offices/);
      r.body.message.should.match(new RegExp(`${SECOND_DB}\\.offices`));
    });

    it('Accept-Profile header selects the database', async function () {
      const r1 = await api('/api/offices?_size=100', {
        headers: { 'Accept-Profile': 'classicmodels' }
      });
      r1.status.should.equal(200);
      r1.body.length.should.be.above(2);

      const r2 = await api('/api/offices?_size=100', {
        headers: { 'Accept-Profile': SECOND_DB }
      });
      r2.status.should.equal(200);
      r2.body.length.should.equal(2);
      r2.body[0].country.should.equal('Venezuela');
    });

    it('explicit db.table namespacing works without headers', async function () {
      const r = await api(`/api/${SECOND_DB}.offices?_size=100`);
      r.status.should.equal(200);
      r.body.length.should.equal(2);

      const r2 = await api('/api/classicmodels.offices?_size=1');
      r2.status.should.equal(200);
      r2.body[0].should.have.property('city');
    });

    it('unqualified unique table resolves without headers', async function () {
      const r = await api('/api/warehouses?_size=100');
      r.status.should.equal(200);
      r.body.length.should.equal(2);
      r.body[0].name.should.equal('Central');
    });

    it('unknown schema in profile header -> 406', async function () {
      const r = await api('/api/offices', {
        headers: { 'Accept-Profile': 'not_a_db' }
      });
      r.status.should.equal(406);
    });

    it('system schema in profile header -> 406', async function () {
      const r = await api('/api/user', {
        headers: { 'Accept-Profile': 'mysql' }
      });
      r.status.should.equal(406);
    });

    it('qualified name for unknown table -> 404', async function () {
      const r = await api(`/api/${SECOND_DB}.nope`);
      r.status.should.equal(404);
    });

    it('reserved endpoints still work', async function () {
      const r = await api('/api/tables');
      r.status.should.equal(200);
    });
  });

  describe('writes with Content-Profile', function () {

    it('POST routes to the database from Content-Profile', async function () {
      const r = await api('/api/offices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Profile': SECOND_DB
        },
        body: JSON.stringify({ officeCode: 'X3', city: 'Quito', country: 'Ecuador' })
      });
      r.status.should.equal(200);

      const check = await api(`/api/${SECOND_DB}.offices?_size=100`);
      check.body.length.should.equal(3);

      // classicmodels.offices untouched
      const untouched = await api('/api/offices?_size=100', {
        headers: { 'Accept-Profile': 'classicmodels' }
      });
      untouched.body.some(o => o.officeCode === 'X3').should.be.false();
    });

    it('PUT via qualified name updates the right database', async function () {
      const r = await api(`/api/${SECOND_DB}.offices/X3`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ city: 'Guayaquil', country: 'Ecuador' })
      });
      r.status.should.equal(200);

      const check = await api(`/api/${SECOND_DB}.offices/X3`);
      check.body[0].city.should.equal('Guayaquil');
    });

    it('DELETE via qualified name', async function () {
      const r = await api(`/api/${SECOND_DB}.offices/X3`, { method: 'DELETE' });
      r.status.should.equal(200);

      const check = await api(`/api/${SECOND_DB}.offices?_size=100`);
      check.body.length.should.equal(2);
    });
  });

  describe('Supabase SDK compatibility', function () {

    it('PostgrestClient with schema option targets the right database', async function () {
      const client = new PostgrestClient(`${baseUrl}/api`, { schema: SECOND_DB });
      const { data, error } = await client.from('offices').select('*');
      should.not.exist(error);
      data.length.should.equal(2);
      data[0].country.should.equal('Venezuela');
    });

    it('.schema() switches databases per query', async function () {
      const client = new PostgrestClient(`${baseUrl}/api`);
      const { data, error } = await client.schema('classicmodels').from('offices').select('*');
      should.not.exist(error);
      data.length.should.be.above(2);
    });

    it('SDK insert routes via Content-Profile', async function () {
      const client = new PostgrestClient(`${baseUrl}/api`, { schema: SECOND_DB });
      const { error } = await client.from('warehouses').insert({ name: 'South' });
      should.not.exist(error);

      const check = await api(`/api/${SECOND_DB}.warehouses?_size=100`);
      check.body.length.should.equal(3);
    });
  });

  describe('request-scoped resolution under concurrency', function () {

    it('parallel mixed-table requests never cross-contaminate', async function () {
      const rounds = [];
      for (let i = 0; i < 30; i++) {
        rounds.push(
          api('/api/offices?_size=100', { headers: { 'Accept-Profile': SECOND_DB } })
            .then(r => ({ kind: 'second', r })),
          api('/api/offices?_size=100', { headers: { 'Accept-Profile': 'classicmodels' } })
            .then(r => ({ kind: 'classic', r })),
          api('/api/warehouses?_size=100').then(r => ({ kind: 'warehouses', r }))
        );
      }

      const results = await Promise.all(rounds);
      for (const { kind, r } of results) {
        r.status.should.equal(200);
        if (kind === 'second') {
          r.body.length.should.equal(2);
          r.body[0].should.have.property('country');
        } else if (kind === 'classic') {
          r.body.length.should.be.above(2);
        } else {
          r.body.every(w => typeof w.name === 'string').should.be.true();
        }
      }
    });
  });
});

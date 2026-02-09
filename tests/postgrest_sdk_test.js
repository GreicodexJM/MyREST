
const { PostgrestClient } = require('@supabase/postgrest-js');
const express = require('express');
const bodyParser = require('body-parser');
const mysql = require('mysql2');
const Xapi = require('../lib/xapi.js');
const assert = require('assert');

const dbConfig = {
    host: process.env.MYSQL_HOST || '127.0.0.1',
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || 'toor',
    database: process.env.MYSQL_DATABASE || 'sys'
};

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

let pool = mysql.createPool(dbConfig);
let xapi = new Xapi({ ...dbConfig, dynamic: 0 }, pool, app);
let server;
let client;

describe(__filename + ':: PostgREST SDK Tests', function() {
    this.timeout(10000);

    // Helper to start server
    before(function(done) {
        // Setup DB
        pool.query(`
            CREATE TABLE IF NOT EXISTS sdk_test (
                id INT AUTO_INCREMENT PRIMARY KEY,
                task VARCHAR(50),
                status VARCHAR(20)
            )
        `, (err) => {
            if (err) return done(err);
            pool.query('TRUNCATE TABLE sdk_test', (err) => {
                if (err) return done(err);
                
                // Seed
                pool.query("INSERT INTO sdk_test (task, status) VALUES ('Task 1', 'pending'), ('Task 2', 'done')", (err) => {
                   if (err) return done(err);
                   
                   xapi.init((err) => {
                        if (err) return done(err);
                        server = app.listen(0, () => {
                            const port = server.address().port;
                            console.log(`Server running on port ${port}`);
                            client = new PostgrestClient(`http://localhost:${port}/api`);
                            done();
                        });
                   });
                });
            });
        });
    });

    after(function(done) {
        if (server) server.close();
        pool.end(done);
    });

    it('Test 1: Select all', async function() {
        const { data: list, error: listError } = await client
            .from('sdk_test')
            .select('*');
        
        if (listError) throw listError;
        assert.equal(list.length, 2);
    });

    it('Test 2: Filter (eq)', async function() {
        const { data: filtered, error: filterError } = await client
            .from('sdk_test')
            .select('*')
            .eq('status', 'done');
            
        if (filterError) throw filterError;
        assert.equal(filtered.length, 1);
        assert.equal(filtered[0].task, 'Task 2');
    });
    
    it('Test 3: Insert (Create) with select()', async function() {
        const { data: inserted, error: insertError } = await client
            .from('sdk_test')
            .insert({ task: 'Task 3', status: 'pending' })
            .select();
            
        if (insertError) throw insertError;
        assert(Array.isArray(inserted), 'Inserted should be array');
        assert.equal(inserted.length, 1);
        assert.equal(inserted[0].task, 'Task 3');
        assert(inserted[0].id, 'Should have ID');
    });

    it('Test 4: Pagination with count', async function() {
        // range(0, 1) gets first 2 items
        const { count, data: paged, error: pageError } = await client
            .from('sdk_test')
            .select('*', { count: 'exact' })
            .range(0, 1);
            
        if (pageError) throw pageError;
        assert.equal(paged.length, 2);
        assert.equal(count, 3); // 2 original + 1 inserted
    });

    it('Test 5: Single Response (.single())', async function() {
        const { data: single, error: singleError } = await client
            .from('sdk_test')
            .select('*')
            .eq('task', 'Task 3')
            .single();
            
        if (singleError) throw singleError;
        // If single() works with array response (client handles it?), this should pass.
        // If client requires object response type, it might fail.
        assert.equal(single.task, 'Task 3');
    });
    
    it('Test 6: Update with select()', async function() {
        const { data: updated, error: updateError } = await client
             .from('sdk_test')
             .update({ status: 'archived' })
             .eq('task', 'Task 1')
             .select(); // Request representation
        
        if (updateError) throw updateError;
        assert(Array.isArray(updated), 'Updated should be array');
        assert.equal(updated.length, 1);
        assert.equal(updated[0].status, 'archived');
        assert.equal(updated[0].task, 'Task 1');
    });

    it('Test 7: Delete', async function() {
        // Simple delete, no return
        const { error: deleteError } = await client
            .from('sdk_test')
            .delete()
            .eq('task', 'Task 2');
            
        if (deleteError) throw deleteError;
        
        // Verify it's gone
        const { data: check, error: checkError } = await client
            .from('sdk_test')
            .select('*')
            .eq('task', 'Task 2');
            
        if (checkError) throw checkError;
        assert.equal(check.length, 0);
    });

    it('Test 8: Delete with select()', async function() {
        // Insert one to delete
        await client.from('sdk_test').insert({ task: 'To Delete', status: 'temp' });

        const { data: deleted, error: deleteError } = await client
            .from('sdk_test')
            .delete()
            .eq('task', 'To Delete')
            .select();
            
        if (deleteError) throw deleteError;
        assert(Array.isArray(deleted), 'Deleted should be array');
        assert.equal(deleted.length, 1);
        assert.equal(deleted[0].task, 'To Delete');
    });

    it('Test 9: Advanced Filters', async function() {
        // Clear and seed specific data
        await client.from('sdk_test').delete().neq('id', 0);
        await client.from('sdk_test').insert([
            { task: 'A', status: '10' },
            { task: 'B', status: '20' },
            { task: 'C', status: '30' }
        ]);

        // gt
        const { data: gtData } = await client.from('sdk_test').select('*').gt('status', '15');
        assert.equal(gtData.length, 2); // 20, 30

        // in
        const { data: inData } = await client.from('sdk_test').select('*').in('task', ['A', 'C']);
        assert.equal(inData.length, 2); // A, C

        // like
        const { data: likeData } = await client.from('sdk_test').select('*').like('task', 'B');
        assert.equal(likeData.length, 1); // B
    });
});

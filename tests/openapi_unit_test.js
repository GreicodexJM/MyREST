'use strict';

var should = require('should');
var openapiHelper = require('../lib/util/openapi.helper.js');

describe('OpenAPI Generator Unit Tests', function () {

    it('should generate valid OpenAPI spec from metaDb', function (done) {
        
        let metaDb = {
            tables: {
                users: {
                    columns: [
                        { column_name: 'id', data_type: 'int', column_type: 'int(11)', is_nullable: 'NO', column_key: 'PRI', column_default: null },
                        { column_name: 'name', data_type: 'varchar', column_type: 'varchar(100)', is_nullable: 'NO', column_default: null }
                    ]
                }
            },
            routines: {
                add_user: {
                    type: 'PROCEDURE',
                    params: [
                        { name: 'p_name', type: 'varchar', mode: 'IN', pos: 1 }
                    ]
                }
            }
        };

        let host = 'http://localhost:3000/api';
        let spec = openapiHelper.generate(metaDb, host);

        spec.openapi.should.equal('3.0.0');
        spec.info.title.should.equal('xmysql generated API');
        spec.servers[0].url.should.equal(host);

        // Check paths
        spec.paths.should.have.property('/users');
        spec.paths.should.have.property('/users/{id}');
        spec.paths.should.have.property('/rpc/add_user');

        // Check Schemas
        spec.components.schemas.should.have.property('users');
        spec.components.schemas.users.properties.should.have.property('id');
        spec.components.schemas.users.properties.id.type.should.equal('integer');

        // Check RPC Request Body
        spec.paths['/rpc/add_user'].post.requestBody.content['application/json'].schema.properties.should.have.property('p_name');

        done();
    });

});

'use strict';

var should = require('should');
var dataHelper = require('../lib/util/data.helper.js');

describe('JSON Column Serialization Unit Tests', function () {

  it('should serialize nested objects in JSON columns', function (done) {
    let metaDb = {
      tables: {
        test_table: {
          columns: [
            { column_name: 'id', data_type: 'int' },
            { column_name: 'name', data_type: 'varchar' },
            { column_name: 'config', data_type: 'json' }
          ]
        }
      }
    };

    let data = {
      id: 1,
      name: 'Test',
      config: { key: 'value', nested: { data: 123 } }
    };

    let result = dataHelper.serializeJsonColumns('test_table', data, metaDb);
    
    result.id.should.equal(1);
    result.name.should.equal('Test');
    result.config.should.be.type('string');
    result.config.should.equal('{"key":"value","nested":{"data":123}}');
    
    done();
  });

  it('should serialize arrays in JSON columns', function (done) {
    let metaDb = {
      tables: {
        test_table: {
          columns: [
            { column_name: 'id', data_type: 'int' },
            { column_name: 'tags', data_type: 'json' }
          ]
        }
      }
    };

    let data = {
      id: 1,
      tags: ['tag1', 'tag2', 'tag3']
    };

    let result = dataHelper.serializeJsonColumns('test_table', data, metaDb);
    
    result.id.should.equal(1);
    result.tags.should.be.type('string');
    result.tags.should.equal('["tag1","tag2","tag3"]');
    
    done();
  });

  it('should not modify non-JSON columns', function (done) {
    let metaDb = {
      tables: {
        test_table: {
          columns: [
            { column_name: 'id', data_type: 'int' },
            { column_name: 'name', data_type: 'varchar' },
            { column_name: 'count', data_type: 'int' }
          ]
        }
      }
    };

    let data = {
      id: 1,
      name: 'Test',
      count: 42
    };

    let result = dataHelper.serializeJsonColumns('test_table', data, metaDb);
    
    result.id.should.equal(1);
    result.name.should.equal('Test');
    result.count.should.equal(42);
    
    done();
  });

  it('should handle already-stringified JSON', function (done) {
    let metaDb = {
      tables: {
        test_table: {
          columns: [
            { column_name: 'config', data_type: 'json' }
          ]
        }
      }
    };

    let data = {
      config: '{"key":"value"}'
    };

    let result = dataHelper.serializeJsonColumns('test_table', data, metaDb);
    
    result.config.should.equal('{"key":"value"}');
    
    done();
  });

  it('should handle null values in JSON columns', function (done) {
    let metaDb = {
      tables: {
        test_table: {
          columns: [
            { column_name: 'config', data_type: 'json' }
          ]
        }
      }
    };

    let data = {
      config: null
    };

    let result = dataHelper.serializeJsonColumns('test_table', data, metaDb);
    
    should(result.config).be.null();
    
    done();
  });

  it('should handle missing table metadata gracefully', function (done) {
    let metaDb = {
      tables: {}
    };

    let data = {
      id: 1,
      config: { key: 'value' }
    };

    let result = dataHelper.serializeJsonColumns('nonexistent_table', data, metaDb);
    
    // Should return data unchanged
    result.id.should.equal(1);
    result.config.should.be.type('object');
    result.config.key.should.equal('value');
    
    done();
  });

  it('should handle empty data object', function (done) {
    let metaDb = {
      tables: {
        test_table: {
          columns: [
            { column_name: 'config', data_type: 'json' }
          ]
        }
      }
    };

    let data = {};

    let result = dataHelper.serializeJsonColumns('test_table', data, metaDb);
    
    Object.keys(result).length.should.equal(0);
    
    done();
  });

  it('should handle multiple JSON columns', function (done) {
    let metaDb = {
      tables: {
        test_table: {
          columns: [
            { column_name: 'id', data_type: 'int' },
            { column_name: 'config', data_type: 'json' },
            { column_name: 'metadata', data_type: 'json' },
            { column_name: 'tags', data_type: 'json' }
          ]
        }
      }
    };

    let data = {
      id: 1,
      config: { setting: true },
      metadata: { created: '2024-01-01' },
      tags: ['a', 'b']
    };

    let result = dataHelper.serializeJsonColumns('test_table', data, metaDb);
    
    result.id.should.equal(1);
    result.config.should.equal('{"setting":true}');
    result.metadata.should.equal('{"created":"2024-01-01"}');
    result.tags.should.equal('["a","b"]');
    
    done();
  });

});

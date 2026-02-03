'use strict';

/**
 * Converts PostgREST boolean values to MySQL boolean values
 * PostgREST uses: true/false
 * MySQL uses: 1/0 (TINYINT)
 */
function convertBoolean(value) {
  if (value === 'true') return 1;
  if (value === 'false') return 0;
  return value;
}

/**
 * Maps PostgREST operators to SQL operators
 */
function getComparisonOperator(operator) {
  switch (operator) {
    case 'eq': return '=';
    case 'gt': return '>';
    case 'gte': return '>=';
    case 'lt': return '<';
    case 'lte': return '<=';
    case 'neq': return '!=';
    case 'like': return 'LIKE';
    case 'ilike': return 'LIKE'; // MySQL LIKE is often case-insensitive depending on collation
    case 'is': return 'IS';
    case 'in': return 'IN';
    default: return null;
  }
}

/**
 * Parses a single condition value like "eq.123"
 */
function parseCondition(key, value) {
  const parts = value.split('.');
  if (parts.length < 2) return null;

  const operator = parts[0];
  let val = parts.slice(1).join('.'); // Rejoin the rest in case value contained dots

  const sqlOp = getComparisonOperator(operator);
  if (!sqlOp) return null;

  // Handle special cases
  if (operator === 'in') {
    // value should be like (1,2,3)
    if (val.startsWith('(') && val.endsWith(')')) {
      val = val.slice(1, -1).split(',').map(v => convertBoolean(v.trim()));
    } else {
        // Fallback or error? For now assume it's comma separated list
        val = val.split(',').map(v => convertBoolean(v.trim()));
    }
  } else if (val === 'null') {
      val = null;
  } else {
      // Convert boolean strings to MySQL boolean values (1/0)
      val = convertBoolean(val);
  }

  return {
    column: key,
    operator: sqlOp,
    value: val
  };
}

exports.getWhereClause = function(queryParams) {
  let whereQuery = '';
  let whereParams = [];
  let conditions = [];

  // Iterate over all query parameters
  for (const key in queryParams) {
    // Skip reserved keywords starting with underscore or 'select', 'order', 'limit', 'offset' if we decide to use them without underscore
    // But PostgREST uses 'select', 'order', 'limit', 'offset' directly?
    // PostgREST uses: select, order, limit, offset, and headers for range.
    // We should skip our own internal params if any, and the PostgREST keywords.
    if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(key)) continue;
    if (key.startsWith('_')) continue; // Skip existing xmysql params for now to avoid conflict

    const value = queryParams[key];
    if (typeof value === 'string') {
        const condition = parseCondition(key, value);
        if (condition) {
            conditions.push(condition);
        }
    } else if (Array.isArray(value)) {
        // multiple conditions for same column? e.g. id=gt.5&id=lt.10
        value.forEach(v => {
             const condition = parseCondition(key, v);
             if (condition) {
                 conditions.push(condition);
             }
        });
    }
  }

  if (conditions.length > 0) {
    whereQuery = conditions.map(c => {
        if (c.operator === 'IN') {
             return '?? IN (?)'; // mysql2 handles array for IN clause
        }
        if (c.value === null) {
            if (c.operator === '=') return '?? IS NULL';
            if (c.operator === '!=') return '?? IS NOT NULL';
            return `?? ${c.operator} NULL`; 
        }
        return `?? ${c.operator} ?`;
    }).join(' AND ');

    conditions.forEach(c => {
        whereParams.push(c.column);
        if (c.value !== null && !(c.value === null && (c.operator === '=' || c.operator === '!='))) {
             whereParams.push(c.value);
        }
    });
  }

  return {
    query: whereQuery,
    params: whereParams
  };
};

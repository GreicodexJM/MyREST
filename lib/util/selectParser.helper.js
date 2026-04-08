'use strict';

/**
 * Parses a PostgREST select string into a structured object.
 * Example: "id,name,clients(id,name,projects(id))"
 * Returns: [
 *   { type: 'column', name: 'id' },
 *   { type: 'column', name: 'name' },
 *   { type: 'relation', name: 'clients', columns: 'id,name,projects(id)' }
 * ]
 */
function parseSelect(selectStr) {
    if (!selectStr) return [];
    
    const results = [];
    let buffer = '';
    let depth = 0;
    
    for (let i = 0; i < selectStr.length; i++) {
        const char = selectStr[i];
        
        if (char === '(') {
            depth++;
            buffer += char;
        } else if (char === ')') {
            depth--;
            buffer += char;
        } else if (char === ',' && depth === 0) {
            if (buffer.trim()) {
                results.push(parseItem(buffer.trim()));
            }
            buffer = '';
        } else {
            buffer += char;
        }
    }
    
    if (buffer.trim()) {
        results.push(parseItem(buffer.trim()));
    }
    
    return results;
}

function parseItem(item) {
    // Check if item has parenthesis, indicating a relation
    const openParenIndex = item.indexOf('(');
    if (openParenIndex !== -1 && item.endsWith(')')) {
        let nameOrHint = item.substring(0, openParenIndex).trim();
        const columns = item.substring(openParenIndex + 1, item.length - 1);

        // Check for hint syntax: column:table(columns)
        const colonIndex = nameOrHint.indexOf(':');
        let hint = undefined;
        if (colonIndex !== -1) {
            hint = nameOrHint.substring(0, colonIndex).trim();
            nameOrHint = nameOrHint.substring(colonIndex + 1).trim();
        }

        // Check for join type modifier: table!left or table!inner
        let joinType = undefined;
        const bangIndex = nameOrHint.indexOf('!');
        if (bangIndex !== -1) {
            joinType = nameOrHint.substring(bangIndex + 1).trim().toLowerCase();
            nameOrHint = nameOrHint.substring(0, bangIndex).trim();
        }

        const result = { type: 'relation', name: nameOrHint, columns: columns };
        if (hint !== undefined) result.hint = hint;
        if (joinType !== undefined) result.joinType = joinType;
        return result;
    } else {
        return { type: 'column', name: item };
    }
}

module.exports = {
    parseSelect,
    parseItem
};

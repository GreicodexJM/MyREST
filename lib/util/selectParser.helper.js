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
        const nameOrHint = item.substring(0, openParenIndex).trim();
        const columns = item.substring(openParenIndex + 1, item.length - 1);
        
        // Check for hint syntax: column:table(columns)
        const colonIndex = nameOrHint.indexOf(':');
        if (colonIndex !== -1) {
            const hint = nameOrHint.substring(0, colonIndex).trim();
            const name = nameOrHint.substring(colonIndex + 1).trim();
            return { type: 'relation', name: name, hint: hint, columns: columns };
        } else {
            return { type: 'relation', name: nameOrHint, columns: columns };
        }
    } else {
        return { type: 'column', name: item };
    }
}

module.exports = {
    parseSelect
};

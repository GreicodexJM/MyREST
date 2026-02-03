# PostgREST Foreign Key Hint Syntax

## Overview

MyREST now supports PostgREST's explicit foreign key hint syntax for specifying relationships in `select` queries. This allows you to explicitly specify which foreign key column to use when joining related tables, particularly useful when there are multiple foreign keys between tables.

## Syntax

```
column:table(fields)
```

Where:
- `column` - The foreign key column name (hint)
- `table` - The related table name
- `fields` - Comma-separated list of fields to select from the related table

## Examples

### Basic Usage

**Without hint (implicit):**
```
GET /api/documents?select=*,trading_partner_templates(*)
```

**With hint (explicit):**
```
GET /api/documents?select=*,trading_partner_id:trading_partner_templates(*)
```

This explicitly tells the API to use the `trading_partner_id` foreign key column to join with `trading_partner_templates`.

### Selecting Specific Columns

```
GET /api/posts?select=id,title,author_id:users(id,name,email)
```

This selects `id` and `title` from `posts`, and embeds the related user data (id, name, email) using the `author_id` foreign key.

### Multiple Relations

```
GET /api/orders?select=id,status,customer_id:customers(*),shipping_id:addresses(*)
```

This embeds both customer and shipping address data using their respective foreign keys.

### Nested Relations

```
GET /api/posts?select=id,title,author_id:users(id,name,country_id:countries(name))
```

Hints can be used at any nesting level.

## Why Use Hints?

### Multiple Foreign Keys
When a table has multiple foreign keys pointing to the same table, hints disambiguate which relationship to use:

```sql
CREATE TABLE messages (
    id INT PRIMARY KEY,
    sender_id INT,
    recipient_id INT,
    FOREIGN KEY (sender_id) REFERENCES users(id),
    FOREIGN KEY (recipient_id) REFERENCES users(id)
);
```

Query:
```
GET /api/messages?select=*,sender_id:users(name),recipient_id:users(name)
```

### Clarity and Maintainability
Even with a single foreign key, explicit hints make queries more readable and maintainable.

## Implementation Details

### How It Works

1. **Parser**: `lib/util/selectParser.helper.js` parses the `column:table(fields)` syntax
2. **Query Builder**: `lib/xsql.js` uses the hint to determine FK relationship direction
3. **SQL Generation**: Generates appropriate subqueries (N:1 or 1:N) based on FK metadata

### Relationship Types

**N:1 (Many-to-One):**
When the parent table has a FK pointing to the child table:
```sql
SELECT JSON_OBJECT(...) FROM child WHERE child.pk = parent.fk_column
```

**1:N (One-to-Many):**
When the child table has a FK pointing to the parent table:
```sql
SELECT JSON_ARRAYAGG(JSON_OBJECT(...)) FROM child WHERE child.fk_column = parent.pk
```

## Compatibility

This feature maintains backward compatibility:
- Queries without hints continue to work with automatic FK detection
- PostgREST applications can use this syntax without modification

## Testing

Run the unit tests:
```bash
npm test -- tests/postgrest_fk_hint_test.js
```

## See Also

- [PostgREST Documentation - Resource Embedding](https://postgrest.org/en/stable/api.html#resource-embedding)
- [PostgREST Documentation - Disambiguating Relationships](https://postgrest.org/en/stable/api.html#disambiguating-relationships)

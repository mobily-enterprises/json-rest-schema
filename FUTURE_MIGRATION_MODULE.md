# Future Migration Module: json-rest-schema-migrations

## Overview

This document outlines the design and implementation plan for `json-rest-schema-migrations`, a companion package that would provide automatic differential migration generation for `json-rest-schema` schemas using Knex's database abstraction.

## Motivation

Earlier versions of `json-rest-schema` included helpers such as `generateKnexMigration()` to scaffold an initial table, but that functionality has since been removed from the core package. The need that sparked those helpers remains: as applications grow, schemas change — fields are added, types are modified, constraints are updated. Manually writing migration files for these changes is error-prone and time-consuming.

This module would:
- Automatically detect schema changes
- Generate appropriate ALTER TABLE migrations
- Provide safety warnings for dangerous changes
- Maintain schema version history
- Support rollbacks

## Core Architecture

### 1. Schema State Management

```javascript
// schema-state.json
{
  "version": "1.0.0",
  "tables": {
    "users": {
      "version": 3,
      "lastModified": "2025-01-11T12:00:00Z",
      "checksum": "sha256:abc123...",
      "schema": {
        "email": { "type": "string", "required": true, "maxLength": 255 },
        "name": { "type": "string", "nullable": true }
      }
    }
  }
}
```

### 2. Main API

```javascript
import createSchema from 'json-rest-schema';
import { MigrationManager } from 'json-rest-schema-migrations';

// Initialize
const manager = new MigrationManager({
  knex: knexInstance,
  migrationsDir: './migrations',
  stateFile: './schema-state.json',
  safety: 'strict' // 'strict' | 'warn' | 'permissive'
});

// Define new schema version
const userSchema = createSchema({
  email: { type: 'string', required: true, maxLength: 255 },
  name: { type: 'string', nullable: false }, // Changed: was nullable
  age: { type: 'number', min: 0 },           // Added
  username: undefined                         // Removed (by omission)
});

// Generate migration
const result = await manager.generateMigration('users', userSchema, {
  name: 'add_age_remove_username',
  dryRun: false
});

console.log(result);
// {
//   filename: '20250111120000_add_age_remove_username.js',
//   changes: [...],
//   warnings: ['Removing column username will delete data'],
//   applied: true
// }
```

## Detailed Implementation

### Phase 1: Database Introspection

```javascript
class DatabaseIntrospector {
  constructor(knex) {
    this.knex = knex;
  }

  async getTableSchema(tableName) {
    // Use Knex's built-in columnInfo method
    const columns = await this.knex(tableName).columnInfo();
    
    // Normalize to json-rest-schema format
    return this.normalizeColumns(columns);
  }

  normalizeColumns(knexColumns) {
    const schema = {};
    
    for (const [name, info] of Object.entries(knexColumns)) {
      schema[name] = {
        type: this.mapKnexType(info.type),
        nullable: info.nullable,
        maxLength: info.maxLength,
        defaultTo: info.defaultValue,
        // ... other mappings
      };
    }
    
    return schema;
  }

  mapKnexType(dbType) {
    const typeMap = {
      'integer': 'number',
      'bigint': 'number',
      'varchar': 'string',
      'text': 'string',
      'boolean': 'boolean',
      'json': 'object',
      'jsonb': 'object',
      'date': 'date',
      'datetime': 'dateTime',
      'timestamp': 'dateTime'
    };
    
    return typeMap[dbType.toLowerCase()] || 'string';
  }
}
```

### Phase 2: Schema Diff Engine

```javascript
class SchemaDiffer {
  diff(currentSchema, targetSchema) {
    const changes = {
      added: [],
      modified: [],
      removed: [],
      renamed: [] // Future feature
    };

    // Detect added fields
    for (const [field, def] of Object.entries(targetSchema)) {
      if (!currentSchema[field]) {
        changes.added.push({
          field,
          definition: def,
          sql: this.generateAddColumn(field, def)
        });
      }
    }

    // Detect modified fields
    for (const [field, current] of Object.entries(currentSchema)) {
      const target = targetSchema[field];
      if (target && this.hasChanged(current, target)) {
        changes.modified.push({
          field,
          from: current,
          to: target,
          changes: this.describeChanges(current, target),
          warnings: this.analyzeRisks(current, target)
        });
      }
    }

    // Detect removed fields
    for (const field of Object.keys(currentSchema)) {
      if (!targetSchema[field]) {
        changes.removed.push({
          field,
          definition: currentSchema[field],
          warning: 'This will permanently delete all data in this column'
        });
      }
    }

    return changes;
  }

  hasChanged(current, target) {
    // Compare all relevant properties
    const props = ['type', 'nullable', 'maxLength', 'unique', 'defaultTo'];
    return props.some(prop => current[prop] !== target[prop]);
  }

  analyzeRisks(from, to) {
    const warnings = [];

    // Type changes
    if (from.type !== to.type) {
      if (from.type === 'string' && to.type === 'number') {
        warnings.push('Converting string to number may fail for non-numeric values');
      }
      if (from.type === 'number' && to.type === 'string' && to.maxLength) {
        warnings.push(`Large numbers may be truncated to ${to.maxLength} characters`);
      }
    }

    // Nullable to required
    if (from.nullable && !to.nullable) {
      warnings.push('Making field required will fail if NULL values exist');
    }

    // Length reduction
    if (from.maxLength && to.maxLength && to.maxLength < from.maxLength) {
      warnings.push(`Reducing length from ${from.maxLength} to ${to.maxLength} may truncate data`);
    }

    return warnings;
  }
}
```

### Phase 3: Migration Generation

```javascript
class MigrationGenerator {
  generate(tableName, changes) {
    const timestamp = new Date().toISOString()
      .replace(/[-:T]/g, '')
      .substr(0, 14);
    
    const filename = `${timestamp}_alter_${tableName}.js`;
    
    const content = `exports.up = function(knex) {
  return knex.schema.alterTable('${tableName}', function(table) {
${this.generateUpOperations(changes)}
  });
};

exports.down = function(knex) {
  return knex.schema.alterTable('${tableName}', function(table) {
${this.generateDownOperations(changes)}
  });
};
`;

    return { filename, content };
  }

  generateUpOperations(changes) {
    const operations = [];

    // Added columns
    for (const { field, definition } of changes.added) {
      operations.push(this.generateAddColumn(field, definition));
    }

    // Modified columns
    for (const { field, to } of changes.modified) {
      operations.push(this.generateAlterColumn(field, to));
    }

    // Removed columns
    for (const { field } of changes.removed) {
      operations.push(`    table.dropColumn('${field}');`);
    }

    return operations.join('\n');
  }

  generateAddColumn(field, definition) {
    let code = '    table';
    
    // Map type
    switch (definition.type) {
      case 'string':
        code += definition.maxLength 
          ? `.string('${field}', ${definition.maxLength})`
          : `.string('${field}')`;
        break;
      case 'number':
        if (definition.precision && definition.scale) {
          code += `.decimal('${field}', ${definition.precision}, ${definition.scale})`;
        } else {
          code += `.integer('${field}')`;
        }
        break;
      case 'boolean':
        code += `.boolean('${field}')`;
        break;
      case 'date':
        code += `.date('${field}')`;
        break;
      case 'dateTime':
        code += `.datetime('${field}')`;
        break;
      case 'object':
      case 'array':
        code += `.json('${field}')`;
        break;
      default:
        code += `.string('${field}')`;
    }

    // Add constraints
    if (!definition.nullable) code += '.notNullable()';
    if (definition.unique) code += '.unique()';
    if (definition.defaultTo !== undefined) {
      const value = typeof definition.defaultTo === 'string'
        ? `'${definition.defaultTo}'`
        : definition.defaultTo;
      code += `.defaultTo(${value})`;
    }
    if (definition.unsigned) code += '.unsigned()';

    return code + ';';
  }
}
```

### Phase 4: Safety and Validation

```javascript
class MigrationSafety {
  async validateMigration(knex, tableName, changes) {
    const issues = [];

    for (const change of changes.modified) {
      if (change.from.nullable && !change.to.nullable) {
        // Check for NULL values
        const nullCount = await knex(tableName)
          .whereNull(change.field)
          .count('* as count');
        
        if (nullCount[0].count > 0) {
          issues.push({
            type: 'error',
            field: change.field,
            message: `Cannot make field required: ${nullCount[0].count} NULL values exist`
          });
        }
      }

      if (change.from.type !== change.to.type) {
        // Sample data to check conversion
        const sample = await knex(tableName)
          .select(change.field)
          .whereNotNull(change.field)
          .limit(100);
        
        const failures = this.testTypeConversion(
          sample, 
          change.field, 
          change.from.type, 
          change.to.type
        );
        
        if (failures.length > 0) {
          issues.push({
            type: 'error',
            field: change.field,
            message: `Type conversion would fail for ${failures.length} values`,
            examples: failures.slice(0, 3)
          });
        }
      }
    }

    return issues;
  }
}
```

## Usage Examples

### Basic Usage

```javascript
// 1. Initial setup
const userSchema = createSchema({
  email: { type: 'string', required: true, unique: true },
  name: { type: 'string' }
});

// Generate initial migration
await manager.createInitialMigration('users', userSchema);

// 2. Later: Add age field, make name required
const updatedSchema = createSchema({
  email: { type: 'string', required: true, unique: true },
  name: { type: 'string', required: true }, // Changed
  age: { type: 'number', min: 0 }          // Added
});

// Generate differential migration
await manager.generateMigration('users', updatedSchema);
```

### Dry Run Mode

```javascript
// Preview changes without applying
const plan = await manager.generateMigration('users', updatedSchema, {
  dryRun: true
});

console.log('Planned changes:');
plan.changes.forEach(change => {
  console.log(`- ${change.type}: ${change.field}`);
  if (change.warnings) {
    change.warnings.forEach(w => console.log(`  ⚠️  ${w}`));
  }
});

// Show generated SQL
console.log('\nGenerated migration:');
console.log(plan.migration);
```

### Handling Complex Changes

```javascript
const result = await manager.generateMigration('products', productSchema, {
  // Provide hints for complex changes
  hints: {
    renames: {
      'title': 'name'  // Tell the system that 'title' was renamed to 'name'
    }
  }
});
```

## Configuration Options

```javascript
const manager = new MigrationManager({
  knex: knexInstance,
  
  // Where to store migration files
  migrationsDir: './migrations',
  
  // Schema state tracking
  stateFile: './schema-state.json',
  
  // Safety level
  safety: 'strict', // 'strict' | 'warn' | 'permissive'
  
  // Custom type mappings
  typeMappings: {
    'money': { knexType: 'decimal', precision: 19, scale: 4 }
  },
  
  // Naming convention for migrations
  nameGenerator: (table, changes) => {
    const actions = [];
    if (changes.added.length) actions.push('add_fields');
    if (changes.modified.length) actions.push('modify_fields');
    if (changes.removed.length) actions.push('remove_fields');
    return `${table}_${actions.join('_')}`;
  }
});
```

## Edge Cases and Limitations

### 1. Rename Detection
Without explicit hints, the system cannot distinguish between:
- Rename: `username` → `user_name`
- Delete + Add: remove `username`, add `user_name`

Solution: Provide rename hints or implement similarity detection.

### 2. Data Migrations
Some changes require data transformation:
```javascript
// Splitting a field
{ fullName: "John Doe" } → { firstName: "John", lastName: "Doe" }
```

Solution: Allow custom data migration functions.

### 3. Multi-Step Migrations
Some changes must be done in steps:
1. Add new nullable column
2. Populate with data
3. Make it required

Solution: Support migration sequences.

## Future Enhancements

### 1. Rename Detection
```javascript
class RenameDetector {
  detectRenames(removed, added) {
    const candidates = [];
    
    for (const rem of removed) {
      for (const add of added) {
        const similarity = this.calculateSimilarity(rem.field, add.field);
        if (similarity > 0.7) {
          candidates.push({
            from: rem.field,
            to: add.field,
            confidence: similarity
          });
        }
      }
    }
    
    return candidates;
  }
}
```

### 2. Migration Squashing
Combine multiple migrations into one:
```javascript
await manager.squashMigrations({
  from: '20250101000000',
  to: '20250111000000',
  output: '20250111000000_squashed_initial.js'
});
```

### 3. Schema Snapshots
```javascript
// Take a snapshot of current database state
await manager.snapshot('users');

// Compare with schema
const diff = await manager.compareWithSnapshot('users', userSchema);
```

### 4. Reversible Data Migrations
```javascript
manager.addDataMigration({
  up: async (knex) => {
    // Split full name
    const users = await knex('users').select('id', 'fullName');
    for (const user of users) {
      const [first, ...rest] = user.fullName.split(' ');
      await knex('users').where('id', user.id).update({
        firstName: first,
        lastName: rest.join(' ')
      });
    }
  },
  down: async (knex) => {
    // Combine names back
    const users = await knex('users').select('id', 'firstName', 'lastName');
    for (const user of users) {
      await knex('users').where('id', user.id).update({
        fullName: `${user.firstName} ${user.lastName}`.trim()
      });
    }
  }
});
```

## Testing Strategy

```javascript
describe('MigrationManager', () => {
  it('detects added fields', async () => {
    const oldSchema = createSchema({ email: { type: 'string' } });
    const newSchema = createSchema({ 
      email: { type: 'string' },
      age: { type: 'number' }
    });
    
    const changes = await manager.detectChanges('users', newSchema);
    expect(changes.added).toHaveLength(1);
    expect(changes.added[0].field).toBe('age');
  });
  
  it('generates valid migrations', async () => {
    const migration = await manager.generateMigration('users', schema);
    
    // Test up migration
    await migration.up(knex);
    const columns = await knex('users').columnInfo();
    expect(columns).toHaveProperty('age');
    
    // Test down migration
    await migration.down(knex);
    const columnsAfter = await knex('users').columnInfo();
    expect(columnsAfter).not.toHaveProperty('age');
  });
});
```

## Conclusion

This migration module would significantly enhance the json-rest-schema ecosystem by providing:
- Automatic schema evolution tracking
- Safe, database-agnostic migrations via Knex
- Clear warnings for dangerous changes
- A complete solution for maintaining consistency between validation schemas and database schemas

The implementation leverages Knex's excellent database abstraction while focusing on the unique challenges of schema diffing and migration generation.

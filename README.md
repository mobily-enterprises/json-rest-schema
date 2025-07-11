# How to Use the Schema Validation Library: A Tutorial

Welcome! This tutorial will walk you through everything you need to know to use the schema validation library effectively. We'll start with the basics and progressively move to more advanced topics like creating your own custom rules.

## 1. Getting Started: Your First Schema

Let's start with a common use case: validating a user registration form.

First, import the library's factory function and define the structure of the data you expect.

```javascript
import createSchema from './src/index.js';

// Define the structure and rules for our user data
const userSchema = createSchema({
  username: { type: 'string', required: true, minLength: 3 },
  email: { type: 'string', required: true },
  age: { type: 'number', min: 18, defaultTo: 18 }
});
```

Now, let's try to validate an object against this schema.

```javascript
// An example input object from a form
const userInput = {
  username: '  alex ', // Includes extra whitespace
  email: 'alex@example.com',
  age: '25' // Note: age is a string here
};

async function validateUser() {
  // The validate method is async, so we use await
  const { validatedObject, errors } = await userSchema.validate(userInput);

  // Check if there were any errors by seeing if the errors object has keys
  if (Object.keys(errors).length > 0) {
    console.log("Validation failed!");
    console.log(errors);
  } else {
    console.log("Validation successful!");
    console.log(validatedObject);
  }
}

validateUser();
```

**What happens here?**

1.  The `age` string `'25'` is **cast** to the number `25` by the `number` type handler.
2.  The `username` string `'  alex '` is **transformed** by the `string` type handler to `'alex'` (it gets trimmed).
3.  Since there are no validation errors, the `errors` object will be empty.
4.  The `validatedObject` will contain the clean, cast, and transformed data.

---

## 2. Understanding the Validation Result

The `validate()` method always returns an object with two properties: `validatedObject` and `errors`.

### The `validatedObject`

This object contains the data after all casting and transformations have been applied. It's the "clean" version of your input that you should use in the rest of your application (e.g., to save to a database).

### The `errors` Object

This is your primary tool for handling validation failures.

* **It's a Map, Not an Array:** The `errors` object is a map where keys are the field names that failed. This allows you to instantly check if a specific field has an error: `if (errors.age) { ... }`.
* **Rich Error Structure:** Each error in the map is a detailed object: `{ code, message, params }`.

Let's look at an example with invalid data:

```javascript
const invalidInput = {
  username: 'Al', // Fails 'minLength: 3'
  // email is missing, fails 'required: true'
  age: 16 // Fails 'min: 18'
};

const { validatedObject, errors } = await userSchema.validate(invalidInput);

console.log(JSON.stringify(errors, null, 2));
```

The output would look like this:

```json
{
  "username": {
    "field": "username",
    "code": "MIN_LENGTH",
    "message": "Length must be at least 3 characters.",
    "params": { "min": 3, "actual": 2 }
  },
  "email": {
    "field": "email",
    "code": "REQUIRED",
    "message": "Field is required",
    "params": {}
  },
  "age": {
    "field": "age",
    "code": "MIN_VALUE",
    "message": "Value must be at least 18.",
    "params": { "min": 18, "actual": 16 }
  }
}
```

* **`code`**: A stable, machine-readable string. Use this in your code for logic (`if (err.code === 'MIN_LENGTH')`).
* **`message`**: A human-readable message, great for developers or for displaying directly to users in simple cases.
* **`params`**: Extra context about the failure. This is incredibly useful for creating dynamic error messages (e.g., "You entered 2 characters, but a minimum of 3 is required.").

---

## 3. Built-in Rules Reference

Here is a complete list of all types and validators available out of the box.

### Built-in Types (Casting Rules)

A field's `type` defines how the input value will be converted before any other validation rules are run.

| Type Name | Description |
|---|---|
| `string` | Converts the input to a string. By default, it trims whitespace. Fails if the input is an object or array. |
| `number` | Converts the input to a number. An empty string, `null`, or `undefined` will be cast to `0`. |
| `boolean`| Converts the input to a boolean. Recognizes `1`, `'true'`, and `'on'` as `true`. All other values become `false`. |
| `array` | Ensures the value is an array. If the input is not already an array, it will be wrapped in one (e.g., `'tag1'` becomes `['tag1']`). |
| `id` | Parses the value into an integer, specifically for identifiers. It will fail if the input cannot be cleanly parsed as a number. |
| `date` | Converts a valid date string or timestamp into a `YYYY-MM-DD` formatted string. |
| `dateTime`| Converts a valid date string or timestamp into a `YYYY-MM-DD HH:MM:SS` formatted string. |
| `timestamp`| Converts the input to a number, suitable for storing Unix timestamps. |
| `serialize`| Converts any JavaScript value (including objects with circular references) into a single JSON-like string using `flatted`. |
| `object` | Passes the value through unchanged. Assumes the input is already an object. |
| `blob` | Passes the value through unchanged. Intended for binary data like files that don't need casting. |
| `none` | The "identity" type. Passes the value through completely unchanged without any casting. |

### Built-in Validators (Validation Parameters)

Validators are rules that run after a value has been cast to its proper type.

| Parameter | Description |
|---|---|
| `required: true` | The field must be present in the input object. Fails if the key is `undefined`. |
| `minLength: <number>` | For `string` types, validates the minimum character length. |
| `maxLength: <number>` | For `string` types, validates the maximum character length. |
| `min: <number>` | For `number` types, validates the minimum value. |
| `max: <number>` | For `number` types, validates the maximum value. |
| `notEmpty: true` | The field cannot be an empty string (`''`). This is different from `required`, as an empty string is still a defined value. |
| `length: <number>`| For `string` types, it **truncates** the string to the specified length. For `number` types, it throws an error if the number of digits in the original input exceeds the specified length. |
| `nullable: true`| Allows the value for this field to be `null`. By default, `null` is not allowed. |
| `nullOnEmpty: true`| If the input value is an empty string (`''`), it will be cast to `null` before other validators run. |
| `lowercase: true` | **Transforms** the string to all lowercase. |
| `uppercase: true` | **Transforms** the string to all uppercase. |
| `validator: <function>`| Allows you to provide your own custom validation function for complex, one-off logic. |
| `defaultTo: <value>` | If the field is not present in the input object and the entire object is valid, this value will be used. Can be a value or a function that returns a value. |
| `unsigned: true` | For `number` and `id` types, indicates the value should be non-negative (database hint). |
| `precision: <number>` | For `number` types, total number of digits (database hint for decimal types). |
| `scale: <number>` | For `number` types, number of decimal places (database hint for decimal types). |
| `unique: true` | Field value must be unique (database constraint). |
| `primary: true` | Field is a primary key (database constraint). |
| `references: <object>` | Foreign key reference with `table`, `column`, `onDelete`, `onUpdate` properties. |

---

## 4. Extending the Library: Custom Rules

The real power of the library comes from its extensibility. You can easily add your own reusable types and validators. When you do this, you'll be passed a powerful `context` object.

### The `context` Object

Every custom type and validator handler receives a `context` object as its only argument. This object is your toolbox, giving you all the information you need to perform complex logic. Here are its properties:

* **`value`**: The current value of the field being processed. Be aware that this value may have already been changed by the type handler or a previous validator.
* **`fieldName`**: A string containing the name of the field currently being validated (e.g., `'username'`).
* **`object`**: The entire object that is being validated. Its properties reflect the data *after* any casting or transformations have been applied up to this point. This is useful for cross-field validation.
* **`valueBeforeCast`**: The original, raw value for the field, exactly as it was in the input object before any type casting occurred.
* **`objectBeforeCast`**: The original, raw input object, before any modifications were made.
* **`definition`**: The schema definition object for the current field. For a field defined as `{ type: 'string', min: 5 }`, this would be that exact object.
* **`parameterName`**: *(For validators only)* The name of the validation rule currently being executed (e.g., `'min'`).
* **`parameterValue`**: *(For validators only)* The value of the validation rule currently being executed (e.g., the `5` in `min: 5`).
* **`throwTypeError()`**: A function you can call to throw a standardized `TYPE_CAST_FAILED` error. This is the preferred way to report an error from within a type handler.
* **`throwParamError(code, message, params)`**: A function you can call to throw a standardized validation error from within a validator. It accepts a custom error `code`, a `message`, and an optional `params` object.

### Creating a Custom Validator

Let's say you frequently need to validate that a field is a URL-friendly "slug" (e.g., `my-blog-post`).

You can define a new validator once and use it anywhere.

```javascript
// Do this once when your application starts
createSchema.addValidator('slug', (context) => {
  const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

  if (typeof context.value !== 'string' || !slugRegex.test(context.value)) {
    // Use the public context method to throw a standardized error
    context.throwParamError(
      'INVALID_SLUG', // Custom error code
      'Value must be a valid slug (e.g., my-post).'
    );
  }
});

// Now you can use 'slug' in any schema!
const articleSchema = createSchema({
  title: { type: 'string', required: true },
  slug: { type: 'string', required: true, slug: true } // Use it here
});
```

### Creating a Custom Type

A `Type` is used for casting. Imagine you want a `csv` type that takes a string like `"apple,banana,cherry"` and turns it into an array `['apple', 'banana', 'cherry']`.

```javascript
// Do this once when your application starts
createSchema.addType('csv', (context) => {
  if (context.value === undefined || context.value === null) {
    return [];
  }
  if (typeof context.value !== 'string') {
    // Use the public context method to throw a standardized type error
    context.throwTypeError();
  }
  // Trim whitespace from each item
  return context.value.split(',').map(item => item.trim());
});

// Now use your new 'csv' type
const productSchema = createSchema({
  name: { type: 'string', required: true },
  tags: { type: 'csv' }
});

const product = { name: 'Laptop', tags: ' electronics, computers, tech ' };
const { validatedObject } = await productSchema.validate(product);

// validatedObject.tags will be: ['electronics', 'computers', 'tech']
console.log(validatedObject.tags);
```

---

## 5. Advanced: Creating a Plugin

If you create a lot of custom types and validators for your project, you can bundle them into a single, reusable **Plugin**. A plugin is just an object with an `install` method.

```javascript
// my-custom-plugin.js
const MyCustomPlugin = {
  install(manager) { // The 'manager' object has .addType and .addValidator
    manager.addType('csv', context => {
        if (context.value === undefined || context.value === null) return [];
        if (typeof context.value !== 'string') context.throwTypeError();
        return context.value.split(',').map(item => item.trim());
    });
    
    manager.addValidator('slug', context => {
        const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
        if (typeof context.value !== 'string' || !slugRegex.test(context.value)) {
            context.throwParamError('INVALID_SLUG', 'Value must be a valid slug.');
        }
    });
  }
};

export default MyCustomPlugin;

// in your main app file:
import createSchema from './src/index.js';
import MyCustomPlugin from './my-custom-plugin.js';

// Install all your custom rules in one line!
createSchema.use(MyCustomPlugin);

// Now 'slug' and 'csv' are available to all schemas.
const mySchema = createSchema({
  tags: { type: 'csv' },
  pageUrl: { type: 'string', slug: true }
});
```

This makes your custom rules portable and keeps your main application setup clean.

---

## 6. Database Integration with Knex

The library now includes built-in support for generating Knex database tables from your schemas. This ensures your validation rules and database structure stay perfectly in sync.

**Note:** To use these features, you need to install Knex in your project:

```bash
npm install knex

# Also install a database driver:
npm install pg       # for PostgreSQL
npm install mysql2   # for MySQL  
npm install sqlite3  # for SQLite
```

### Importing the Functions

```javascript
import createSchema, { createKnexTable, generateKnexMigration } from 'json-rest-schema';
```

### Creating Tables Directly

Use `createKnexTable` to create a table directly in your database:

```javascript
import knex from 'knex';
import createSchema, { createKnexTable } from 'json-rest-schema';

// Configure your database
const db = knex({
  client: 'postgresql', // or 'mysql', 'sqlite3', etc.
  connection: {
    host: '127.0.0.1',
    user: 'your_username',
    password: 'your_password',
    database: 'your_database'
  }
});

// Define your schema
const userSchema = createSchema({
  email: { type: 'string', required: true, maxLength: 255, unique: true },
  username: { type: 'string', required: true, maxLength: 50, minLength: 3 },
  age: { type: 'number', nullable: true, min: 0, max: 150 },
  isActive: { type: 'boolean', defaultTo: true },
  metadata: { type: 'object', nullable: true }
});

// Create the table
await createKnexTable(db, 'users', userSchema, { 
  timestamps: true  // Adds created_at and updated_at columns
});

// Don't forget to close the connection
await db.destroy();
```

### Generating Migration Files

For production applications, you'll want to use migrations. Use `generateKnexMigration` to create migration files:

```javascript
import { writeFileSync } from 'fs';
import createSchema, { generateKnexMigration } from 'json-rest-schema';

const userSchema = createSchema({
  email: { type: 'string', required: true, maxLength: 255, unique: true },
  username: { type: 'string', required: true, maxLength: 50 },
  role: { type: 'string', defaultTo: 'user', maxLength: 20 },
  lastLogin: { type: 'dateTime', nullable: true }
});

// Generate migration code
const migrationCode = generateKnexMigration('users', userSchema, { 
  timestamps: true 
});

// Save to a file with timestamp
const timestamp = new Date().toISOString()
  .replace(/[-:T]/g, '')
  .substr(0, 14);
const filename = `migrations/${timestamp}_create_users_table.js`;

writeFileSync(filename, migrationCode);
console.log(`Created migration: ${filename}`);
```

The generated migration will look like:

```javascript
exports.up = function(knex) {
  return knex.schema.createTable('users', (table) => {
    table.increments('id').primary();
    table.string('email', 255).notNullable().unique();
    table.string('username', 50).notNullable();
    table.string('role', 20).defaultTo('user');
    table.datetime('lastLogin').nullable();
    table.timestamps(true, true);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('users');
};
```

### Type Mappings

The library automatically maps json-rest-schema types to appropriate Knex column types:

| Schema Type | Knex Column Type | Notes |
|---|---|---|
| `string` | `string()` | Uses `maxLength` if specified |
| `number` | `float()` or `decimal()` | Uses `decimal` if `precision` and `scale` are specified |
| `id` | `integer()` | Adds `.unsigned()` by default |
| `boolean` | `boolean()` | |
| `date` | `date()` | |
| `dateTime` | `datetime()` | |
| `timestamp` | `integer()` | For Unix timestamps |
| `array` | `json()` | |
| `object` | `json()` | |
| `serialize` | `json()` | |
| `blob`/`file` | `binary()` | |

### Advanced Features

#### Foreign Key Relationships

```javascript
const postSchema = createSchema({
  title: { type: 'string', required: true, maxLength: 200 },
  authorId: { 
    type: 'id', 
    required: true,
    references: { 
      table: 'users', 
      onDelete: 'CASCADE',
      onUpdate: 'RESTRICT'
    }
  }
});
```

#### Decimal Precision

```javascript
const productSchema = createSchema({
  price: { 
    type: 'number', 
    required: true,
    precision: 10,  // Total digits
    scale: 2,       // Decimal places
    min: 0
  }
});
```

#### Custom Table Options

```javascript
await createKnexTable(db, 'products', productSchema, {
  autoIncrement: false,  // Don't add auto-incrementing ID
  timestamps: true       // Add created_at/updated_at
});
```

### Complete Example

Here's a complete example showing how validation and database schema work together:

```javascript
import knex from 'knex';
import createSchema, { createKnexTable } from 'json-rest-schema';

// 1. Define your schema once
const userSchema = createSchema({
  email: { type: 'string', required: true, maxLength: 255, unique: true },
  age: { type: 'number', nullable: true, min: 18, max: 100 },
  isActive: { type: 'boolean', defaultTo: true }
});

// 2. Create the database table
const db = knex({ /* your config */ });
await createKnexTable(db, 'users', userSchema);

// 3. Use the same schema for validation
const userInput = {
  email: 'user@example.com',
  age: '25',  // Will be cast to number
  isActive: 'true'  // Will be cast to boolean
};

const { validatedObject, errors } = await userSchema.validate(userInput);

if (Object.keys(errors).length === 0) {
  // 4. Save the validated data
  await db('users').insert(validatedObject);
  console.log('User saved successfully!');
}

await db.destroy();
```

This approach ensures that:
- Your validation rules match your database constraints
- Type casting happens consistently
- You maintain a single source of truth for your data structure

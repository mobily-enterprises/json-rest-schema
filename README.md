# How to Use the Schema Validation Library: A Tutorial

Welcome! This tutorial will walk you through everything you need to know to use the schema validation library effectively. We'll start with the basics and progressively move to more advanced topics like creating your own custom rules.

## Shared Contract Boundary

`json-rest-schema` is intentionally **synchronous**. Shared schemas need to run the same way on the client and the server, so this library is scoped to:

* typing and casting
* normalization
* local field validation
* local cross-field validation

It is **not** the place for database-backed uniqueness checks, external API lookups, or any other stateful async business rule. Put those checks in higher layers such as services, repositories, or actions after schema validation has produced a normalized payload.

## 1. Getting Started: Your First Schema

Let's start with a common use case: validating a user registration form.

First, import the library's factory function and define the structure of the data you expect.

```javascript
import { createSchema } from './src/index.js';

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

const { validatedObject, errors } = userSchema.create(userInput);

// Check if there were any errors by seeing if the errors object has keys
if (Object.keys(errors).length > 0) {
  console.log("Validation failed!");
  console.log(errors);
} else {
  console.log("Validation successful!");
  console.log(validatedObject);
}
```

**What happens here?**

1.  The `age` string `'25'` is **cast** to the number `25` by the `number` type handler.
2.  The `username` string `'  alex '` is **transformed** by the `string` type handler to `'alex'` (it gets trimmed).
3.  Since there are no validation errors, the `errors` object will be empty.
4.  The `validatedObject` will contain the clean, cast, and transformed data.

---

## 2. Understanding the Validation Result

The schema operation methods return an object with two properties: `validatedObject` and `errors`.

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

const { validatedObject, errors } = userSchema.create(invalidInput);

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

### Operation Contracts

For explicit write semantics, the schema instance exposes three synchronous operation-specific methods:

```javascript
userSchema.create(input);
userSchema.replace(input);
userSchema.patch(input);
```

They all return the same `{ validatedObject, errors }` shape, but they differ in how omitted fields are treated:

* **`create()`**: validates a create payload, enforces `required`, applies `defaultTo`, and leaves omitted optional fields omitted.
* **`replace()`**: validates a full replacement payload, enforces `required`, applies `defaultTo`, and preserves omitted fields.
* **`patch()`**: validates only explicitly provided fields and returns only the normalized fields that were touched.

### Transport JSON Schema Export

`json-rest-schema` can also export a transport-facing JSON Schema document for adapters that want pre-handler validation.

```javascript
const userSchema = createSchema({
  id: { type: 'id', required: true },
  email: { type: 'string', required: true },
  age: { type: 'number', min: 18, defaultTo: 18 },
  status: { type: 'string', enum: ['draft', 'published'] }
})

const createTransportSchema = userSchema.toJsonSchema()
const patchTransportSchema = userSchema.toJsonSchema({ mode: 'patch' })
```

Key points:

* **Draft**: exports draft-07 JSON Schema.
* **Mode-aware**: `mode: 'create' | 'replace' | 'patch'` controls the `required` list and whether `defaultTo` is emitted.
* **Transport-facing**: the export is intended for JSON/Ajv/Fastify-style request validation, not for reproducing every in-process coercion path.
* **Strict field shape**: `additionalProperties` defaults to `false` because runtime validation rejects unknown fields. Override it with `toJsonSchema({ additionalProperties: true })` if needed.
* **Single source of truth**: only rules owned by `json-rest-schema` are exported. External metadata keys from other layers are ignored.
* **Passive metadata preserved**: schema-owned passive metadata such as `precision`, `scale`, `unsigned`, and `temporalPrecision` is preserved under `x-json-rest-schema.metadata`.
* **Custom rules**: if a custom type or validator needs transport export support, attach a `toJsonSchema()` hook to the handler. If you register a custom validator without that hook, export fails loudly instead of silently drifting.

---

## 3. Built-in Rules Reference

Here is a complete list of all types and validators available out of the box.

### Built-in Types (Casting Rules)

A field's `type` defines how the input value will be converted before any other validation rules are run.

| Type Name | Description |
|---|---|
| `string` | Converts the input to a string. By default, it trims whitespace. Fails if the input is an object or array. |
| `number` | Converts the input to a finite number. Empty strings, whitespace-only strings, and non-finite values fail validation. |
| `boolean`| Converts the input to a boolean using explicit true/false tokens such as `true`, `false`, `1`, `0`, `yes`, `no`, `on`, and `off`. Unknown values fail validation. |
| `array` | Ensures the value is an array. If the input is not already an array, it will be wrapped in one (e.g., `'tag1'` becomes `['tag1']`). |
| `id` | Parses the value into a positive safe integer identifier. It rejects non-canonical forms such as leading zeroes or strings with junk suffixes. |
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
| `enum: <array>` | Restricts the field to one of the declared values. Exported as a standard JSON Schema `enum`. |
| `notEmpty: true` | The field cannot be an empty string (`''`). This is different from `required`, as an empty string is still a defined value. |
| `length: <number>`| For `string` types, it **truncates** the string to the specified length. For `number` types, it throws an error if the number of digits in the original input exceeds the specified length. |
| `nullable: true`| Allows the value for this field to be `null`. By default, `null` is not allowed. |
| `nullOnEmpty: true`| If the input value is an empty string (`''`), it will be cast to `null` before other validators run. |
| `lowercase: true` | **Transforms** the string to all lowercase. |
| `uppercase: true` | **Transforms** the string to all uppercase. |
| `validator: <function>`| Allows you to provide your own **synchronous** custom validation function for complex, one-off logic. |
| `defaultTo: <value>` | If the field is not present in the input object, this value will be used in validation modes that apply defaults. Can be a value or a function that returns a value. |
| `unsigned: true` | Passive schema metadata indicating non-negative numeric storage intent. Preserved in transport export metadata. |
| `precision: <number>` | Passive schema metadata for decimal total digits. Preserved in transport export metadata. |
| `scale: <number>` | Passive schema metadata for decimal fractional digits. Preserved in transport export metadata. |
| `temporalPrecision: <number>` | Passive schema metadata for time or datetime fractional-second precision. Preserved in transport export metadata. |

---

## 4. Extending the Library: Custom Rules

The real power of the library comes from its extensibility. You can easily add your own reusable types and validators. They must stay synchronous so the schema remains portable across environments. When you do this, you'll be passed a powerful `context` object.

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
* **`mode`**: The active validation contract: `'create'`, `'replace'`, or `'patch'`.
* **`fieldPresent`**: A boolean indicating whether the field was explicitly present in the original input object.
* **`throwTypeError()`**: A function you can call to throw a standardized `TYPE_CAST_FAILED` error. This is the preferred way to report an error from within a type handler.
* **`throwParamError(code, message, params)`**: A function you can call to throw a standardized validation error from within a validator. It accepts a custom error `code`, a `message`, and an optional `params` object.

### Creating a Custom Validator

Let's say you frequently need to validate that a field is a URL-friendly "slug" (e.g., `my-blog-post`).

You can define a new validator once and use it anywhere.

Custom validators must be synchronous and local. If you need to ask a database or external API something, validate the payload first and run that business rule afterward in your service layer.

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
const { validatedObject } = productSchema.create(product);

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

## 6. Database-Agnostic Focus

`json-rest-schema` is deliberately scoped to runtime validation and transformation. It no longer ships helpers for creating database tables or migrations, and it does not prescribe a specific persistence layer. Treat the schemas you build with this library as the canonical description of your data when you design storage models, migrations, API responses, or documentation.

If you pair the library with a database toolkit (such as Knex), keep the tooling concerns separate: write migrations and models in the tool that best fits your project, then reuse the same field definitions inside `createSchema` so validation, casting, and persistence stay aligned.

> Looking for automation around database schema generation? See `FUTURE_MIGRATION_MODULE.md` for a high-level proposal of an optional companion package.

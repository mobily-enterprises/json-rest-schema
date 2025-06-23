# How to Use the Schema Validation Library: A Tutorial

Welcome! This tutorial will walk you through everything you need to know to use the schema validation library effectively. We'll start with the basics and progressively move to more advanced topics like creating your own custom rules.

## 1. Getting Started: Your First Schema

Let's start with a common use case: validating a user registration form.

First, import the library's factory function and define the structure of the data you expect.

```javascript
import createSchema from './src/index.js';

// Define the structure and rules for our user data
const userSchema = createSchema({
  username: { type: 'string', required: true, min: 3 },
  email: { type: 'string', required: true },
  age: { type: 'number', min: 18, default: 18 }
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

  // Check if there were any errors
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

* **It's a Map, Not an Array:** The `errors` object is a map where keys are the field names that failed. This allows you to instantly check if a specific field has an error: `if (result.errors.age) { ... }`.
* **Rich Error Structure:** Each error in the map is a detailed object: `{ code, message, params }`.

Let's look at an example with invalid data:

```javascript
const invalidInput = {
  username: 'Al', // Fails 'min: 3'
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
    "params": {
      "min": 3,
      "actual": 2
    }
  },
  "email": {
    "field": "email",
    "code": "REQUIRED",
    "message": "Field is required"
  },
  "age": {
    "field": "age",
    "code": "MIN_VALUE",
    "message": "Value must be at least 18.",
    "params": {
      "min": 18,
      "actual": 16
    }
  }
}
```

* **`code`**: A stable, machine-readable string. Use this in your code for logic (`if (err.code === 'MIN_LENGTH')`).
* **`message`**: A human-readable message, great for developers or for displaying directly to users in simple cases.
* **`params`**: Extra context about the failure. This is incredibly useful for creating dynamic error messages (e.g., "You entered 2 characters, but a minimum of 3 is required.").

---

## 3. Extending the Library: Custom Rules

The real power of the library comes from its extensibility. You can easily add your own reusable types and validators.

### Creating a Custom Validator

Let's say you frequently need to validate that a field is a URL-friendly "slug" (e.g., `my-blog-post`).

You can define a new validator once and use it anywhere.

```javascript
// Do this once when your application starts
createSchema.addValidator('slug', (context) => {
  const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

  if (typeof context.value !== 'string' || !slugRegex.test(context.value)) {
    // Throw a structured error if validation fails
    throw context.schema._paramError(
      context.fieldName,
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
    throw context.schema._typeError(context.fieldName);
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

## 4. Advanced: Creating a Plugin

If you create a lot of custom types and validators for your project, you can bundle them into a single, reusable **Plugin**. A plugin is just an object with an `install` method.

```javascript
// my-custom-plugin.js
const MyCustomPlugin = {
  install(manager) {
    // The manager is the same object we used before,
    // so it has .addType() and .addValidator() methods.
    
    manager.addType('csv', context => { /* ...as above... */ });
    
    manager.addValidator('slug', context => { /* ...as above... */ });
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


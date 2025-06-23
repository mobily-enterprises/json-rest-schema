# Developer Onboarding & Architectural Deep Dive

Welcome to the project! This document is the definitive guide to understanding the internal architecture, design patterns, and control flow of this library. Its purpose is to get you, a developer working on this codebase, up to speed as quickly and thoroughly as possible.

We will not just cover *what* the code does, but *why* it does it that way.

## 1. Guiding Philosophy & Core Problem

This library was created to solve a common problem: server-side data validation and casting that is **lightweight, dependency-free, and infinitely extensible**. While larger libraries like Zod or Joi are excellent, they can be overkill for projects where bundle size and simplicity are paramount.

Our architecture is therefore guided by two principles:

1.  **Extreme Extensibility:** The core must be minimal and stable. All validation rules, including the built-in ones, are implemented as optional, pluggable components. A developer should **never** need to fork the library to add custom, project-specific logic. This is achieved via a simple but powerful plugin system.
2.  **Aggressive Separation of Concerns:** Each component has a single, well-defined responsibility. This makes the codebase predictable and prevents the kind of "spaghetti code" that can plague validation logic.
    * **Manager:** Handles registration only.
    * **Schema:** Handles execution only.
    * **Plugins:** Provide rules only.

---

## 2. Architectural Deep Dive: The Three Pillars

The entire library is composed of three main components. Understanding their explicit roles and how they interact is the key to understanding the whole system.

### Pillar 1: `src/SchemaManager.js` - The Registrar

* **Core Responsibility:** To act as a central registry for all available "tools" (types and validators). It is, in essence, a service locator for validation functions.
* **How it Works:** This is a simple class that holds two key-value objects: `this.types` and `this.validators`. The `.addType()` and `.addValidator()` methods are simple setters that populate these objects, mapping a string name (e.g., `'string'`) to a handler function.
* **Key Design Decision - Decoupling:** This class knows *what* rules exist but has **no idea** how or when they will be executed. It decouples rule **definition** from rule **execution**. The `.use()` method is a clean entry point for plugins to access the manager's `addType` and `addValidator` methods, thereby registering themselves.

### Pillar 2: `src/Schema.js` - The Execution Engine

* **Core Responsibility:** This is the heart of the library. It takes a schema structure and a set of registries (provided by the `SchemaManager`) and performs the actual validation against an input object.
* **How it Works:** Its main public method, `validate()`, orchestrates the entire process. An instance of `Schema` is self-contained; it holds its own structure and a *snapshot* of the types and validators that were available at the moment of its creation.
* **Key Design Decision - Self-Contained Instances:** Because the `Schema` constructor copies the handler registries, schemas created *before* a plugin is registered will not have access to the new rules. This is intentional and ensures that schema behavior is predictable and not affected by global state changes made after their creation.

### Pillar 3: `src/CorePlugin.js` - The Default Toolset

* **Core Responsibility:** To provide all the out-of-the-box types and validators that make the library useful from the start.
* **How it Works:** It is a single object with an `install` method. This method is called by the `SchemaManager`'s `.use()` method. Its only job is to call `manager.addType()` and `manager.addValidator()` for every built-in rule.
* **Key Design Decision - "Eating Your Own Dog Food":** By treating the core rules as just another plugin, we prove the validity and power of the plugin architecture. This file also serves as the canonical example for developers on how to create their own custom plugins.

---

## 3. Codebase Tour & Control Flow

To truly understand the system, you must trace the flow of control from the public API down to the individual rule handlers.

### Step 1: `src/index.js` (The Public Facade)

This is the public-facing entry point. It employs the **Facade pattern** to provide a simple, clean API that hides the underlying complexity of the `SchemaManager`.

* A **single, global `SchemaManager` instance** (`mainManager`) is created. This is a pragmatic choice for simplicity. For the vast majority of applications, one central registry of rules is all that is needed.
* The exported `createSchema` function is a factory that calls `mainManager.create(structure)`.
* Crucially, methods like `.use()` are bound from the `mainManager` instance directly onto the `createSchema` function (`createSchema.use = mainManager.use.bind(mainManager)`). This allows for the clean API (`createSchema.use(...)`) without exposing the manager itself.

### Step 2: `src/Schema.js` (The Core Logic)

This is the most important file. Spend the most time here.

#### The `validate()` Method

This is the public-facing method that kicks everything off. Let's walk through its execution order:

1.  **Initialization:** An empty `errors` object map and a `validatedObject` (a shallow copy of the input) are created.
2.  **Spurious Field Check:** It first loops over the keys in the *input object* and checks if they exist in the schema's structure. This is a fast way to reject requests with unexpected fields.
3.  **Promise Aggregation:** It then determines the list of fields to validate and creates an array of promises by calling `_validateField()` for each one.
4.  **Concurrent Execution:** It executes all these validation promises in parallel using `Promise.all()`. This is a major performance feature.
5.  **Error Collection:** After all promises resolve, it loops through the results. If any of them are error objects, they are added to the `errors` map, keyed by the field name for efficient lookup.
6.  **Default Value Application:** This is the final, critical step. It checks if the `errors` map is empty. **If and only if the object is completely valid**, it loops through the schema structure one last time to apply any default values for fields that were missing from the original input. This prevents a partially-valid object from being hydrated with default data.

#### The `_validateField()` Method

This private method is the heart of the execution pipeline for a *single* field. Its order of operations is critical:

```
  Input Value
      |
      V
+-----------------------------------------------------------+
| 1. Pre-validation Checks                                  |
|    - undefined? (required?) --> EXIT / ERROR              |
|    - null? (canBeNull?)   --> EXIT / ERROR                |
|    - empty string? (emptyAsNull?) --> SET to null, EXIT   |
+-----------------------------------------------------------+
      |
      V (Value may have changed to null)
+---------------------------------------------+
| 2. Type Casting                             |
|    - Look up type handler (e.g., 'number')  |
|    - Execute handler. Value is now cast.    |
+---------------------------------------------+
      |
      V (Value is now the correct type)
+------------------------------------------------------------------+
| 3. Parameter Validators                                          |
|    - Loop through all other keys in definition (min, max, etc.)  |
|    - Execute each validator handler in sequence.                 |
|    - Handlers can either throw an error or transform the value.  |
+------------------------------------------------------------------+
      |
      V
  Final Validated Value
```

### Step 3: `src/CorePlugin.js` (The Rule Implementations)

Read this file last. Now that you understand the engine, you can see how the tools are built.

* **Type Handlers (`addType`)**: Their contract is to receive the `context` and **return** the correctly-typed value. If casting is impossible, they must `throw context.schema._typeError(...)`. Notice the `string` handler is defensive and only tries to convert primitives, while the `number` handler gracefully handles empty strings.
* **Validator Handlers (`addValidator`)**: Their contract is to receive the `context` and do one of two things:
    1.  **Transform:** If the rule is a transformer (e.g., `lowercase`), it returns the modified value.
    2.  **Validate:** If the rule is a check (e.g., `min`), it does nothing on success, or `throw context.schema._paramError(...)` on failure.

---

## 4. Advanced Patterns & "The Why"

#### Why the `ValidationContext` Object?

Instead of just passing `value` to each handler, we pass a rich `context` object. This is a core design decision that massively empowers developers writing custom rules.

* `value`: The current value of the field. It may have been transformed by previous handlers.
* `valueBeforeCast`: The original, untouched value from the input object. Crucial for validators like `notEmpty`.
* `object`: The *entire* object being validated, including any transformations made to other fields so far. This allows for complex, cross-field validation.
* `definition`: The schema definition for the current field (e.g., `{ type: 'string', min: 5 }`).
* `schema`: The `Schema` instance itself, providing access to helper methods like `_paramError`.

#### Asynchronous Validation In Practice

The `async` nature of the library is not just academic. It allows for powerful custom validators.

**Example: Check if a username is unique by simulating a database call.**

```javascript
// In a custom plugin or initial setup
createSchema.addValidator('isUnique', async (context) => {
  // In a real app, this would be a database query
  const fakeDbCall = (username) => {
    const existingUsers = ['admin', 'testuser'];
    return new Promise(resolve => {
      setTimeout(() => resolve(existingUsers.includes(username)), 100);
    });
  };

  const isTaken = await fakeDbCall(context.value);

  if (isTaken) {
    throw context.schema._paramError(
      context.fieldName,
      'NOT_UNIQUE',
      `The username '${context.value}' is already taken.`
    );
  }
});

// Usage in a schema
const userSchema = createSchema({
  username: { type: 'string', required: true, isUnique: true }
});
```

The core engine handles the `await` and promise resolution automatically.

---

## 5. How to Contribute

* **Code Style:** Follow the existing conventions. Use Prettier/ESLint if configured. Method names are camelCase.
* **Private Methods:** Internal helper methods on the `Schema` class are prefixed with an underscore (e.g., `_validateField`). Do not call these from outside the class.
* **JSDoc:** All new methods and complex logic should be documented with JSDoc to maintain clarity and enable static analysis.
* **Adding a Rule:** To add a new core rule, open `src/CorePlugin.js` and add your `addType` or `addValidator` call. Ensure you consider all edge cases (null, undefined, wrong types).
* **Adding a Feature:** If you need to add a feature to the core engine in `Schema.js`, open an issue or pull request to discuss the architectural implications first. The core should remain as stable as possible.

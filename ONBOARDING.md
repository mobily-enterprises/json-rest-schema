# ONBOARDING.md - Understanding the `jsonrestapi-schema` Library Architecture

Welcome to the `jsonrestapi-schema` project! This document aims to demystify the library's internal structure and design philosophy. If you're looking to contribute, extend its functionality, or simply understand how it works under the hood, you're in the right place.

---

## 1. The Core Philosophy: Simplicity and Extensibility

Our primary goal for this library is to provide a robust, extensible, and **easy-to-understand** mechanism for defining and validating data schemas. We achieve this by:

* **Centralized, yet Implicit, Management of Registries:** Type casting functions and validation rules are managed globally within the library's entry point, but without the need for an explicit "Manager" class instance to retrieve them.
* **Clear Separation of Concerns:** The responsibility for *defining* types/validators is separate from the responsibility for *applying* them during validation.
* **Plugin-Based Extensibility:** New types and validators can be seamlessly added through a straightforward plugin system.
* **Direct API Access:** Key functions for interacting with the library are exposed directly, minimizing layers of abstraction.

---

## 2. The Architecture - A Deep Dive

Let's walk through the main components and how they interact:

### 2.1. `./src/index.js` - The Brains of the Operation

This file is the true heart and soul of the library. It acts as the central coordinator, managing the global collection of type and validator handlers, and providing the primary interface for users.

**Key Features of `index.js`:**

* **Global Registries (`globalTypes` and `globalValidators`):**
    * At the top level of the `index.js` module, we declare two plain JavaScript objects: `const globalTypes = {};` and `const globalValidators = {};`.
    * **Crucially, these objects are *not* directly exported.** This design choice makes them effectively "private" to the `index.js` module's scope. They serve as the single, authoritative source for all registered type casting functions and validation logic across the entire application's lifetime when this library is imported.
    * Think of them as the library's internal knowledge base for how to process different data types and apply various rules.

* **Registration Functions (`addType` and `addValidator`):**
    * To allow external code (including plugins) to add to our `globalTypes` and `globalValidators` registries, `index.js` exports two dedicated functions: `export function addType(...)` and `export function addValidator(...)`.
    * These functions are straightforward: they take a `name` (e.g., `'string'`, `'min'`) and a `handler` function, perform a basic type check on the handler, and then assign it to the respective `globalTypes` or `globalValidators` object using the given `name` as the key.
    * This provides a controlled and consistent API for extending the library's capabilities.

* **The Plugin System (`use` function):**
    * The `export function use(plugin)` function is our gateway for extensibility. It expects a `plugin` object that *must* have an `install` method.
    * When `use(plugin)` is called, it executes `plugin.install()`.
    * The `use` function passes a simple API object to the plugin's `install` method: `{ addType, addValidator }`. This means the plugin only receives the specific functions it needs to register its handlers, without having to know or interact with any other internal structures. It's clean, minimal, and promotes loose coupling.

* **The Schema Factory (`createSchema`):**
    * The `const createSchema = (structure) => new Schema(structure, globalTypes, globalValidators);` function is the primary way users will interact with the library to define a new schema.
    * When you call `createSchema({ /* your schema definition */ })`, it doesn't return some intermediary manager. Instead, it directly instantiates a new `Schema` object (from `./src/Schema.js`).
    * **Crucially, it passes the *current references* to our `globalTypes` and `globalValidators` objects to the new `Schema` instance's constructor.** This means every `Schema` object created will automatically be "aware" of all the types and validators that have been registered globally up to that point.

* **The Public API (`createSchema.addType`, `createSchema.addValidator`, `createSchema.use`):**
    * For user convenience and to maintain a familiar API shape (if you've seen similar libraries), we attach the globally exported `addType`, `addValidator`, and `use` functions as properties directly onto the `createSchema` function itself:
        ```javascript
        createSchema.addType = addType;
        createSchema.addValidator = addValidator;
        createSchema.use = use;
        ```
    * This allows consumers of the library to import just one thing (`import createSchema from 'jsonrestapi-schema';`) and then access all core functionalities through it: `createSchema(...)`, `createSchema.addType(...)`, `createSchema.use(...)`.

* **Automatic Core Plugin Installation:**
    * Right before the final export, `index.js` explicitly calls `createSchema.use(CorePlugin);`.
    * This ensures that as soon as your application imports `jsonrestapi-schema`, all the built-in types (like `string`, `number`, `boolean`) and validators (like `min`, `max`, `required`) are automatically registered and ready for use. No extra setup step is required for basic functionality.

### 2.2. `./src/Schema.js` - The Validation Workhorse

While `index.js` manages the global registries, the `Schema` class is where the actual validation magic happens for a *specific* schema definition.

**Key Features of `Schema.js`:**

* **Self-Contained Validation Logic:** Each instance of `Schema` represents a single, defined data structure. It contains the logic to traverse an input object, apply type casting, and run validation rules against its own `structure`.
* **Dependency Injection in Constructor:** Unlike the previous design, the `Schema` constructor (`constructor(structure, types, validators)`) now explicitly receives the `types` and `validators` registries it needs from the `createSchema` factory function. This makes its dependencies clear and improves its testability.
* **`_validateField` Method:** This private method is the granular core of the validation. For each field in your schema, it orchestrates:
    1.  **Pre-checks:** Handling `required` rules, skipping fields, and dealing with `null` or empty values based on options.
    2.  **Type Casting:** It looks up the appropriate type handler from its received `this.types` registry and attempts to transform the field's value.
    3.  **Parameter Validation:** It then iterates through any validation parameters defined for the field (e.g., `min`, `max`, `validator`), looks up their respective handlers in `this.validators`, and applies them.
* **`validate` Method:** This public asynchronous method orchestrates the validation of an entire object. It identifies allowed/disallowed fields, concurrently validates all fields using `_validateField`, collects all errors, and finally applies any `default` values to missing fields if the overall validation is successful.

### 2.3. `./src/CorePlugin.js` - The Default Toolbox

This file simply defines all the standard, built-in type and validator handlers that come with the library.

**Key Features of `CorePlugin.js`:**

* **The `install` Method:** This is the critical part. As discussed, its `install` method is designed to receive the `addType` and `addValidator` functions. It then calls these functions multiple times, registering all the core functionalities like `string`, `number`, `boolean` types, and `min`, `max`, `notEmpty` validators.
* **Clear Definition of Default Handlers:** It provides well-defined functions for common data transformations and validation checks, serving as excellent examples for how to write your own custom types and validators.

---
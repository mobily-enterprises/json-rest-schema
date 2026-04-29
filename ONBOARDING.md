# ONBOARDING.md - Understanding the `json-rest-schema` Library Architecture

Welcome to the `json-rest-schema` project! This document aims to demystify the library's internal structure and design philosophy. If you're looking to contribute, extend its functionality, or simply understand how it works under the hood, you're in the right place.

---

## 1. The Core Philosophy: Simplicity and Extensibility

Our primary goal for this library is to provide a robust, extensible, and **easy-to-understand** mechanism for defining and validating data schemas. We achieve this by:

* **Centralized, yet Implicit, Management of Registries:** Type casting functions and validation rules are managed globally within the library's entry point, but without the need for an explicit "Manager" class instance to retrieve them.
* **Clear Separation of Concerns:** The responsibility for *defining* types/validators is separate from the responsibility for *applying* them during validation.
* **Plugin-Based Extensibility:** New types and validators can be seamlessly added through a straightforward plugin system.
* **Direct API Access:** Key functions for interacting with the library are exposed directly, minimizing layers of abstraction.
* **Synchronous Shared Contracts:** Schemas are intentionally synchronous so the same contract can run on both client and server without pulling in database, network, or other stateful dependencies.

Because of that last point, this library owns typing, casting, normalization, and local validation only. Business rules that require I/O belong in higher layers such as services, repositories, or actions.

---

## 2. The Architecture - A Deep Dive

Let's walk through the main components and how they interact:

### 2.1. `./src/` Layout

The source tree now stays intentionally shallow:

* `./src/index.js` is the public entry point
* `./src/core/` contains the runtime validation engine and transport export
* `./src/utils/` contains shared helper utilities
* `./src/adapters/` contains optional UI-library integration layers

That split is deliberate. It is enough structure to keep responsibilities easy to find, without turning a small library into a directory maze.

### 2.2. `./src/index.js` - The Main Entry Point

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
    * The `createSchema(structure, options)` factory function is the primary way users will interact with the library to define a new schema.
    * When you call `createSchema({ /* your schema definition */ })`, it doesn't return some intermediary manager. Instead, it directly instantiates a new `Schema` object (from `./src/core/Schema.js`).
    * **Crucially, it passes the *current references* to our `globalTypes` and `globalValidators` objects to the new `Schema` instance's constructor**, along with any per-schema operation descriptors. This means every `Schema` object created will automatically be "aware" of all the types and validators that have been registered globally up to that point.

* **The Public API (`createSchema.addType`, `createSchema.addValidator`, `createSchema.use`):**
    * For user convenience and to maintain a familiar API shape (if you've seen similar libraries), we attach the globally exported `addType`, `addValidator`, and `use` functions as properties directly onto the `createSchema` function itself:
        ```javascript
        createSchema.addType = addType;
        createSchema.addValidator = addValidator;
        createSchema.use = use;
        ```
    * This allows consumers of the library to import just one thing (`import { createSchema } from 'json-rest-schema';`) and then access all core functionalities through it: `createSchema(...)`, `createSchema.addType(...)`, `createSchema.use(...)`.

* **Automatic Core Plugin Installation:**
    * Right before the final export, `index.js` explicitly calls `createSchema.use(CorePlugin);`.
    * This ensures that as soon as your application imports `json-rest-schema`, all the built-in types (like `string`, `number`, `boolean`) and validators (like `min`, `max`, `required`) are automatically registered and ready for use. No extra setup step is required for basic functionality.

### 2.3. `./src/core/Schema.js` - The Validation Workhorse

While `index.js` manages the global registries, the `Schema` class is where the actual validation magic happens for a *specific* schema definition.

**Key Features of `Schema.js`:**

* **Self-Contained Validation Logic:** Each instance of `Schema` represents a single, defined data structure. It contains the logic to traverse an input object, apply type casting, and run validation rules against its own `structure`.
* **Dependency Injection in Constructor:** Unlike the previous design, the `Schema` constructor (`constructor(structure, types, validators, operations)`) now explicitly receives the `types`, `validators`, and per-schema `operations` it needs from the `createSchema` factory function. This makes its dependencies clear and improves its testability.
* **Operation Registry:** `create`, `replace`, and `patch` are default operation descriptors stored in an internal registry. Additional operations can be declared per schema, and the `Schema` instance automatically installs method aliases for them. Operation descriptors currently support `targetFields`, `enforceRequired`, `applyDefaults`, `outputFields`, and `rejectExplicitUndefined`.
* **Recursive Contract Support:** Nested object contracts are expressed with `type: 'object'` plus `schema`, nested array items are expressed with `type: 'array'` plus `items`, and opaque object bags are expressed with `type: 'object'` plus `additionalProperties: true`. This is intentionally much narrower than general JSON Schema.
* **`_validateField` Method:** This private method is the granular core of the validation. For each field in your schema, it synchronously orchestrates:
    1.  **Pre-checks:** Handling `required` rules, skipping fields, and dealing with `null` or empty values based on options.
    2.  **Type Casting:** It looks up the appropriate type handler from its received `this.types` registry and attempts to transform the field's value.
    3.  **Parameter Validation:** It then iterates through any validation parameters defined for the field (e.g., `min`, `max`, `validator`), looks up their respective handlers in `this.validators`, and applies them.
* **Recursive Validation Helpers:** After a field is cast, the `Schema` instance can recursively validate nested child schemas or array items. Nested object fields inherit the active operation contract, while array items that are object schemas are validated in `replace` mode. Errors are flattened into dotted paths such as `workspace.slug` and `roles.2.id`.
* **Operation Methods (`create`, `replace`, `patch`, and custom aliases):** These public synchronous methods are generated from the operation registry and orchestrate validation for a whole object. They identify allowed/disallowed fields, validate fields in a plain loop, collect all errors, and apply any `defaultTo` values required by the active operation contract. Names that already exist on `Schema` are reserved, so aliases such as `validateWith`, `toJsonSchema`, or `cleanup` are rejected.
* **`validateWith(operationName, object, options)` Method:** This is the canonical operation entry point. Generated aliases such as `create()` or `upsert()` simply delegate to it.
* **Path-Scoped Validation (`validateAt` and `validatePaths`):** These methods reuse the same casting, validator, and nested recursion code, but they validate only the selected schema paths. They default to `patch` semantics because that is the least surprising choice for interactive field validation. Exact selected paths can still opt into `create`, `replace`, or any custom operation.

**A concrete mental model for nested validation:**

1. A top-level operation such as `create()` or `patch()` decides which fields are in scope.
2. Each field is cast by its type handler.
3. If the field is:
   * a nested object contract, the child schema is validated recursively with the parent operation
   * an array with `items`, each item is validated recursively
   * an object bag with `additionalProperties: true`, recursion stops and the value passes through
4. Validator parameters run after casting and recursive normalization.
5. Any child errors are flattened back into the parent error map using dotted paths.

That sequencing is important. It means callers always see one flat `{ validatedObject, errors }` result even though the implementation is recursive.

**A concrete mental model for path-scoped validation:**

1. `validateAt()` or `validatePaths()` builds a selection tree from the requested dotted paths.
2. The validator walks only that selected subtree.
3. Exact selected paths can enforce `required` and apply defaults according to the chosen operation.
4. Parent container nodes are only validated enough to support traversal into the selected child paths.
5. Child and array-item recursion still uses the same type handlers, validator handlers, and nested schema logic as full-object validation.

That is why the subset APIs stay aligned with the main engine instead of becoming a second validation system with different behavior.

### 2.4. `./src/core/CorePlugin.js` - The Default Toolbox

This file simply defines all the standard, built-in type and validator handlers that come with the library.

**Key Features of `CorePlugin.js`:**

* **The `install` Method:** This is the critical part. As discussed, its `install` method is designed to receive the `addType` and `addValidator` functions. It then calls these functions multiple times, registering all the core functionalities like `string`, `number`, `boolean` types, and `min`, `max`, `notEmpty` validators.
* **Clear Definition of Default Handlers:** It provides well-defined synchronous functions for common data transformations and validation checks, serving as excellent examples for how to write your own custom types and validators.
* **Strict Object Ownership:** The built-in `object` type now validates that the incoming value is actually a plain object. That matters because nested contracts and opaque bags both depend on object-ness being explicit instead of being a loose pass-through.

### 2.5. `./src/core/transport-schema.js` - Transport Export

This module turns a `Schema` instance into a draft-07 JSON Schema document for transport-layer adapters.

**Key Features of `transport-schema.js`:**

* **Operation-aware export:** The same operation descriptors used at runtime control `required` fields and exported defaults.
* **Recursive export:** Nested object contracts and array item contracts are exported recursively from the same schema definitions.
* **Intentional restraint:** The exporter supports nested objects, nested arrays, and opaque object bags, but it does not grow into a general-purpose JSON Schema authoring layer. That line keeps the library readable and keeps runtime behavior aligned with export behavior.

**Why the nested scope stays small:**

We support only three nested shapes because they cover most real shared REST contracts without creating a second generic schema language inside the library:

* `type: 'object'` plus `schema`
* `type: 'array'` plus `items`
* `type: 'object'` plus `additionalProperties: true`

We intentionally do **not** support arbitrary embedded JSON Schema, `oneOf` / `anyOf`, recursive refs, or mixed known-field-plus-arbitrary-rest object semantics. That restraint is what keeps both the runtime and the docs understandable for a junior developer reading the code for the first time.

### 2.6. `./src/utils/error-helpers.js` - Error Utilities

This module is intentionally small. It does not validate anything. It only helps consumers work with the existing flat error contract.

Current helpers:

* `getError(errors, path)` for reading one dotted-path error
* `hasError(errors, path)` for simple boolean checks
* `nestErrors(errors)` for turning flat dotted paths into nested object/array form
* `flattenErrors(nestedErrors)` for turning nested object/array errors back into the flat dotted-path map

This split is deliberate:

* the runtime keeps one stable flat error contract
* adapters and UI layers can reshape that contract when they need to
* the reverse helper keeps adapters from re-implementing dotted-path flattening inconsistently

That lets the core stay simple without forcing every consumer into the same form-library error shape.

### 2.7. `./src/adapters/react-hook-form.js` - React Hook Form Adapter

This module is the first real UI-library adapter layer. It is intentionally not part of `Schema.js`.

What it does:

* accepts a `Schema` instance
* maps RHF resolver calls into `validateWith()` or `validatePaths()`
* converts flat dotted-path errors into RHF's nested error shape
* supports RHF native validation hooks

Important design choices:

* **Separate entry point:** it is exported as `json-rest-schema/react-hook-form` instead of being folded into the core root API surface.
* **Full-form validation defaults to `create`:** that gives useful required/default behavior for common create forms.
* **Field-level re-validation uses path selection:** when RHF re-validates a subset of fields during user interaction, the adapter validates only those selected paths.
* **Raw-by-default interaction:** field-level re-validation keeps raw values by default so normalization does not fight typing behavior. Callers can opt into normalized field-level values explicitly.
* **Canonical submit payloads still belong to the schema boundary:** in a real RHF app, the resolver validates correctly, but RHF still owns raw field state. If callers need a canonical REST payload, they should run one final schema operation in the submit handler. The React demo shows that pattern.

This is the pattern to preserve for future adapters: keep framework code thin, route everything through the existing schema engine, and do not duplicate validation rules in adapter land.

### 2.8. `./src/adapters/vue.js` - Vue Form Adapter

This module is the Vue-facing equivalent of the React resolver, but the shape is different because Vue does not revolve around a resolver contract.

What it does:

* exposes `useSchemaForm(schema, options)`
* exposes `useSchemaField(form, path)`
* keeps form errors in the core flat dotted-path contract
* adds convenience getters such as `nestedErrors`, `hasErrors`, `getErrorMessages()`, and field-level helpers
* routes full-form validation through `validateWith()`
* routes field and subset validation through `validateField()` / `validateFields()`

Important design choices:

* **No direct Vue import:** this module does not import `vue`. It accepts plain objects, Vue reactive proxies, or ref-like `{ value }` containers the caller already owns.
* **Full-form validation defaults to `create`:** the adapter mirrors the same default as the React resolver for the common create-form case.
* **Selected-path error merging:** field-level validation clears and replaces only the selected path errors. It does not wipe unrelated form errors every time a single field is re-validated.
* **Raw-state ownership stays in the app:** the adapter validates and normalizes, but it does not take over UI state management.
* **Reactivity stays caller-owned:** if a Vue app wants reactive error/result updates, it should pass Vue refs or reactive containers through `errors` / `lastResult` instead of expecting hidden Vue state inside the adapter.

That last point matters. This file is meant to help Vue forms use the schema layer cleanly, not to become a form state framework.

### 2.9. `./src/adapters/vuetify.js` - Vuetify Bridge

This module is intentionally even smaller than `./src/adapters/vue.js`.

What it does:

* exposes `createVuetifyRule(form, path)`
* exposes `getVuetifyErrorMessages(formOrErrors, path)`
* exposes `fieldProps(form, path, options)`

Important design choices:

* **Thin bridge only:** these helpers translate schema results into Vuetify's `rules` and `error-messages` conventions. They do not own validation logic themselves.
* **`fieldProps()` defaults to `rules` only:** Vuetify merges manual `error-messages` with rule-generated messages, so returning both by default would duplicate the same message on screen.
* **Schema remains the source of truth:** the rule helper clones the current form values, injects the candidate field value, and then calls the existing Vue form adapter. That keeps all normalization and validation behavior in one place.

This separation is worth preserving. The Vuetify layer should stay as glue code, not as a second validation implementation.

### 2.10. `./demos/` and `./playwright.config.js` - Runtime Demo Coverage

The demo apps live outside the publishable package surface and exist to prove the adapters in real browser runtimes.

What they do:

* `./demos/react-rhf` exercises the React Hook Form resolver in a browser app
* `./demos/vue-vuetify` exercises the Vue and Vuetify adapters in a browser app
* `./demos/shared/workspace-demo-schema.js` keeps both demos on the same contract
* `./playwright.config.js` starts both Vite dev servers and runs smoke tests against them

Important design choices:

* **Local source aliasing:** each demo aliases `json-rest-schema` imports back to the local `src/` files, so the demos always test the current checkout.
* **Shallow scope:** these are runtime proofs, not starter kits.
* **Browser-first verification:** Playwright exists here to catch issues unit tests will miss, such as Node-only imports leaking into the shared contract runtime.

### 2.11. `./src/adapters/vee-validate.js` - VeeValidate v5 Bridge

This module is smaller still.

VeeValidate v5 already accepts Standard Schema-compatible validators as `validationSchema`, so the right integration is not a custom VeeValidate state manager. The right integration is a tiny bridge that wraps a `Schema` instance in the Standard Schema shape.

What it does:

* exposes `toVeeValidateSchema(schema, options)`
* returns an object with a `~standard.validate()` method
* validates through `schema.validateWith(...)`
* returns normalized output on success
* converts the flat error map into Standard Schema `issues` with nested path segments

Important design choices:

* **No VeeValidate import:** the bridge has no runtime dependency on `vee-validate`.
* **Default operation is `create`:** that matches the other form adapters.
* **Standard Schema path output:** issue paths become arrays like `['roles', 0, 'label']` so VeeValidate can map nested array/object errors back to fields.
* **Configuration errors still throw:** invalid schema instances or invalid operation configuration are programmer errors and should fail loudly. Validation failures return `issues`.

There is also one VeeValidate-specific caveat worth preserving in the docs: Standard Schema validation can normalize submitted output, but VeeValidate still expects callers to supply their own `initialValues`. Schema defaults do not magically pre-populate the UI state.

---

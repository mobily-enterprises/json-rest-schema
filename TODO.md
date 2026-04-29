# TODO

## Goal

Make `json-rest-schema` stronger for form validation without turning the core
library into a form framework.

The core should stay:

- synchronous
- framework-agnostic
- contract-first
- focused on normalization and validation

The adapters should handle UI-library concerns.

## Guardrails

- Do not put `touched`, `dirty`, debounce, or component state into the core.
- Do not normalize raw form values on every keystroke by default.
- Keep React/Vue/Vuetify/VeeValidate code outside the core package surface.
- Keep the error contract flat and predictable.
- Reuse the existing dotted path format such as `user.email` and `roles.0.id`.

## Phase 1: Core Path APIs

- [x] Add `validateAt(path, object, options = {})`
  - Validate a single field path against the current schema.
  - Reuse existing nested validation rules and operation semantics.
  - Return a plain object immediately.
  - Proposed return shape:
    - `{ validatedValue, errors }`
  - If the path points to an object field, validate that object field using the
    same operation rules the full-schema validator would use.

- [x] Add `validatePaths(paths, object, options = {})`
  - Validate only a selected list of paths.
  - This is useful for wizard steps, blur validation, and dirty-field
    validation.
  - Return a plain object immediately.
  - Proposed return shape:
    - `{ validatedObject, errors }`

- [x] Add internal path utilities
  - Parse dotted and indexed paths.
  - Resolve nested definitions and nested values safely.
  - Reuse the same path logic for runtime validation and error generation.

- [x] Keep operation behavior consistent
  - `create`, `replace`, `patch`, and custom operations must behave the same
    whether validation runs on the whole object or only specific paths.

- [x] Decide and document explicit behavior for defaults in path validation
  - Default recommendation:
    - `validateAt()` returns the normalized value for the requested path.
    - Defaults apply only when that field would normally receive a default for
      the selected operation.

## Phase 2: Core Error Helpers

- [x] Add `getError(errors, path)`
  - Read a single field error by dotted path.

- [x] Add `hasError(errors, path)`
  - Small convenience helper for form adapters.

- [x] Add `nestErrors(errors)`
  - Convert flat dotted-path errors into a nested object shape for libraries
    that prefer nested form errors.

- [x] Add `flattenErrors(nestedErrors)`
  - Optional reverse helper if needed by adapter code.

## Phase 3: React Support

### Scope

Support React because many teams use it, but keep the integration thin.

### Core React adapter goals

- [x] Add a React Hook Form resolver
  - Proposed name:
    - `jsonRestSchemaResolver(schema, options = {})`
  - Map schema errors into React Hook Form's expected error structure.
  - Support nested object and array paths.
  - Respect the selected operation such as `create`, `replace`, `patch`, or a
    custom operation.

- [x] Normalize on submit, not on every keystroke
  - The resolver should validate on demand.
  - Normalized output should be available during submit handling.
  - Avoid forcing trimmed/coerced values back into form inputs while the user
    is typing unless the caller explicitly wants that.

- [ ] Add a small React helper only if truly needed
  - Possible helper:
    - `useJsonRestSchemaSubmit(schema, options)`
  - Keep it optional.
  - Do not build a full form state library.

### React tests

- [x] Add resolver tests for:
  - simple flat fields
  - nested object fields
  - array item fields
  - custom operations
  - error mapping
  - normalized submit output

### React packaging

- [x] Keep React-specific code out of the core runtime surface
  - Best direction:
    - separate adapter entry point or separate package
  - Do not add React as a hard runtime dependency of the main schema engine.

## Phase 4: Vue + Vuetify Support

### Scope

Vue + Vuetify should be a first-class adapter target because the core library
already fits the "validate payload, return errors, normalize on submit" model.

### Vue composables

- [x] Add a Vue composable layer
  - Done with:
    - `useSchemaForm(schema, options = {})`
    - `useSchemaField(form, path)`
  - Keep the API small and explicit.

- [x] Support field-level validation
  - Validate one path on blur or input when the caller asks for it.
  - Do not force one validation timing model.

- [x] Support normalized submit
  - Return normalized output on form submission.
  - Preserve raw UI values while the user is typing.

### Vuetify bridge

- [x] Add helpers for Vuetify field components
  - Possible helpers:
    - `createVuetifyRule(form, path, options)`
    - `fieldProps(form, path, options)`
  - Bridge schema errors into Vuetify `rules` / `error-messages` patterns.

- [x] Support `VForm` workflows
  - Validate on input, blur, or submit.
  - Work cleanly with nested paths.

### Vue/Vuetify tests

- [x] Add adapter tests for:
  - text field validation
  - nested field paths
  - array item paths
  - submit normalization
  - Vuetify rule/error-message mapping

## Phase 5: Optional VeeValidate Bridge

- [x] Evaluate a VeeValidate bridge only after the core path APIs exist
  - Implemented as:
    - `toVeeValidateSchema(schema, options = {})`
  - This is useful for touched/dirty state, wizard steps, and more complex form
    orchestration.
  - Keep it optional.
  - Do not move VeeValidate concepts into the core library.

## Phase 6: Documentation

- [x] Add a dedicated "Forms" section to `README.md`
  - Explain the raw-value vs normalized-value distinction.
  - Show when to validate on input, blur, and submit.
  - Show how to use path-level APIs.

- [x] Add React examples
  - React Hook Form example
  - nested field example
  - normalized submit example

- [x] Add Vue + Vuetify examples
  - `VForm` example
  - `VTextField` / nested path example
  - submit normalization example

- [x] Add VeeValidate example only if that bridge is implemented

## Phase 7: Test Coverage Expectations

- [x] Every new path API needs direct unit tests.
- [x] Every adapter needs mapping tests for nested errors.
- [x] Every adapter needs tests for custom operations.
- [x] Add regression tests for arrays of objects and dotted path errors.
- [x] Add examples that match real REST shapes, not toy form-only examples.

## Phase 8: Runtime Demos

- [x] Add a minimal React Hook Form demo app
  - Keep it small.
  - Exercise nested fields and a canonical submit payload.

- [x] Add a minimal Vue + Vuetify demo app
  - Keep it small.
  - Exercise blur validation and normalized submit behavior.

- [x] Add browser smoke tests with Playwright
  - Start both demo dev servers from the repo root.
  - Prove the current checkout works in a real browser runtime.

## Out of Scope

Do not add these unless the library direction changes intentionally:

- full form state management
- async validation in the schema layer
- component libraries inside the core package
- a generic JSON Schema form engine
- UI-specific business logic in the schema runtime

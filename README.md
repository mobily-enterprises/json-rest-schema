# Tutorial

Welcome! This tutorial will walk you through everything you need to know to use the schema validation library effectively. We'll start with the basics and progressively move to more advanced topics like creating your own custom rules.

Published documentation:

<https://mobily-enterprises.github.io/json-rest-schema/>

## Installation

Install the package in your app with:

```bash
npm install json-rest-schema
```

If you are working in this repo and want to run the documentation site locally:

```bash
npm install
npm run docs:dev
```

Build the full static site, including the standalone React and Vue demo apps, with:

```bash
npm run docs:build
```

Preview that built site locally with:

```bash
npm run docs:preview
```

The published docs site is the best place to read the polished guides for:

* create / replace / patch semantics
* nested object and array contracts
* React Hook Form, Vue + Vuetify, and VeeValidate adapters
* demo app walkthroughs
* fair comparisons with libraries like TypeBox, Joi, Zod, and Valibot

## Getting Started: Your First Schema

Let's start with a common use case: validating a user registration form.

First, import the library's factory function and define the structure of the data you expect.

```javascript
import { createSchema } from 'json-rest-schema';

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

## Understanding the Validation Result

The schema operation methods return an object with two properties: `validatedObject` and `errors`.

### The `validatedObject`

This object contains the data after all casting and transformations have been applied. It's the "clean" version of your input that you should use in the rest of your application (e.g., to save to a database).

### The `errors` Object

This is your primary tool for handling validation failures.

* **It's a Map, Not an Array:** The `errors` object is a map where keys are the field names that failed. This allows you to instantly check if a specific field has an error: `if (errors.age) { ... }`.
* **Rich Error Structure:** Each error in the map is a detailed object: `{ code, message, params }`.
* **Nested paths stay flat:** Nested fields are reported with dotted paths such as `workspace.slug` or `roles.2.id`. That keeps the external error contract simple even when schemas are recursive.

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

#### Error helper utilities

If you want a few adapter-friendly utilities around that flat error map, import them directly:

```javascript
import { createSchema, getError, hasError, nestErrors, flattenErrors } from 'json-rest-schema'
```

`getError(errors, path)` reads one dotted-path error:

```javascript
const slugError = getError(errors, 'workspace.slug')
```

`hasError(errors, path)` is the small boolean version:

```javascript
const showSlugError = hasError(errors, 'workspace.slug')
```

`nestErrors(errors)` converts the flat map into a nested object/array shape for form libraries that prefer nested field errors:

```javascript
nestErrors({
  'workspace.slug': {
    field: 'workspace.slug',
    code: 'MIN_LENGTH',
    message: 'Length must be at least 3 characters.',
    params: { min: 3, actual: 1 }
  },
  'roles.2.label': {
    field: 'roles.2.label',
    code: 'REQUIRED',
    message: 'Field is required',
    params: {}
  }
})
```

Result:

```javascript
{
  workspace: {
    slug: {
      field: 'workspace.slug',
      code: 'MIN_LENGTH',
      message: 'Length must be at least 3 characters.',
      params: { min: 3, actual: 1 }
    }
  },
  roles: [
    ,
    ,
    {
      label: {
        field: 'roles.2.label',
        code: 'REQUIRED',
        message: 'Field is required',
        params: {}
      }
    }
  ]
}
```

That keeps the runtime contract flat, while still making it easy to adapt into nested UI-state libraries.

`flattenErrors(nestedErrors)` does the reverse when a UI layer gives you nested field errors and you want to normalize them back into the library's flat contract:

```javascript
flattenErrors({
  workspace: {
    slug: {
      field: 'workspace.slug',
      code: 'MIN_LENGTH',
      message: 'Length must be at least 3 characters.',
      params: { min: 3, actual: 1 }
    }
  },
  roles: [
    ,
    ,
    {
      label: {
        field: 'roles.2.label',
        code: 'REQUIRED',
        message: 'Field is required',
        params: {}
      }
    }
  ]
})
```

Result:

```javascript
{
  'workspace.slug': {
    field: 'workspace.slug',
    code: 'MIN_LENGTH',
    message: 'Length must be at least 3 characters.',
    params: { min: 3, actual: 1 }
  },
  'roles.2.label': {
    field: 'roles.2.label',
    code: 'REQUIRED',
    message: 'Field is required',
    params: {}
  }
}
```

### Operation Contracts

For explicit write semantics, the schema instance exposes three synchronous built-in operation methods:

```javascript
userSchema.create(input);
userSchema.replace(input);
userSchema.patch(input);
```

They all return the same `{ validatedObject, errors }` shape, but they differ in how omitted fields are treated:

* **`create()`**: validates a create payload, enforces `required`, applies `defaultTo`, and leaves omitted optional fields omitted.
* **`replace()`**: validates a full replacement payload, enforces `required`, applies `defaultTo`, and preserves omitted fields.
* **`patch()`**: validates only explicitly provided fields and returns only the normalized fields that were touched.

These are built-in named operation contracts, not special cases in the engine. If you need a different contract, define a custom operation and the schema will generate a matching method alias automatically.

#### Worked operation example

This is easier to understand with one schema and three calls:

```javascript
const profileSchema = createSchema({
  username: { type: 'string', required: true },
  bio: { type: 'string' },
  role: { type: 'string', defaultTo: 'member' }
})
```

Calling `create()`:

```javascript
profileSchema.create({
  username: '  alex  '
})
```

Result:

```javascript
{
  validatedObject: {
    username: 'alex',
    role: 'member'
  },
  errors: {}
}
```

Calling `replace()` with the same payload:

```javascript
profileSchema.replace({
  username: '  alex  '
})
```

Result:

```javascript
{
  validatedObject: {
    username: 'alex',
    role: 'member'
  },
  errors: {}
}
```

Calling `patch()` with the same payload:

```javascript
profileSchema.patch({
  username: '  alex  '
})
```

Result:

```javascript
{
  validatedObject: {
    username: 'alex'
  },
  errors: {}
}
```

That difference is the whole point of operation contracts:

* `create()` and `replace()` walk the schema as a contract for the whole object.
* `patch()` walks only the fields the caller actually touched.
* Defaults apply on operations that opt into defaults.
* Missing required fields are only errors on operations that opt into required checks.

### Custom Operations

Custom operations are declared when you create the schema.

```javascript
const userSchema = createSchema({
  id: { type: 'id', required: true },
  email: { type: 'string', required: true },
  role: { type: 'string', defaultTo: 'guest' }
}, {
  operations: {
    upsert: {
      targetFields: 'schema',
      enforceRequired: false,
      applyDefaults: true,
      outputFields: 'validated'
    }
  }
})

const result = userSchema.upsert({ email: 'alex@example.com' })
const sameResult = userSchema.validateWith('upsert', { email: 'alex@example.com' })
```

Operation aliases are generated automatically from the operation registry, so `create`, `replace`, and `patch` keep working exactly as before. If you intentionally redefine one of those names in `operations`, the built-in behavior is replaced for that schema instance.

Supported operation descriptor keys:

| Key | Allowed Values | Meaning |
|---|---|---|
| `targetFields` | `'schema'` or `'input'` | Which fields are validated. `'schema'` walks the schema definition, `'input'` only validates explicitly provided fields. |
| `enforceRequired` | `true` or `false` | Whether missing `required` fields produce errors. |
| `applyDefaults` | `true` or `false` | Whether omitted fields with `defaultTo` are materialized into the result. |
| `outputFields` | `'validated'` or `'input'` | Which field set is considered when building `validatedObject`. `'validated'` follows schema fields, `'input'` follows only explicitly provided fields. |
| `rejectExplicitUndefined` | `true` or `false` | Whether an explicitly provided `undefined` value is treated as a type error. Defaults to `true`. |

Method names are generated automatically from operation names. Names that already exist on `Schema` are reserved and rejected. In practice that means names such as `validateWith`, `toJsonSchema`, `getFieldDefinitions`, `getFieldDefinition`, `getFieldMessages`, and `cleanup` cannot be used as operation aliases.

Schema instances also expose three field introspection helpers:

* `schema.getFieldDefinitions()` returns a frozen snapshot map of the top-level field definitions.
* `schema.getFieldDefinition(path)` resolves one field definition by dotted path, including nested object fields and numeric array segments such as `roles.0.id`, and returns it as a frozen snapshot.
* `schema.getFieldMessages(path)` returns the field's `messages` object as a frozen snapshot, or `{}` when none exist.

These helpers are intentionally read-only. They clone the schema metadata they expose so adapter code can inspect field settings without gaining a back door to mutate runtime validation behavior.

### Nested Objects, Arrays, and Opaque Object Bags

This library now supports the three nested contract shapes that come up constantly in shared REST payloads, without turning into a generic schema engine:

1. **Nested object fields** with `type: 'object'` and `schema`
2. **Nested array items** with `type: 'array'` and `items`
3. **Opaque object bags** with `type: 'object'` and `additionalProperties: true`

The important design rule is that these are still **application contracts**, not arbitrary JSON Schema fragments.

#### Nested object fields

Use a child `Schema` instance when a field should itself be validated as an object.

```javascript
const workspaceSummarySchema = createSchema({
  id: { type: 'id', required: true },
  slug: { type: 'string', required: true },
  ownerUserId: { type: 'id', required: true }
})

const workspaceSettingsSchema = createSchema({
  invitesEnabled: { type: 'boolean', required: true }
})

const workspaceViewSchema = createSchema({
  workspace: {
    type: 'object',
    required: true,
    schema: workspaceSummarySchema
  },
  settings: {
    type: 'object',
    required: true,
    schema: workspaceSettingsSchema
  }
})
```

How nested object fields behave:

* The nested schema inherits the parent operation contract.
* `create()` on the parent runs `create`-style rules inside the child.
* `patch()` on the parent runs `patch`-style rules inside the child.
* Errors are reported with dotted paths such as `workspace.slug`.
* Unknown nested keys are rejected because child schemas are strict by default, just like top-level schemas.

That operation inheritance is deliberate. A nested object inside a patch payload is usually itself a patch payload.

#### Worked nested object example

Using the schema above:

```javascript
const result = workspaceViewSchema.create({
  workspace: {
    id: '42',
    slug: '  main-workspace  ',
    extra: true
  },
  settings: {}
})
```

`validatedObject` becomes:

```javascript
{
  workspace: {
    id: 42,
    slug: 'main-workspace'
  },
  settings: {}
}
```

`errors` becomes:

```javascript
{
  'workspace.ownerUserId': {
    field: 'workspace.ownerUserId',
    code: 'REQUIRED',
    message: 'Field is required',
    params: {}
  },
  'workspace.extra': {
    field: 'workspace.extra',
    code: 'FIELD_NOT_ALLOWED',
    message: 'Field not allowed',
    params: {}
  },
  'settings.invitesEnabled': {
    field: 'settings.invitesEnabled',
    code: 'REQUIRED',
    message: 'Field is required',
    params: {}
  }
}
```

Now compare that with a nested patch:

```javascript
workspaceViewSchema.patch({
  workspace: {
    slug: '  sandbox  '
  }
})
```

Result:

```javascript
{
  validatedObject: {
    workspace: {
      slug: 'sandbox'
    }
  },
  errors: {}
}
```

Notice what did **not** happen:

* `workspace.id` was not required
* `workspace.ownerUserId` was not required
* no defaults were invented

That is exactly because the child object inherited the parent `patch` contract.

#### Nested array items

Use `items` when every array entry should be validated recursively.

```javascript
const roleSchema = createSchema({
  id: { type: 'string', required: true },
  label: { type: 'string', required: true }
})

const roleCatalogSchema = createSchema({
  roles: {
    type: 'array',
    required: true,
    items: roleSchema
  },
  assignableRoleIds: {
    type: 'array',
    required: true,
    items: { type: 'string', minLength: 1 }
  }
})
```

How array items behave:

* Primitive item definitions are validated item-by-item and normalized in place.
* If `items` is a nested object schema, each item is validated in `replace` mode.
* Array item errors use indexed dotted paths such as `roles.0.label`.

That `replace` rule for object items is intentional. If a client sends the `roles` array in a patch, they are replacing the array field, so each object item still needs to be complete.

#### Worked nested array example

```javascript
const result = roleCatalogSchema.patch({
  roles: [
    { id: 'admin' },
    { id: 'editor', label: '  Editor  ' }
  ],
  assignableRoleIds: [' owner ', '   ', 123]
})
```

`validatedObject` becomes:

```javascript
{
  roles: [
    { id: 'admin' },
    { id: 'editor', label: 'Editor' }
  ],
  assignableRoleIds: ['owner', '', '123']
}
```

`errors` becomes:

```javascript
{
  'roles.0.label': {
    field: 'roles.0.label',
    code: 'REQUIRED',
    message: 'Field is required',
    params: {}
  },
  'assignableRoleIds.1': {
    field: 'assignableRoleIds.1',
    code: 'MIN_LENGTH',
    message: 'Length must be at least 1 characters.',
    params: { min: 1, actual: 0 }
  }
}
```

This example shows both supported array styles:

* `roles` uses a child `Schema` instance for structured object items
* `assignableRoleIds` uses an inline field definition for primitive items

#### Opaque object bags

If a field needs to be “some object, but not one this library owns”, make that explicit:

```javascript
const schema = createSchema({
  metadata: {
    type: 'object',
    additionalProperties: true
  }
})
```

That means:

* the value must be a plain object
* keys are not validated
* values pass through untouched

This is the intended escape hatch for metadata bags and adapter-owned payloads. It is deliberately narrow: `additionalProperties` only supports the literal value `true`, and you cannot combine it with `schema`.

Worked example:

```javascript
const metadataSchema = createSchema({
  metadata: {
    type: 'object',
    additionalProperties: true
  }
})
```

Valid input:

```javascript
metadataSchema.patch({
  metadata: {
    theme: 'dark',
    flags: {
      beta: true
    }
  }
})
```

Result:

```javascript
{
  validatedObject: {
    metadata: {
      theme: 'dark',
      flags: {
        beta: true
      }
    }
  },
  errors: {}
}
```

Invalid input:

```javascript
metadataSchema.patch({
  metadata: ['not-an-object']
})
```

Result:

```javascript
{
  validatedObject: {
    metadata: ['not-an-object']
  },
  errors: {
    metadata: {
      field: 'metadata',
      code: 'TYPE_CAST_FAILED',
      message: 'Value could not be cast to the required type.',
      params: {}
    }
  }
}
```

That is the intended contract: object-ness is enforced, but the inner bag is not owned by this library.

#### Dotted path options for nested fields

Because nested errors use dotted paths, the opt-out options do too.

Skip a whole nested field:

```javascript
workspaceViewSchema.patch({
  workspace: {
    slug: 'x'
  }
}, {
  skipFields: ['workspace.slug']
})
```

Skip a specific nested validator:

```javascript
workspaceViewSchema.patch({
  workspace: {
    slug: 'x'
  }
}, {
  skipParams: {
    'workspace.slug': ['minLength']
  }
})
```

This keeps the options model flat and consistent with the error map.

### Path-Scoped Validation for Forms and Interactive UIs

Full-object validation is still the right tool for submit boundaries:

```javascript
const result = userSchema.create(payload)
```

But forms often need something narrower:

* validate one field on blur
* validate a small step in a wizard
* normalize only the field the user just touched
* avoid triggering unrelated sibling errors while the user is still editing

That is what `validateAt()` and `validatePaths()` are for.

#### `validateAt(path, object, options)`

Use `validateAt()` when you want one path.

```javascript
const profileSchema = createSchema({
  name: { type: 'string', required: true, minLength: 3 },
  role: { type: 'string', defaultTo: 'guest' }
})

profileSchema.validateAt('name', {
  name: '  Alex  '
})
```

Result:

```javascript
{
  validatedValue: 'Alex',
  errors: {}
}
```

By default, path validation uses **`patch` semantics**. That means:

* only the selected path is validated
* missing required siblings do not produce errors
* defaults do not apply unless you explicitly choose an operation that applies them

If you want create-style or replace-style behavior for the exact selected path, pass `operation`.

```javascript
profileSchema.validateAt('role', {}, { operation: 'create' })
```

Result:

```javascript
{
  validatedValue: 'guest',
  errors: {}
}
```

If you want required checks for the exact selected field:

```javascript
profileSchema.validateAt('name', {}, { operation: 'create' })
```

Result:

```javascript
{
  validatedValue: undefined,
  errors: {
    name: {
      field: 'name',
      code: 'REQUIRED',
      message: 'Field is required',
      params: {}
    }
  }
}
```

#### Nested path example

This is where path-scoped validation becomes most useful.

```javascript
const workspaceSummarySchema = createSchema({
  id: { type: 'id', required: true },
  slug: { type: 'string', required: true, minLength: 3 },
  ownerUserId: { type: 'id', required: true }
})

const workspaceSchema = createSchema({
  workspace: {
    type: 'object',
    required: true,
    schema: workspaceSummarySchema
  }
})
```

Validate only `workspace.slug`:

```javascript
workspaceSchema.validateAt('workspace.slug', {
  workspace: {
    slug: '  primary  '
  }
}, {
  operation: 'create'
})
```

Result:

```javascript
{
  validatedValue: 'primary',
  errors: {}
}
```

Notice what did **not** happen:

* `workspace.id` was not required
* `workspace.ownerUserId` was not required
* unrelated nested keys were not validated

That is the point of the API. It validates the **selected path**, not the whole object.

If you select the whole object path instead:

```javascript
workspaceSchema.validateAt('workspace', {
  workspace: {
    slug: '  primary  '
  }
}, {
  operation: 'create'
})
```

Result:

```javascript
{
  validatedValue: {
    slug: 'primary'
  },
  errors: {
    'workspace.id': {
      field: 'workspace.id',
      code: 'REQUIRED',
      message: 'Field is required',
      params: {}
    },
    'workspace.ownerUserId': {
      field: 'workspace.ownerUserId',
      code: 'REQUIRED',
      message: 'Field is required',
      params: {}
    }
  }
}
```

That distinction is intentional:

* selecting `workspace.slug` validates one field
* selecting `workspace` validates the whole nested object contract

#### `validatePaths(paths, object, options)`

Use `validatePaths()` when you want a subset of fields or a whole form step.

```javascript
const stepSchema = createSchema({
  workspace: {
    type: 'object',
    schema: workspaceSummarySchema
  },
  status: { type: 'string', defaultTo: 'draft' }
})

stepSchema.validatePaths([
  'workspace.slug',
  'status'
], {
  workspace: {
    slug: '  next  '
  }
}, {
  operation: 'create'
})
```

Result:

```javascript
{
  validatedObject: {
    workspace: {
      slug: 'next'
    },
    status: 'draft'
  },
  errors: {}
}
```

This is useful for:

* wizard-step validation
* validating only dirty fields
* validating a form section before moving on

#### Path options and compatibility

Path-scoped validation supports the same flat nested option model:

```javascript
workspaceSchema.validatePaths([
  'workspace.slug'
], {
  workspace: {
    slug: 'x'
  }
}, {
  operation: 'patch',
  skipParams: {
    'workspace.slug': ['minLength']
  }
})
```

`mode` also works as compatibility sugar for the built-in operations:

```javascript
workspaceSchema.validateAt('workspace.slug', values, { mode: 'patch' })
```

#### Form integration guidance

These APIs are meant to help form adapters, but the library still does **not** become a form framework.

Recommended approach:

* keep raw input state in the UI while the user is typing
* use `validateAt()` or `validatePaths()` to compute errors and normalized values
* apply full normalization on submit with `create()`, `replace()`, or `patch()`

That matters because aggressive normalization during typing can be annoying:

* trimming on every keypress can move the cursor
* number coercion can fight half-finished input such as `12.`
* nested defaults can appear before the user has actually submitted anything

So the intended split is:

* **interactive validation**: `validateAt()` / `validatePaths()`
* **submit boundary validation**: `create()` / `replace()` / `patch()`

### React Hook Form Resolver

If you use React Hook Form, this package now ships a dedicated resolver adapter as a separate subpath export:

```javascript
import { useForm } from 'react-hook-form'
import { createSchema } from 'json-rest-schema'
import { jsonRestSchemaResolver } from 'json-rest-schema/react-hook-form'
```

That import path is intentional. The resolver lives outside the main schema engine so the core library does not become React-specific.

#### Basic usage

```javascript
const profileSchema = createSchema({
  name: { type: 'string', required: true, minLength: 3 },
  role: { type: 'string', defaultTo: 'guest' }
})

const form = useForm({
  resolver: jsonRestSchemaResolver(profileSchema)
})
```

By default, the resolver uses **`create` semantics** for full-form validation.

That means:

* required fields are enforced
* defaults are applied on successful full-form validation
* the resolver itself returns normalized success values for full-form validation

So if the user submits:

```javascript
{
  name: '  Alex  '
}
```

the resolver will hand React Hook Form a successful value object equivalent to:

```javascript
{
  name: 'Alex',
  role: 'guest'
}
```

One real-world nuance matters here: React Hook Form still owns its internal field
state. In practice, that means a successful resolver pass does **not** always mean
your submit handler receives a canonical normalized payload directly from RHF's state.

If you need a final REST-ready payload, run one last schema operation in the submit
handler:

```javascript
const form = useForm({
  resolver: jsonRestSchemaResolver(profileSchema)
})

const onSubmit = rawValues => {
  const { validatedObject, errors } = profileSchema.create(rawValues)
  if (Object.keys(errors).length > 0) return

  saveProfile(validatedObject)
}
```

That split is intentional:

* RHF keeps raw interactive field state
* the schema owns final normalization at the submit boundary
* the UI is free to avoid aggressive value rewriting while the user is typing

#### Edit forms and custom operations

If the form is editing an existing resource, use a different operation explicitly.

For a patch-style form:

```javascript
const form = useForm({
  resolver: jsonRestSchemaResolver(profileSchema, {
    operation: 'patch'
  })
})
```

You can also use any custom operation you have registered on the schema:

```javascript
const form = useForm({
  resolver: jsonRestSchemaResolver(profileSchema, {
    operation: 'upsert'
  })
})
```

#### Field-level re-validation behavior

React Hook Form re-validates one field at a time during user interaction. The resolver uses the core path APIs for that subset validation.

Important behavior:

* only the selected RHF field names are validated during field-level re-validation
* sibling required fields do **not** leak into a single-field re-validation pass
* by default, field-level re-validation keeps **raw form values** instead of forcing normalized values back into the UI while the user is typing

That default matters because aggressive normalization during typing can feel bad:

* trimmed strings can move the cursor
* number coercion can fight half-complete input
* defaults can appear before submit

#### Opting into normalized field-level values

If you explicitly want normalized field values during field-level re-validation, opt in:

```javascript
const form = useForm({
  resolver: jsonRestSchemaResolver(
    profileSchema,
    {},
    { normalizeOnFieldValidation: true }
  )
})
```

This is opt-in on purpose.

#### Returning raw values on success

If you want successful resolver results to return raw input values instead of normalized values, use `raw: true`:

```javascript
const form = useForm({
  resolver: jsonRestSchemaResolver(
    profileSchema,
    {},
    { raw: true }
  )
})
```

That applies to successful full-form validation too, so defaults and casts are not pushed into the returned `values` object.

#### Error shape

React Hook Form requires hierarchical nested errors for deep paths. The resolver converts the library's flat dotted-path errors into the structure RHF expects.

For example, a schema error like:

```javascript
{
  'roles.0.label': {
    field: 'roles.0.label',
    code: 'REQUIRED',
    message: 'Field is required',
    params: {}
  }
}
```

becomes a React Hook Form error shape equivalent to:

```javascript
{
  roles: [
    {
      label: {
        type: 'REQUIRED',
        message: 'Field is required'
      }
    }
  ]
}
```

Direct array-field errors are placed under RHF's `root` key for that field array path.

#### Native browser validation

The resolver also respects React Hook Form's `shouldUseNativeValidation` option. If RHF asks for native validation, the adapter sets `setCustomValidity()` / `reportValidity()` using the schema error messages.

### Vue + Vuetify Adapters

If you use Vue, this package now ships a small adapter layer as two separate subpath exports:

```javascript
import { useSchemaForm, useSchemaField } from 'json-rest-schema/vue'
import { createVuetifyRule, fieldProps, getVuetifyErrorMessages } from 'json-rest-schema/vuetify'
```

That split is intentional.

* `json-rest-schema/vue` handles schema-aware form orchestration
* `json-rest-schema/vuetify` handles Vuetify-friendly `rules` and `error-messages` bridges
* the core schema engine stays framework-agnostic

Just as important: these adapters do **not** import Vue or Vuetify internally.

They work with:

* plain objects
* Vue reactive proxies
* Vue refs such as `ref({ ... })`

That keeps the published package small and avoids turning Vue into a hard dependency of the core runtime.

#### Basic Vue usage

Use `useSchemaForm()` when you already own the form values in Vue state.

```javascript
import { reactive } from 'vue'
import { createSchema } from 'json-rest-schema'
import { useSchemaForm } from 'json-rest-schema/vue'

const profileSchema = createSchema({
  name: { type: 'string', required: true, minLength: 3 },
  role: { type: 'string', defaultTo: 'guest' }
})

const values = reactive({
  name: ''
})

const form = useSchemaForm(profileSchema, {
  values
})
```

If you want Vue to react to adapter-managed error or result updates, pass Vue-owned
containers such as `ref({})`, `reactive({})`, or `ref(null)`:

```javascript
import { reactive, ref } from 'vue'

const values = reactive({
  name: ''
})

const errors = ref({})
const lastResult = ref(null)

const form = useSchemaForm(profileSchema, {
  values,
  errors,
  lastResult
})
```

That keeps reactivity in the Vue app instead of hiding framework state inside the schema library.

Important behavior:

* full-form validation defaults to **`create`** semantics
* `form.validate()` returns the usual `{ validatedObject, errors }`
* `form.errors` stays in the library's flat dotted-path format
* `form.nestedErrors` gives you the nested object/array form if your Vue layer prefers it

Running a full validation:

```javascript
const result = form.validate()
```

If `values` is:

```javascript
{
  name: '  Alex  '
}
```

then `result` will be:

```javascript
{
  validatedObject: {
    name: 'Alex',
    role: 'guest'
  },
  errors: {}
}
```

That is the same contract as the core schema engine. The Vue adapter does not invent a second validation format.

#### Field-level validation in Vue

For blur validation, wizard steps, or one-field re-validation, use the path-aware helpers.

```javascript
const fieldResult = form.validateField('name')
const stepResult = form.validateFields(['name', 'role'])
```

This matters because the adapter validates **only the selected paths**.

That means:

* validating `name` does not suddenly produce `email` or `password` errors
* nested paths such as `workspace.slug` work the same way as they do in the core APIs
* bracket paths such as `roles[0].label` are accepted too

If you want a path-focused helper object, use `useSchemaField()`:

```javascript
const nameField = useSchemaField(form, 'name')
```

It gives you:

* `nameField.value`
* `nameField.error`
* `nameField.hasError`
* `nameField.message`
* `nameField.messages`
* `nameField.validate()`
* `nameField.clearError()`

Example:

```javascript
nameField.validate()
console.log(nameField.messages)
```

#### Submit normalization in Vue

The clean submit path is:

```javascript
const submitProfile = form.submit((validatedObject) => {
  return api.saveProfile(validatedObject)
})
```

`submit()` always validates first.

If validation fails:

* the handler is **not** called
* the returned value is the validation result
* `form.errors` is updated

If validation succeeds:

* the handler receives the normalized `validatedObject`
* defaults and casts are already applied

This keeps the same intended split as the rest of the library:

* raw values while the user is typing
* normalized values at the submit boundary

#### Edit forms and custom operations in Vue

If the form is editing an existing resource, choose a different operation explicitly:

```javascript
const form = useSchemaForm(profileSchema, {
  values,
  operation: 'patch'
})
```

You can also use a custom schema operation:

```javascript
const form = useSchemaForm(profileSchema, {
  values,
  operation: 'upsert'
})
```

The adapter routes everything back through the schema operation registry, so custom operations behave the same way here as they do in the core runtime.

#### Vuetify `rules` integration

Vuetify's `rules` prop is a natural fit for path-scoped validation.

```javascript
const slugRule = createVuetifyRule(form, 'workspace.slug')
```

Then bind it to a component:

```vue
<v-text-field
  v-model="values.workspace.slug"
  :rules="[slugRule]"
/>
```

That rule:

* clones the current form values
* injects the field's current candidate value at the selected path
* runs `validateField(path, ...)`
* returns either `true` or the schema error message

So the rule stays a thin bridge. It does not re-implement validation logic.

#### Vuetify `fieldProps()` helper

If you want a compact helper for Vuetify inputs, use `fieldProps()`:

```javascript
const slugProps = fieldProps(form, 'workspace.slug')
```

Then:

```vue
<v-text-field
  v-model="values.workspace.slug"
  v-bind="slugProps"
/>
```

By default, `fieldProps()` returns only a `rules` array.

That default is deliberate. Vuetify merges `error-messages` with rule-generated messages, so returning both by default would duplicate the same message on screen.

If you explicitly want manual `error-messages` too, opt in:

```javascript
const slugProps = fieldProps(form, 'workspace.slug', {
  includeErrorMessages: true
})
```

That adds:

* `errorMessages`
* `error`

on top of the generated `rules`.

#### Manual Vuetify error messages

If you only want the message bridge without generated rules, use `getVuetifyErrorMessages()` directly:

```javascript
const messages = getVuetifyErrorMessages(form, 'workspace.slug')
```

Then:

```vue
<v-text-field
  v-model="values.workspace.slug"
  :error-messages="getVuetifyErrorMessages(form, 'workspace.slug')"
/>
```

This is useful when:

* you validate on submit instead of on blur/input
* you already ran `form.validate()` or `form.validateField()`
* you want Vuetify to display stored schema errors without re-running rules immediately

#### Worked Vue + Vuetify example

```javascript
import { reactive } from 'vue'
import { createSchema } from 'json-rest-schema'
import { useSchemaForm, useSchemaField } from 'json-rest-schema/vue'
import { fieldProps } from 'json-rest-schema/vuetify'

const workspaceSummarySchema = createSchema({
  id: { type: 'id', required: true },
  slug: { type: 'string', required: true, minLength: 3 },
  ownerUserId: { type: 'id', required: true }
})

const workspaceSchema = createSchema({
  workspace: {
    type: 'object',
    required: true,
    schema: workspaceSummarySchema
  }
})

const values = reactive({
  workspace: {
    slug: ''
  }
})

const form = useSchemaForm(workspaceSchema, {
  values,
  operation: 'patch'
})

const slugField = useSchemaField(form, 'workspace.slug')
const slugProps = fieldProps(form, 'workspace.slug')

const saveWorkspace = form.submit(async (validatedObject) => {
  await api.saveWorkspace(validatedObject)
})
```

```vue
<template>
  <v-form @submit.prevent="saveWorkspace">
    <v-text-field
      v-model="values.workspace.slug"
      label="Workspace slug"
      v-bind="slugProps"
      @blur="slugField.validate()"
    />

    <v-btn type="submit">Save</v-btn>
  </v-form>
</template>
```

That example preserves the intended layering:

* the schema owns normalization and validation
* Vue owns local form state
* Vuetify owns rendering and input UX
* submit handlers own business logic and API calls

### Demo Apps and Browser Smoke Tests

This repo now includes two minimal demo apps documented in `demos/README.md`:

* `demos/react-rhf`
* `demos/vue-vuetify`

They alias package imports back to the local source files in this checkout, so they
always exercise the current repo state instead of a published npm copy.

What each demo proves:

* `demos/react-rhf`: the React Hook Form resolver works in a real browser app, and the submit flow can still perform one final canonical schema pass before handing the payload to your API layer.
* `demos/vue-vuetify`: the Vue and Vuetify adapters work in a real browser app, including visible Vuetify controls, blur validation, and normalized submit output.

To install and run them:

```bash
npm run demo:install
```

Then in separate terminals:

```bash
npm run demo:react
npm run demo:vue
```

Vite will print the local URLs it chose. If the default port is busy, it will pick the next open one automatically.

To run the browser smoke tests:

```bash
npx playwright install chromium
npm run test:demos
```

The Playwright coverage is intentionally small and concrete:

* the React demo validates through the RHF resolver and performs one final canonical schema submit
* the Vue demo validates through the Vue and Vuetify adapters and submits a normalized payload in a real browser runtime

Small troubleshooting notes:

* If a Vuetify control appears blank, make sure you ran the Vue demo's local install step. The demo now declares and imports the Material Design icon font explicitly.
* If Playwright complains about missing browsers, run `npx playwright install chromium` once from the repo root.

### VeeValidate v5 Bridge

VeeValidate v5 accepts Standard Schema-compatible validators as `validationSchema`.

That means `json-rest-schema` does not need a heavy VeeValidate-specific runtime adapter. This package now ships a small bridge that wraps a schema instance in the Standard Schema interface VeeValidate already understands.

Import it like this:

```javascript
import { useForm } from 'vee-validate'
import { createSchema } from 'json-rest-schema'
import { toVeeValidateSchema } from 'json-rest-schema/vee-validate'
```

#### Basic usage

```javascript
const profileSchema = createSchema({
  name: { type: 'string', required: true, minLength: 3 },
  role: { type: 'string', defaultTo: 'guest' }
})

const { handleSubmit, errors, values } = useForm({
  initialValues: {
    name: ''
  },
  validationSchema: toVeeValidateSchema(profileSchema)
})
```

That default bridge uses **`create` semantics**.

So on successful submit:

* required fields are enforced
* normalized values are returned
* defaults are applied to the submitted output

If the user submits:

```javascript
{
  name: '  Alex  '
}
```

then the validated submit payload is equivalent to:

```javascript
{
  name: 'Alex',
  role: 'guest'
}
```

#### Edit forms and custom operations

If the form is editing an existing resource, pass the operation explicitly:

```javascript
const { handleSubmit } = useForm({
  initialValues,
  validationSchema: toVeeValidateSchema(profileSchema, {
    operation: 'patch'
  })
})
```

Custom operations work too:

```javascript
const { handleSubmit } = useForm({
  initialValues,
  validationSchema: toVeeValidateSchema(profileSchema, {
    operation: 'upsert'
  })
})
```

#### Important VeeValidate limitation: defaults do not initialize form state

This is important enough to say clearly:

* the bridge validates and normalizes the schema output
* VeeValidate still expects you to provide your own `initialValues`
* schema defaults do **not** automatically populate the form's starting state

So this is the intended split:

* `initialValues` controls the raw form state
* `toVeeValidateSchema(...)` controls validation and normalized submit output

If you want a default field visible in the UI before submit, put it in `initialValues`.

If you only want the normalized payload to contain the default when the user submits, let the schema apply it.

#### Error paths

The bridge turns the library's flat error map into Standard Schema issues with nested paths.

So an internal error like:

```javascript
{
  'roles.0.label': {
    field: 'roles.0.label',
    code: 'REQUIRED',
    message: 'Field is required',
    params: {}
  }
}
```

becomes Standard Schema issues equivalent to:

```javascript
[
  {
    message: 'Field is required',
    path: ['roles', 0, 'label']
  }
]
```

That is what lets VeeValidate map nested array/object errors back onto the right field state.

#### Worked VeeValidate example

```javascript
import { useForm } from 'vee-validate'
import { createSchema } from 'json-rest-schema'
import { toVeeValidateSchema } from 'json-rest-schema/vee-validate'

const workspaceSummarySchema = createSchema({
  id: { type: 'id', required: true },
  slug: { type: 'string', required: true, minLength: 3 },
  ownerUserId: { type: 'id', required: true }
})

const workspaceSchema = createSchema({
  workspace: {
    type: 'object',
    required: true,
    schema: workspaceSummarySchema
  }
})

const { defineField, handleSubmit, errors } = useForm({
  initialValues: {
    workspace: {
      slug: ''
    }
  },
  validationSchema: toVeeValidateSchema(workspaceSchema, {
    operation: 'patch'
  })
})

const [slug, slugAttrs] = defineField('workspace.slug')

const saveWorkspace = handleSubmit((validatedObject) => {
  return api.saveWorkspace(validatedObject)
})
```

```vue
<template>
  <form @submit.prevent="saveWorkspace">
    <input v-model="slug" v-bind="slugAttrs">
    <span>{{ errors['workspace.slug'] }}</span>
    <button type="submit">Save</button>
  </form>
</template>
```

This keeps the responsibilities clean:

* VeeValidate owns touched/dirty/submit orchestration
* `json-rest-schema` owns validation and normalization
* your submit handler owns business logic

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
const patchTransportSchema = userSchema.toJsonSchema({ operation: 'patch' })
```

Key points:

* **Draft**: exports draft-07 JSON Schema.
* **Operation-aware**: `operation: '<name>'` controls the `required` list and whether `defaultTo` is emitted.
* **Compatibility**: `mode: 'create' | 'replace' | 'patch'` still works as shorthand for the built-in operations.
* **Transport-facing**: the export is intended for JSON/Ajv/Fastify-style request validation, not for reproducing every in-process coercion path.
* **Strict field shape**: `additionalProperties` defaults to `false` because runtime validation rejects unknown fields. Override it with `toJsonSchema({ additionalProperties: true })` if needed.
* **Recursive export**: nested object fields and array items are exported recursively from the same contract definitions. Nested object fields inherit the active operation, while object schemas used as array items are exported in `replace` mode.
* **Opaque bags stay opaque**: `type: 'object'` plus `additionalProperties: true` exports as a permissive object field and does not invent child property rules.
* **Single source of truth**: only rules owned by `json-rest-schema` are exported. External metadata keys from other layers are ignored.
* **Passive metadata preserved**: schema-owned passive metadata such as `precision`, `scale`, `unsigned`, and `temporalPrecision` is preserved under `x-json-rest-schema.metadata`.
* **Custom rules**: if a custom type or validator needs transport export support, attach a `toJsonSchema()` hook to the handler. If you register a custom validator without that hook, export fails loudly instead of silently drifting.

#### Worked recursive export example

```javascript
const schema = createSchema({
  workspace: {
    type: 'object',
    required: true,
    schema: workspaceSummarySchema
  },
  roles: {
    type: 'array',
    items: roleSchema
  },
  metadata: {
    type: 'object',
    additionalProperties: true
  }
})
```

Exporting `schema.toJsonSchema()` gives you:

* `workspace` as a nested object schema with `required` fields inherited from the active operation
* `roles.items` as a nested object schema exported in `replace` mode
* `metadata` as `{ type: 'object', additionalProperties: true }`

That means the transport export stays aligned with runtime semantics:

* nested objects behave like nested contracts
* array object items behave like complete replacements
* opaque bags stay opaque instead of pretending to be structured

---

## Common REST Recipes

This section is intentionally practical. These are the shapes you are likely to define in a real API.

### Recipe: create payload

```javascript
const createUserSchema = createSchema({
  email: { type: 'string', required: true, notEmpty: true, lowercase: true },
  displayName: { type: 'string', required: true, minLength: 2 },
  role: { type: 'string', defaultTo: 'member' },
  marketingOptIn: { type: 'boolean', defaultTo: false }
})
```

Use it like this:

```javascript
const result = createUserSchema.create({
  email: '  ALEX@EXAMPLE.COM  ',
  displayName: '  Alex  '
})
```

Result:

```javascript
{
  validatedObject: {
    email: 'alex@example.com',
    displayName: 'Alex',
    role: 'member',
    marketingOptIn: false
  },
  errors: {}
}
```

Use this pattern when:

* the client is creating a new resource
* missing `required` fields should fail
* omitted defaults should be materialized

### Recipe: patch payload

Use the same schema, but call `patch()`:

```javascript
const result = createUserSchema.patch({
  displayName: '  Updated Name  '
})
```

Result:

```javascript
{
  validatedObject: {
    displayName: 'Updated Name'
  },
  errors: {}
}
```

Use this pattern when:

* the client is updating only a subset of fields
* missing `required` fields should **not** fail just because they were omitted
* defaults should **not** be invented during a patch

### Recipe: nested detail response

This is a common “show one resource” response shape.

```javascript
const userSummarySchema = createSchema({
  id: { type: 'id', required: true },
  email: { type: 'string', required: true }
})

const projectSummarySchema = createSchema({
  id: { type: 'id', required: true },
  slug: { type: 'string', required: true }
})

const projectDetailSchema = createSchema({
  project: {
    type: 'object',
    required: true,
    schema: projectSummarySchema
  },
  owner: {
    type: 'object',
    required: true,
    schema: userSummarySchema
  },
  permissions: {
    type: 'array',
    required: true,
    items: { type: 'string', minLength: 1 }
  }
})
```

Validate it with `create()` or `replace()` depending on your calling style:

```javascript
const result = projectDetailSchema.create({
  project: {
    id: '10',
    slug: '  api-redesign  '
  },
  owner: {
    id: '7',
    email: 'owner@example.com'
  },
  permissions: ['read', 'write']
})
```

Result:

```javascript
{
  validatedObject: {
    project: {
      id: 10,
      slug: 'api-redesign'
    },
    owner: {
      id: 7,
      email: 'owner@example.com'
    },
    permissions: ['read', 'write']
  },
  errors: {}
}
```

### Recipe: list response envelope

This library validates objects, so for list endpoints the usual pattern is an envelope object instead of a top-level array.

```javascript
const workspaceSummarySchema = createSchema({
  id: { type: 'id', required: true },
  slug: { type: 'string', required: true },
  ownerUserId: { type: 'id', required: true }
})

const workspaceListSchema = createSchema({
  items: {
    type: 'array',
    required: true,
    items: workspaceSummarySchema
  },
  total: { type: 'integer', required: true, min: 0 }
})
```

Example:

```javascript
const result = workspaceListSchema.create({
  items: [
    { id: '1', slug: 'alpha', ownerUserId: '7' },
    { id: '2', slug: 'beta', ownerUserId: '9' }
  ],
  total: '2'
})
```

Result:

```javascript
{
  validatedObject: {
    items: [
      { id: 1, slug: 'alpha', ownerUserId: 7 },
      { id: 2, slug: 'beta', ownerUserId: 9 }
    ],
    total: 2
  },
  errors: {}
}
```

### Recipe: settings or metadata bag

When part of the payload belongs to another layer and should not be field-by-field validated here, use an opaque object bag.

```javascript
const updatePreferencesSchema = createSchema({
  userId: { type: 'id', required: true },
  preferences: {
    type: 'object',
    additionalProperties: true
  }
})
```

Example:

```javascript
const result = updatePreferencesSchema.patch({
  preferences: {
    theme: 'dark',
    shortcuts: {
      save: 'cmd+s'
    },
    labs: ['new-sidebar']
  }
})
```

Result:

```javascript
{
  validatedObject: {
    preferences: {
      theme: 'dark',
      shortcuts: {
        save: 'cmd+s'
      },
      labs: ['new-sidebar']
    }
  },
  errors: {}
}
```

Use this only when you intentionally want:

* object-ness to be enforced
* inner keys and values to pass through untouched
* no nested validation contract owned by this library

### Recipe: custom operation for an upsert-like boundary

Sometimes you want “validate the whole shape, apply defaults, but do not require every required field.”

```javascript
const accountSchema = createSchema({
  email: { type: 'string', required: true, lowercase: true },
  role: { type: 'string', defaultTo: 'member' }
}, {
  operations: {
    upsert: {
      targetFields: 'schema',
      enforceRequired: false,
      applyDefaults: true,
      outputFields: 'validated'
    }
  }
})
```

Example:

```javascript
accountSchema.upsert({})
```

Result:

```javascript
{
  validatedObject: {
    role: 'member'
  },
  errors: {}
}
```

This is useful when the persistence layer or surrounding business logic decides whether the resource already exists, and the schema’s job is only to normalize a shared contract.

---

## Built-in Rules Reference

Here is a complete list of all types and validators available out of the box.

### Built-in Types (Casting Rules)

A field's `type` defines how the input value will be converted before any other validation rules are run.

| Type Name | Description |
|---|---|
| `string` | Converts the input to a string. By default, it trims whitespace. Fails if the input is an object or array. |
| `number` | Converts the input to a finite number. Empty strings, whitespace-only strings, and non-finite values fail validation. |
| `integer` | Converts the input to a finite integer. Non-integer numeric values fail validation. |
| `boolean`| Converts the input to a boolean using explicit true/false tokens such as `true`, `false`, `1`, `0`, `yes`, `no`, `on`, and `off`. Unknown values fail validation. |
| `array` | Ensures the value is an array. If the input is not already an array, it will be wrapped in one (e.g., `'tag1'` becomes `['tag1']`). If `items` is present, every item is validated recursively. |
| `id` | Parses the value into a positive safe integer identifier. It rejects non-canonical forms such as leading zeroes or strings with junk suffixes. |
| `date` | Converts a valid date string or timestamp into a `Date` object normalized to midnight UTC for that calendar day. |
| `dateTime`| Converts a valid date string or timestamp into a `Date` object. MySQL-style `YYYY-MM-DD HH:MM:SS` strings are interpreted as UTC. |
| `timestamp`| Converts the input to a number, suitable for storing Unix timestamps. |
| `time` | Converts the input to a normalized `HH:MM:SS` string. |
| `serialize`| Converts any JavaScript value (including objects with circular references) into a single JSON-like string using `flatted`. |
| `object` | Requires a plain object value. With `schema`, it becomes a strict nested object contract. With `additionalProperties: true`, it becomes an opaque pass-through object bag. Without either option, it is simply a validated plain object value with no child-field rules. |
| `blob` | Passes the value through unchanged. Intended for binary data like files that don't need casting. |
| `file` | Converts primitive file-handle-like values to strings and rejects objects or arrays. |
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
| `strictBoolean: true` | Restricts a `boolean` field so the original input must already be a real boolean. |
| `validator: <function>`| Allows you to provide your own **synchronous** custom validation function for complex, one-off logic. |
| `defaultTo: <value>` | If the field is not present in the input object, this value will be used in validation modes that apply defaults. Can be a value or a function that returns a value. |
| `unsigned: true` | Passive schema metadata indicating non-negative numeric storage intent. Preserved in transport export metadata. |
| `precision: <number>` | Passive schema metadata for decimal total digits. Preserved in transport export metadata. |
| `scale: <number>` | Passive schema metadata for decimal fractional digits. Preserved in transport export metadata. |
| `temporalPrecision: <number>` | Passive schema metadata for time or datetime fractional-second precision. Preserved in transport export metadata. |

---

## Extending the Library: Custom Rules

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
* **`mode`**: The active validation contract. Preserved as a compatibility alias for `operation`.
* **`operation`**: The active validation contract name (for example `'create'`, `'patch'`, or a custom operation such as `'upsert'`).
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

### Creating an Isolated Schema Factory

Sometimes you want local custom types or validators without mutating the default `createSchema` factory for the whole application.

Use `createSchemaFactory()` for that:

```javascript
import { createSchemaFactory } from 'json-rest-schema'

const adminSchemaFactory = createSchemaFactory()

adminSchemaFactory.addType('admin-prefix-string', context => {
  return `admin-${context.value}`
})

const adminSchema = adminSchemaFactory({
  name: { type: 'string', required: true },
  internalCode: { type: 'admin-prefix-string' }
})

const { validatedObject } = adminSchema.create({
  name: ' Alice ',
  internalCode: 'ops'
})

// Built-in handlers still work.
console.log(validatedObject.name) // 'Alice'

// Custom handlers stay local to this factory.
console.log(validatedObject.internalCode) // 'admin-ops'
```

`createSchemaFactory()` installs the built-in core handlers by default so it is usable out of the box.

If you really want a completely bare registry, make that explicit:

```javascript
import { createSchemaFactory } from 'json-rest-schema'

const bareFactory = createSchemaFactory({ installCore: false })
```

That mode is useful only when you intentionally want to provide every type and validator yourself.

---

## Advanced: Creating a Plugin

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
import { createSchema } from 'json-rest-schema';
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

## Design Scope

`json-rest-schema` is intentionally **synchronous**. Shared schemas need to run the same way on the client and the server, so this library is scoped to:

* typing and casting
* normalization
* local field validation
* local cross-field validation

It is **not** the place for database-backed uniqueness checks, external API lookups, or any other stateful async business rule. Put those checks in higher layers such as services, repositories, or actions after schema validation has produced a normalized payload.

`json-rest-schema` is also deliberately scoped to runtime validation and transformation. It does not prescribe a specific persistence layer. Treat the schemas you build with this library as the canonical description of your data when you design storage models, migrations, API responses, or documentation.

If you pair the library with a database toolkit (such as Knex), keep the tooling concerns separate: write migrations and models in the tool that best fits your project, then reuse the same field definitions inside `createSchema` so validation, casting, and persistence stay aligned.

> Looking for automation around database schema generation? See `FUTURE_MIGRATION_MODULE.md` for a high-level proposal of an optional companion package.

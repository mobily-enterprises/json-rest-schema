/**
 * @file Absurdly comprehensive tests for the entire schema validation library.
 * This file is aligned with the final version that uses an object map for errors.
 *
 * To Run:
 * 1. Make sure you are in the project root directory.
 * 2. Run the command: `node --test`
 */

import { describe, it } from 'node:test'
import assert from 'node:assert'
import { createSchema, createSchemaFactory, flattenErrors, getError, hasError, nestErrors } from './src/index.js'
import { Schema } from './src/core/Schema.js'
import { jsonRestSchemaResolver } from './src/adapters/react-hook-form.js'
import { toVeeValidateSchema } from './src/adapters/vee-validate.js'
import { useSchemaField, useSchemaForm } from './src/adapters/vue.js'
import { createVuetifyRule, fieldProps, getVuetifyErrorMessages } from './src/adapters/vuetify.js'
import * as flatted from 'flatted'

// Helper for asserting that a specific error exists and has the correct code.
function assertError (errors, fieldName, expectedCode) {
  const errorObject = errors[fieldName]
  assert.ok(errorObject, `Expected an error for field '${fieldName}' but found none.`)
  assert.strictEqual(errorObject.code, expectedCode, `For field '${fieldName}', expected error code '${expectedCode}' but got '${errorObject.code}'.`)
}

function deepFreeze (value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) {
    return value
  }

  seen.add(value)
  for (const key of Reflect.ownKeys(value)) {
    deepFreeze(value[key], seen)
  }

  return Object.freeze(value)
}

function getDefinitionRef (schemaFragment) {
  return schemaFragment?.allOf?.[0]?.$ref || null
}

function resolveReferencedDefinition (transportSchema, schemaFragment) {
  const ref = getDefinitionRef(schemaFragment)
  assert.ok(ref, 'Expected schema fragment to reference a definition.')
  assert.ok(ref.startsWith('#/definitions/'), `Expected a definitions ref but received "${ref}".`)

  const definitionName = ref.slice('#/definitions/'.length)
  const definition = transportSchema.definitions?.[definitionName]
  assert.ok(definition, `Expected definition "${definitionName}" to exist.`)
  return definition
}

describe('1. Core API (`createSchema`)', () => {
  it('should export a function `createSchema`', () => {
    assert.strictEqual(typeof createSchema, 'function')
  })

  it('should export error helper utilities', () => {
    assert.strictEqual(typeof getError, 'function')
    assert.strictEqual(typeof hasError, 'function')
    assert.strictEqual(typeof nestErrors, 'function')
    assert.strictEqual(typeof flattenErrors, 'function')
  })

  it('should export the React Hook Form resolver through the package subpath', async () => {
    const reactHookFormModule = await import('json-rest-schema/react-hook-form')
    assert.strictEqual(reactHookFormModule.jsonRestSchemaResolver, jsonRestSchemaResolver)
  })

  it('should export the Vue helpers through the package subpath', async () => {
    const vueModule = await import('json-rest-schema/vue')
    assert.strictEqual(vueModule.useSchemaForm, useSchemaForm)
    assert.strictEqual(vueModule.useSchemaField, useSchemaField)
  })

  it('should export the Vuetify helpers through the package subpath', async () => {
    const vuetifyModule = await import('json-rest-schema/vuetify')
    assert.strictEqual(vuetifyModule.createVuetifyRule, createVuetifyRule)
    assert.strictEqual(vuetifyModule.fieldProps, fieldProps)
    assert.strictEqual(vuetifyModule.getVuetifyErrorMessages, getVuetifyErrorMessages)
  })

  it('should export the VeeValidate bridge through the package subpath', async () => {
    const veeValidateModule = await import('json-rest-schema/vee-validate')
    assert.strictEqual(veeValidateModule.toVeeValidateSchema, toVeeValidateSchema)
  })

  it('should have `use`, `addType`, and `addValidator` methods on the factory', () => {
    assert.strictEqual(typeof createSchema.use, 'function')
    assert.strictEqual(typeof createSchema.addType, 'function')
    assert.strictEqual(typeof createSchema.addValidator, 'function')
    assert.strictEqual(typeof createSchema.createFactory, 'function')
  })

  it('`createSchema(structure)` should return an instance of Schema', () => {
    const mySchema = createSchema({})
    assert.ok(mySchema instanceof Schema, 'Did not return a Schema instance')
  })

  it('should expose field definition introspection helpers on schema instances', () => {
    const schema = createSchema({
      name: {
        type: 'string',
        required: true,
        messages: {
          required: 'Name is required.',
          default: 'Invalid name.'
        }
      }
    })

    assert.strictEqual(typeof schema.getFieldDefinitions, 'function')
    assert.strictEqual(typeof schema.getFieldDefinition, 'function')
    assert.strictEqual(typeof schema.getFieldMessages, 'function')
    assert.deepStrictEqual(schema.getFieldDefinitions(), {
      name: {
        type: 'string',
        required: true,
        messages: {
          required: 'Name is required.',
          default: 'Invalid name.'
        }
      }
    })
    assert.deepStrictEqual(schema.getFieldDefinition('name'), {
      type: 'string',
      required: true,
      messages: {
        required: 'Name is required.',
        default: 'Invalid name.'
      }
    })
    assert.deepStrictEqual(schema.getFieldMessages('name'), {
      required: 'Name is required.',
      default: 'Invalid name.'
    })
  })

  it('should return detached frozen introspection snapshots that cannot change runtime validation', () => {
    const workspaceSchema = createSchema({
      slug: {
        type: 'string',
        required: true
      }
    })
    const schema = createSchema({
      name: {
        type: 'string',
        required: true,
        messages: {
          required: 'Name is required.'
        }
      },
      workspace: {
        type: 'object',
        schema: workspaceSchema
      }
    })

    const definitions = schema.getFieldDefinitions()
    const nameDefinition = schema.getFieldDefinition('name')

    assert.notStrictEqual(definitions, schema.structure)
    assert.notStrictEqual(definitions.name, schema.structure.name)
    assert.notStrictEqual(definitions.name.messages, schema.structure.name.messages)
    assert.notStrictEqual(definitions.workspace.schema, workspaceSchema)
    assert.ok(definitions.workspace.schema instanceof Schema)
    assert.ok(Object.isFrozen(definitions))
    assert.ok(Object.isFrozen(definitions.name))
    assert.ok(Object.isFrozen(definitions.name.messages))
    assert.ok(Object.isFrozen(definitions.workspace.schema))
    assert.throws(() => {
      definitions.name.required = false
    }, TypeError)
    assert.throws(() => {
      definitions.workspace.schema.structure.slug.required = false
    }, TypeError)
    assert.throws(() => {
      nameDefinition.messages.required = 'Mutated.'
    }, TypeError)

    const createResult = schema.create({})
    const nestedResult = schema.create({ workspace: {} })

    assertError(createResult.errors, 'name', 'REQUIRED')
    assertError(nestedResult.errors, 'name', 'REQUIRED')
    assertError(nestedResult.errors, 'workspace.slug', 'REQUIRED')
  })

  it('should allow adding a type handler and using it', () => {
    createSchema.addType('custom-string', ctx => `custom-${ctx.value}`)
    const schema = createSchema({ name: { type: 'custom-string' } })
    const { validatedObject } = schema.create({ name: 'test' })
    assert.strictEqual(validatedObject.name, 'custom-test')
  })

  it('should keep the global type registry extensible after deep-freezing existing schema instances', () => {
    deepFreeze({
      definition: Object.freeze({
        schema: createSchema({
          name: {
            type: 'string',
            required: true
          }
        }),
        mode: 'patch'
      })
    })

    assert.doesNotThrow(() => {
      createSchema.addType('post-freeze-custom-string', ctx => `post-freeze-${ctx.value}`)
    })

    const schema = createSchema({
      name: {
        type: 'post-freeze-custom-string'
      }
    })
    const { validatedObject } = schema.create({ name: 'test' })
    assert.strictEqual(validatedObject.name, 'post-freeze-test')
  })

  it('should allow adding a validator and using it', () => {
    createSchema.addValidator('must-be-awesome', ctx => {
      if (ctx.value !== 'awesome') {
        ctx.throwParamError('NOT_AWESOME', 'This field must be awesome')
      }
    })
    const schema = createSchema({ framework: { type: 'string', 'must-be-awesome': true } })
    const { errors } = schema.create({ framework: 'good' })
    assertError(errors, 'framework', 'NOT_AWESOME')
  })

  it('should create isolated schema factories that do not leak custom types back to the global factory', () => {
    const localSchemaFactory = createSchema.createFactory()
    localSchemaFactory.addType('scoped-prefix-string', ctx => `scoped-${ctx.value}`)

    const scopedSchema = localSchemaFactory({
      name: {
        type: 'scoped-prefix-string'
      }
    })
    const { validatedObject } = scopedSchema.create({ name: 'test' })
    assert.strictEqual(validatedObject.name, 'scoped-test')

    const globalSchema = createSchema({
      name: {
        type: 'scoped-prefix-string'
      }
    })
    assert.throws(() => {
      globalSchema.create({ name: 'test' })
    }, /No casting function for type: scoped-prefix-string/)
  })

  it('should export createSchemaFactory as a named helper with built-in handlers installed by default', () => {
    const localSchemaFactory = createSchemaFactory()
    const builtInSchema = localSchemaFactory({
      name: {
        type: 'string'
      }
    })
    localSchemaFactory.addType('factory-suffix-string', ctx => `${ctx.value}-factory`)

    const builtInResult = builtInSchema.patch({ name: ' test ' })
    const localSchema = localSchemaFactory({
      name: {
        type: 'factory-suffix-string'
      }
    })
    const { validatedObject } = localSchema.create({ name: 'test' })
    assert.strictEqual(builtInResult.validatedObject.name, 'test')
    assert.strictEqual(validatedObject.name, 'test-factory')
  })

  it('should allow explicitly bare factories via createSchemaFactory({ installCore: false })', () => {
    const bareSchemaFactory = createSchemaFactory({ installCore: false })
    const builtInSchema = bareSchemaFactory({
      name: {
        type: 'string'
      }
    })

    assert.throws(() => {
      builtInSchema.patch({ name: 'test' })
    }, /No casting function for type: string/)

    bareSchemaFactory.addType('bare-prefix-string', ctx => `bare-${ctx.value}`)
    const customSchema = bareSchemaFactory({
      name: {
        type: 'bare-prefix-string'
      }
    })
    const { validatedObject } = customSchema.patch({ name: 'test' })
    assert.strictEqual(validatedObject.name, 'bare-test')
  })

  it('should merge schema registries when creating a factory from multiple schema sources', () => {
    const localSchemaFactory = createSchema.createFactory()
    localSchemaFactory.addType('scoped-upper-string', ctx => String(ctx.value).toUpperCase())

    const globalSchema = createSchema({
      q: {
        type: 'string'
      }
    })
    const localSchema = localSchemaFactory({
      status: {
        type: 'scoped-upper-string'
      }
    })

    const mergedFactory = createSchema.createFactory([globalSchema, localSchema])
    const mergedSchema = mergedFactory({
      q: {
        type: 'string'
      },
      status: {
        type: 'scoped-upper-string'
      }
    })
    const { validatedObject } = mergedSchema.patch({
      q: ' test ',
      status: 'active'
    })

    assert.strictEqual(validatedObject.q, 'test')
    assert.strictEqual(validatedObject.status, 'ACTIVE')
  })

  it('should throw when adding a non-function type handler', () => {
    assert.throws(() => createSchema.addType('badType', 'not-a-function'), /Type handler for 'badType' must be a function/)
  })

  it('should throw when adding a non-function validator handler', () => {
    assert.throws(() => createSchema.addValidator('badValidator', 'not-a-function'), /Validator handler for 'badValidator' must be a function/)
  })

  it('should throw when using a plugin without an `install` method', () => {
    const badPlugin = {}
    assert.throws(() => createSchema.use(badPlugin), /Plugin must have an install method/)
  })

  it('should install built-in and custom operation methods automatically', () => {
    const schema = createSchema({
      name: { type: 'string', required: true },
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

    assert.strictEqual(typeof schema.create, 'function')
    assert.strictEqual(typeof schema.replace, 'function')
    assert.strictEqual(typeof schema.patch, 'function')
    assert.strictEqual(typeof schema.upsert, 'function')

    const aliasResult = schema.upsert({})
    const canonicalResult = schema.validateWith('upsert', {})

    assert.deepStrictEqual(aliasResult, canonicalResult)
    assert.deepStrictEqual(aliasResult, {
      validatedObject: { role: 'guest' },
      errors: {}
    })
  })

  it('should reject reserved names for generated operation methods', () => {
    assert.throws(
      () => createSchema({}, {
        operations: {
          toJsonSchema: {
            targetFields: 'schema',
            enforceRequired: true,
            applyDefaults: true,
            outputFields: 'validated'
          }
        }
      }),
      /Operation name "toJsonSchema" is reserved and cannot be used as a schema method\./
    )
  })

  it('should expose nested field messages through getFieldMessages(path)', () => {
    const workspaceSchema = createSchema({
      slug: {
        type: 'string',
        required: true,
        messages: {
          required: 'Workspace slug is required.'
        }
      }
    })
    const schema = createSchema({
      workspace: {
        type: 'object',
        required: true,
        schema: workspaceSchema
      },
      roles: {
        type: 'array',
        items: createSchema({
          label: {
            type: 'string',
            required: true,
            messages: {
              required: 'Role label is required.'
            }
          }
        })
      }
    })

    assert.deepStrictEqual(schema.getFieldMessages('workspace.slug'), {
      required: 'Workspace slug is required.'
    })
    assert.deepStrictEqual(schema.getFieldMessages('roles.0.label'), {
      required: 'Role label is required.'
    })
    assert.deepStrictEqual(schema.getFieldMessages('roles.0.unknown'), {})
  })
})

describe('2. Core Validation Logic (`Schema.js`)', () => {
  it('should return no errors for a valid object', () => {
    const schema = createSchema({ name: { type: 'string' } })
    const { errors } = schema.create({ name: 'test' })
    assert.strictEqual(Object.keys(errors).length, 0)
  })

  it('should return a `FIELD_NOT_ALLOWED` error for spurious fields', () => {
    const schema = createSchema({ name: { type: 'string' } })
    const { errors } = schema.create({ name: 'test', extra: 'field' })
    assert.strictEqual(Object.keys(errors).length, 1)
    assertError(errors, 'extra', 'FIELD_NOT_ALLOWED')
  })

  it('should correctly handle the `required` validator', () => {
    const schema = createSchema({ name: { type: 'string', required: true } })
    const { errors } = schema.create({})
    assert.strictEqual(Object.keys(errors).length, 1)
    assertError(errors, 'name', 'REQUIRED')
  })

  it('should return a `NOT_NULLABLE` error if a field is null but not allowed to be', () => {
    const schema = createSchema({ name: { type: 'string' } })
    const { errors } = schema.create({ name: null })
    assertError(errors, 'name', 'NOT_NULLABLE')
  })

  it('should allow null if `nullable` is true', () => {
    const schema = createSchema({ name: { type: 'string', nullable: true } })
    const { errors, validatedObject } = schema.create({ name: null })
    assert.strictEqual(Object.keys(errors).length, 0)
    assert.strictEqual(validatedObject.name, null)
  })

  it('should cast empty string to null if `nullOnEmpty` is true', () => {
    const schema = createSchema({ name: { type: 'string', nullOnEmpty: true } })
    const { errors, validatedObject } = schema.create({ name: '' })
    assert.strictEqual(Object.keys(errors).length, 0)
    assert.strictEqual(validatedObject.name, null)
  })

  it('should apply defaultTo values even when the object has validation errors', () => {
    const schema = createSchema({
      name: { type: 'string', required: true },
      role: { type: 'string', defaultTo: 'user' },
    })

    // Case 1: Invalid object (missing required field), defaultTo should still be applied.
    const { validatedObject: invalidObj, errors } = schema.create({})
    assert.strictEqual(Object.keys(errors).length, 1)
    assert.strictEqual(invalidObj.role, 'user', 'defaultTo should be applied even to invalid objects')
    assert.strictEqual(Object.hasOwn(invalidObj, 'name'), false, 'Missing required field should remain omitted in create-mode validation')

    // Case 2: Valid object, defaultTo should also be applied.
    const { validatedObject: validObj, errors: validErrors } = schema.create({ name: 'test' })
    assert.strictEqual(Object.keys(validErrors).length, 0)
    assert.strictEqual(validObj.role, 'user')
  })

  describe('Validation Options', () => {
    const schema = createSchema({
      name: { type: 'string', required: true, minLength: 3 },
      role: { type: 'string', defaultTo: 'guest' }
    })

    it('`skipFields`: should completely ignore specified fields', () => {
      const { errors } = schema.create({ name: 'a' }, { skipFields: ['name'] })
      assert.strictEqual(Object.keys(errors).length, 0)
    })

    it('`skipParams`: should skip specific validators on a field', () => {
      // name: 'a' would fail `minLength: 3`, but we skip it
      const { errors } = schema.create({ name: 'a' }, { skipParams: { name: ['minLength'] } })
      assert.strictEqual(Object.keys(errors).length, 0)
    })
  })

  describe('Operation Contracts', () => {
    const schema = createSchema({
      name: { type: 'string', required: true },
      role: { type: 'string', defaultTo: 'guest' },
      bio: { type: 'string', nullable: true }
    })

    it('`create()` should enforce required fields, apply defaults, and omit untouched optional fields', () => {
      const { validatedObject, errors } = schema.create({ name: '  Alex  ' })
      assert.strictEqual(Object.keys(errors).length, 0)
      assert.deepStrictEqual(validatedObject, {
        name: 'Alex',
        role: 'guest'
      })
    })

    it('`replace()` should enforce required fields and preserve omitted optional fields', () => {
      const { validatedObject, errors } = schema.replace({ name: '  Alex  ' })
      assert.strictEqual(Object.keys(errors).length, 0)
      assert.deepStrictEqual(validatedObject, {
        name: 'Alex',
        role: 'guest'
      })
    })

    it('`patch()` should only validate and return explicitly provided fields', () => {
      const { validatedObject, errors } = schema.patch({ name: '  Alex  ' })
      assert.strictEqual(Object.keys(errors).length, 0)
      assert.deepStrictEqual(validatedObject, {
        name: 'Alex'
      })
    })

    it('`patch()` should not enforce missing required fields when they are absent', () => {
      const { validatedObject, errors } = schema.patch({ bio: null })
      assert.strictEqual(Object.keys(errors).length, 0)
      assert.deepStrictEqual(validatedObject, {
        bio: null
      })
    })

    it('operation methods should reject removed validation options instead of aliasing old behavior', () => {
      assert.throws(
        () => schema.create({ role: 'admin' }, { onlyObjectValues: true }),
        /Unsupported validation option `onlyObjectValues`/
      )

      assert.throws(
        () => schema.create({ role: 'admin' }, { mode: 'patch' }),
        /Unsupported validation option `mode`/
      )
    })

    it('operation contracts should reject explicitly undefined fields instead of silently treating them as absent', () => {
      const { errors } = schema.patch({ name: undefined })
      assertError(errors, 'name', 'TYPE_CAST_FAILED')
    })

    it('built-in operations should be overrideable via the operation registry', () => {
      const customSchema = createSchema({
        name: { type: 'string', required: true },
        role: { type: 'string', defaultTo: 'guest' }
      }, {
        operations: {
          create: {
            targetFields: 'schema',
            enforceRequired: false,
            applyDefaults: true,
            outputFields: 'validated'
          }
        }
      })

      const { validatedObject, errors } = customSchema.create({})
      assert.deepStrictEqual(errors, {})
      assert.deepStrictEqual(validatedObject, {
        role: 'guest'
      })
    })

    it('validateWith should reject unknown operation names', () => {
      assert.throws(
        () => schema.validateWith('publish', {}),
        /Unknown operation "publish"\./
      )
    })
  })

  describe('Nested Contracts', () => {
    const workspaceSummarySchema = createSchema({
      id: { type: 'id', required: true },
      slug: { type: 'string', required: true, minLength: 3 },
      ownerUserId: { type: 'id', required: true }
    })

    const workspaceSettingsSchema = createSchema({
      invitesEnabled: { type: 'boolean', required: true }
    })

    const roleSchema = createSchema({
      id: { type: 'string', required: true },
      label: { type: 'string', required: true, minLength: 2 }
    })

    it('should validate nested object fields recursively and prefix child error paths', () => {
      const schema = createSchema({
        workspace: { type: 'object', required: true, schema: workspaceSummarySchema },
        settings: { type: 'object', required: true, schema: workspaceSettingsSchema }
      })

      const { validatedObject, errors } = schema.create({
        workspace: {
          id: '42',
          slug: '  main-workspace  ',
          extra: true
        },
        settings: {}
      })

      assert.strictEqual(validatedObject.workspace.id, 42)
      assert.strictEqual(validatedObject.workspace.slug, 'main-workspace')
      assert.deepStrictEqual(validatedObject.settings, {})

      assertError(errors, 'workspace.ownerUserId', 'REQUIRED')
      assertError(errors, 'workspace.extra', 'FIELD_NOT_ALLOWED')
      assertError(errors, 'settings.invitesEnabled', 'REQUIRED')
    })

    it('should inherit patch semantics inside nested object fields', () => {
      const schema = createSchema({
        workspace: { type: 'object', required: true, schema: workspaceSummarySchema }
      })

      const { validatedObject, errors } = schema.patch({
        workspace: {
          slug: '  next  '
        }
      })

      assert.deepStrictEqual(errors, {})
      assert.deepStrictEqual(validatedObject, {
        workspace: {
          slug: 'next'
        }
      })
    })

    it('should inherit custom operation descriptors inside nested object fields even when the child schema does not declare that operation', () => {
      const schema = createSchema({
        workspace: { type: 'object', required: true, schema: workspaceSummarySchema },
        status: { type: 'string', defaultTo: 'draft' }
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

      const { validatedObject, errors } = schema.upsert({
        workspace: {
          slug: '  sandbox  '
        }
      })

      assert.deepStrictEqual(errors, {})
      assert.deepStrictEqual(validatedObject, {
        workspace: {
          slug: 'sandbox'
        },
        status: 'draft'
      })
    })

    it('should validate array items with nested object schemas using replace semantics', () => {
      const schema = createSchema({
        roles: { type: 'array', required: true, items: roleSchema }
      })

      const { validatedObject, errors } = schema.patch({
        roles: [
          { id: 'admin' },
          { id: 'editor', label: '  Editor  ' }
        ]
      })

      assert.deepStrictEqual(validatedObject, {
        roles: [
          { id: 'admin' },
          { id: 'editor', label: 'Editor' }
        ]
      })

      assertError(errors, 'roles.0.label', 'REQUIRED')
    })

    it('should validate self-recursive array item schemas at runtime', () => {
      const nodeSchema = createSchema({
        id: { type: 'string', required: true, minLength: 1 },
        children: { type: 'array', required: false }
      })

      nodeSchema.structure.children.items = nodeSchema

      const { validatedObject, errors } = nodeSchema.create({
        id: 'root',
        children: [
          {
            id: 'child',
            children: [
              {}
            ]
          }
        ]
      })

      assert.deepStrictEqual(validatedObject, {
        id: 'root',
        children: [
          {
            id: 'child',
            children: [
              {}
            ]
          }
        ]
      })

      assertError(errors, 'children.0.children.0.id', 'REQUIRED')
    })

    it('should validate primitive array items recursively and keep stable item paths', () => {
      const schema = createSchema({
        assignableRoleIds: {
          type: 'array',
          required: true,
          items: { type: 'string', minLength: 1 }
        }
      })

      const { validatedObject, errors } = schema.create({
        assignableRoleIds: ['  owner  ', '   ', 123]
      })

      assert.deepStrictEqual(validatedObject, {
        assignableRoleIds: ['owner', '', '123']
      })

      assertError(errors, 'assignableRoleIds.1', 'MIN_LENGTH')
    })

    it('should support skipping nested fields and nested validator params by dotted paths', () => {
      const schema = createSchema({
        workspace: { type: 'object', required: true, schema: workspaceSummarySchema }
      })

      const skippedFieldResult = schema.patch({
        workspace: {
          slug: 'x'
        }
      }, {
        skipFields: ['workspace.slug']
      })

      assert.deepStrictEqual(skippedFieldResult.errors, {})
      assert.deepStrictEqual(skippedFieldResult.validatedObject, {
        workspace: {
          slug: 'x'
        }
      })

      const skippedParamResult = schema.patch({
        workspace: {
          slug: 'x'
        }
      }, {
        skipParams: {
          'workspace.slug': ['minLength']
        }
      })

      assert.deepStrictEqual(skippedParamResult.errors, {})
      assert.deepStrictEqual(skippedParamResult.validatedObject, {
        workspace: {
          slug: 'x'
        }
      })
    })

    it('should resolve nested field definitions by dotted paths', () => {
      const schema = createSchema({
        workspace: { type: 'object', required: true, schema: workspaceSummarySchema },
        roles: { type: 'array', required: true, items: roleSchema },
        assignableRoleIds: {
          type: 'array',
          required: true,
          items: { type: 'string', minLength: 1 }
        }
      })

      assert.deepStrictEqual(schema.getFieldDefinition('workspace.slug'), {
        type: 'string',
        required: true,
        minLength: 3
      })
      assert.deepStrictEqual(schema.getFieldDefinition('roles.0.label'), {
        type: 'string',
        required: true,
        minLength: 2
      })
      assert.deepStrictEqual(schema.getFieldDefinition('assignableRoleIds.0'), {
        type: 'string',
        minLength: 1
      })
      assert.strictEqual(schema.getFieldDefinition('workspace.unknown'), null)
    })

    it('should preserve opaque object bags unchanged while still enforcing object type checks', () => {
      const schema = createSchema({
        metadata: { type: 'object', additionalProperties: true }
      })

      const input = {
        metadata: {
          theme: 'dark',
          flags: {
            beta: true
          }
        }
      }

      const { validatedObject, errors } = schema.patch(input)
      assert.deepStrictEqual(errors, {})
      assert.deepStrictEqual(validatedObject, input)

      const invalid = schema.patch({ metadata: ['not-an-object'] })
      assertError(invalid.errors, 'metadata', 'TYPE_CAST_FAILED')
    })

    it('should validate typed object maps entry-by-entry while preserving dynamic keys', () => {
      const schema = createSchema({
        fieldErrors: {
          type: 'object',
          values: {
            type: 'string',
            minLength: 2
          }
        }
      })

      const input = {
        fieldErrors: {
          name: '  ok  ',
          email: 'ab'
        }
      }

      const { validatedObject, errors } = schema.patch(input)
      assert.deepStrictEqual(errors, {})
      assert.deepStrictEqual(validatedObject, {
        fieldErrors: {
          name: 'ok',
          email: 'ab'
        }
      })

      const invalid = schema.patch({
        fieldErrors: {
          name: 'x'
        }
      })

      assertError(invalid.errors, 'fieldErrors.name', 'MIN_LENGTH')
    })

    it('should validate known nested fields while preserving passthrough object properties', () => {
      const detailsSchema = createSchema({
        message: { type: 'string', required: true, minLength: 2 },
        fieldErrors: {
          type: 'object',
          values: {
            type: 'string',
            minLength: 1
          },
          required: false
        }
      })

      const schema = createSchema({
        details: {
          type: 'object',
          schema: detailsSchema,
          additionalProperties: true
        }
      })

      const createResult = schema.create({
        details: {
          message: '  hello  ',
          traceId: 'req-1',
          fieldErrors: {
            name: '  Name is required.  '
          }
        }
      })

      assert.deepStrictEqual(createResult.errors, {})
      assert.deepStrictEqual(createResult.validatedObject, {
        details: {
          message: 'hello',
          traceId: 'req-1',
          fieldErrors: {
            name: 'Name is required.'
          }
        }
      })

      const missingRequired = schema.create({
        details: {
          traceId: 'req-2'
        }
      })

      assertError(missingRequired.errors, 'details.message', 'REQUIRED')
    })

    it('should fail clearly for unsupported nested definition combinations', () => {
      const schemaWithInvalidObject = createSchema({
        metadata: {
          type: 'object',
          schema: createSchema({ value: { type: 'string' } }),
          values: { type: 'string' }
        }
      })

      assert.throws(
        () => schemaWithInvalidObject.create({ metadata: {} }),
        /Object field "metadata" cannot define both schema and values\./
      )

      const schemaWithInvalidValues = createSchema({
        metadata: {
          type: 'object',
          values: { type: 'string' },
          additionalProperties: true
        }
      })

      assert.throws(
        () => schemaWithInvalidValues.create({ metadata: {} }),
        /Object field "metadata" cannot define both values and additionalProperties: true\./
      )

      const schemaWithInvalidItems = createSchema({
        roles: {
          type: 'array',
          items: true
        }
      })

      assert.throws(
        () => schemaWithInvalidItems.create({ roles: [] }),
        /Array field "roles" must define items as either a Schema instance or a field definition object\./
      )
    })
  })

  describe('Path-Scoped Validation', () => {
    const workspaceSummarySchema = createSchema({
      id: { type: 'id', required: true },
      slug: { type: 'string', required: true, minLength: 3 },
      ownerUserId: { type: 'id', required: true }
    })

    const roleSchema = createSchema({
      id: { type: 'string', required: true },
      label: { type: 'string', required: true, minLength: 2 }
    })

    it('validateAt should default to patch semantics and return only the requested normalized value', () => {
      const schema = createSchema({
        name: { type: 'string', required: true, minLength: 3 }
      })

      const result = schema.validateAt('name', { name: '  Alex  ' })

      assert.deepStrictEqual(result, {
        validatedValue: 'Alex',
        errors: {}
      })
    })

    it('validateAt should enforce exact-path required rules when an operation is provided', () => {
      const schema = createSchema({
        name: { type: 'string', required: true }
      })

      const result = schema.validateAt('name', {}, { operation: 'create' })

      assert.strictEqual(result.validatedValue, undefined)
      assertError(result.errors, 'name', 'REQUIRED')
    })

    it('validateAt should apply defaults for exact selected fields when the chosen operation applies defaults', () => {
      const schema = createSchema({
        role: { type: 'string', defaultTo: 'guest' }
      })

      const result = schema.validateAt('role', {}, { operation: 'create' })

      assert.deepStrictEqual(result, {
        validatedValue: 'guest',
        errors: {}
      })
    })

    it('validateAt should validate only the selected nested path without leaking sibling required rules', () => {
      const schema = createSchema({
        workspace: { type: 'object', required: true, schema: workspaceSummarySchema }
      })

      const result = schema.validateAt('workspace.slug', {
        workspace: {
          slug: '  primary  '
        }
      }, {
        operation: 'create'
      })

      assert.deepStrictEqual(result, {
        validatedValue: 'primary',
        errors: {}
      })
    })

    it('validateAt should not emit parent required errors when only a descendant path is selected', () => {
      const schema = createSchema({
        workspace: { type: 'object', required: true, schema: workspaceSummarySchema }
      })

      const result = schema.validateAt('workspace.slug', {}, { operation: 'create' })

      assert.strictEqual(result.validatedValue, undefined)
      assert.deepStrictEqual(result.errors, {})
    })

    it('validateAt should report parent container type errors when a descendant path cannot be traversed', () => {
      const schema = createSchema({
        workspace: { type: 'object', schema: workspaceSummarySchema }
      })

      const result = schema.validateAt('workspace.slug', {
        workspace: 'not-an-object'
      })

      assert.strictEqual(result.validatedValue, undefined)
      assertError(result.errors, 'workspace', 'TYPE_CAST_FAILED')
    })

    it('validateAt should support exact nested object paths and reuse full nested validation semantics', () => {
      const schema = createSchema({
        workspace: { type: 'object', schema: workspaceSummarySchema }
      })

      const result = schema.validateAt('workspace', {
        workspace: {
          slug: '  main  '
        }
      }, {
        operation: 'create'
      })

      assert.deepStrictEqual(result.validatedValue, {
        slug: 'main'
      })
      assertError(result.errors, 'workspace.id', 'REQUIRED')
      assertError(result.errors, 'workspace.ownerUserId', 'REQUIRED')
    })

    it('validateAt should validate array item descendant paths without leaking sibling item required rules', () => {
      const schema = createSchema({
        roles: { type: 'array', required: true, items: roleSchema }
      })

      const result = schema.validateAt('roles.0.label', {
        roles: [
          { label: '  Editor  ' }
        ]
      }, {
        operation: 'create'
      })

      assert.deepStrictEqual(result, {
        validatedValue: 'Editor',
        errors: {}
      })
    })

    it('validatePaths should return only the selected validated subset', () => {
      const schema = createSchema({
        workspace: { type: 'object', schema: workspaceSummarySchema },
        status: { type: 'string', defaultTo: 'draft' }
      })

      const result = schema.validatePaths([
        'workspace.slug',
        'status'
      ], {
        workspace: {
          slug: '  next  ',
          ownerUserId: '42'
        }
      }, {
        operation: 'create'
      })

      assert.deepStrictEqual(result, {
        validatedObject: {
          workspace: {
            slug: 'next'
          },
          status: 'draft'
        },
        errors: {}
      })
    })

    it('validatePaths should support dotted skipParams on selected paths', () => {
      const schema = createSchema({
        workspace: { type: 'object', schema: workspaceSummarySchema }
      })

      const result = schema.validatePaths([
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

      assert.deepStrictEqual(result, {
        validatedObject: {
          workspace: {
            slug: 'x'
          }
        },
        errors: {}
      })
    })

    it('validatePaths should honor custom operations on the selected subset', () => {
      const schema = createSchema({
        name: { type: 'string', required: true },
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

      const result = schema.validatePaths(['role'], {}, { operation: 'upsert' })

      assert.deepStrictEqual(result, {
        validatedObject: {
          role: 'guest'
        },
        errors: {}
      })
    })

    it('validateAt should allow mode as compatibility sugar for built-in operations', () => {
      const schema = createSchema({
        role: { type: 'string', defaultTo: 'guest' }
      })

      assert.deepStrictEqual(
        schema.validateAt('role', {}, { mode: 'create' }),
        schema.validateAt('role', {}, { operation: 'create' })
      )
    })

    it('validateAt should reject mismatched operation and mode options', () => {
      const schema = createSchema({
        name: { type: 'string' }
      })

      assert.throws(
        () => schema.validateAt('name', {}, { operation: 'create', mode: 'patch' }),
        /Path validation options `operation` and `mode` must match when both are provided\./
      )
    })

    it('validateAt should reject invalid schema paths clearly', () => {
      const schema = createSchema({
        workspace: { type: 'object', schema: workspaceSummarySchema }
      })

      assert.throws(
        () => schema.validateAt('workspace.owner.slug', { workspace: {} }),
        /Unknown schema path "owner"\./
      )
    })

    it('validateAt should reject nested selection inside opaque objects', () => {
      const schema = createSchema({
        metadata: { type: 'object', additionalProperties: true }
      })

      assert.throws(
        () => schema.validateAt('metadata.theme', { metadata: { theme: 'dark' } }),
        /Schema path "metadata" does not support nested field selection\./
      )
    })

    it('validateAt should reject non-numeric array path segments', () => {
      const schema = createSchema({
        roles: { type: 'array', items: roleSchema }
      })

      assert.throws(
        () => schema.validateAt('roles.first.label', { roles: [] }),
        /Schema path "roles.first" is invalid because array segments must use numeric indexes\./
      )
    })

    it('validateAt and validatePaths should reject non-object root inputs', () => {
      const schema = createSchema({
        name: { type: 'string' }
      })

      assert.throws(
        () => schema.validateAt('name', null),
        /validateAt\(\) expects a plain object input\./
      )

      assert.throws(
        () => schema.validatePaths(['name'], []),
        /validatePaths\(\) expects a plain object input\./
      )
    })
  })

  it('`cleanup` method should work correctly', () => {
    const schema = createSchema({
      secret: { type: 'string', isSecret: true },
      public: { type: 'string' }
    })
    const obj = { secret: '123', public: 'abc' }
    const cleaned = schema.cleanup(obj, 'isSecret')
    assert.deepStrictEqual(cleaned, { secret: '123' })
  })
})

describe('2.25. Error Helper Utilities', () => {
  const sampleErrors = {
    name: {
      field: 'name',
      code: 'REQUIRED',
      message: 'Field is required',
      params: {}
    },
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

  it('getError should read a flat dotted-path error directly', () => {
    assert.strictEqual(getError(sampleErrors, 'workspace.slug'), sampleErrors['workspace.slug'])
    assert.strictEqual(getError(sampleErrors, 'workspace.id'), undefined)
  })

  it('hasError should report whether a path is present in the flat error map', () => {
    assert.strictEqual(hasError(sampleErrors, 'name'), true)
    assert.strictEqual(hasError(sampleErrors, 'workspace.id'), false)
  })

  it('helpers should tolerate missing error maps gracefully', () => {
    assert.strictEqual(getError(null, 'name'), undefined)
    assert.strictEqual(hasError(undefined, 'name'), false)
    assert.deepStrictEqual(nestErrors(null), {})
    assert.deepStrictEqual(flattenErrors(null), {})
  })

  it('nestErrors should convert flat object and array paths into nested structures', () => {
    const expectedRoles = []
    expectedRoles[2] = {
      label: sampleErrors['roles.2.label']
    }

    assert.deepStrictEqual(nestErrors(sampleErrors), {
      name: sampleErrors.name,
      workspace: {
        slug: sampleErrors['workspace.slug']
      },
      roles: expectedRoles
    })
  })

  it('helpers should reject invalid dotted paths clearly', () => {
    assert.throws(
      () => getError(sampleErrors, ''),
      /getError\(\) expects a non-empty dotted path string\./
    )

    assert.throws(
      () => hasError(sampleErrors, 'workspace..slug'),
      /getError\(\) received an invalid path "workspace\.\.slug"\./
    )

    assert.throws(
      () => nestErrors({
        'workspace..slug': sampleErrors['workspace.slug']
      }),
      /nestErrors\(\) received an invalid path "workspace\.\.slug"\./
    )
  })

  it('nestErrors should reject conflicting leaf and descendant paths clearly', () => {
    assert.throws(
      () => nestErrors({
        workspace: {
          field: 'workspace',
          code: 'TYPE_CAST_FAILED',
          message: 'Value could not be cast to the required type.',
          params: {}
        },
        'workspace.slug': sampleErrors['workspace.slug']
      }),
      /nestErrors\(\) cannot nest conflicting path "workspace\.slug"\./
    )
  })

  it('flattenErrors should convert nested objects and arrays back into a flat dotted-path map', () => {
    const nestedErrors = {
      name: sampleErrors.name,
      workspace: {
        slug: sampleErrors['workspace.slug']
      },
      roles: []
    }

    nestedErrors.roles[2] = {
      label: sampleErrors['roles.2.label']
    }

    assert.deepStrictEqual(flattenErrors(nestedErrors), sampleErrors)
  })

  it('flattenErrors should round-trip with nestErrors for valid nested shapes', () => {
    assert.deepStrictEqual(
      flattenErrors(nestErrors(sampleErrors)),
      sampleErrors
    )
  })

  it('flattenErrors should reject malformed nested leaves clearly', () => {
    assert.throws(
      () => flattenErrors({
        workspace: {
          slug: 'bad-leaf'
        }
      }),
      /flattenErrors\(\) found an invalid nested error value at "workspace\.slug"\./
    )

    assert.throws(
      () => flattenErrors({
        field: 'workspace.slug',
        code: 'MIN_LENGTH',
        message: 'Length must be at least 3 characters.',
        params: { min: 3, actual: 1 }
      }),
      /flattenErrors\(\) cannot flatten a root-level error object without a path\./
    )
  })
})

describe('2.35. React Hook Form Resolver', () => {
  function createMockRef () {
    return {
      customValidity: '',
      reportValidityCalls: 0,
      setCustomValidity (message) {
        this.customValidity = message
      },
      reportValidity () {
        this.reportValidityCalls += 1
      }
    }
  }

  it('should return fully normalized create values on successful full-form validation', () => {
    const schema = createSchema({
      name: { type: 'string', required: true },
      role: { type: 'string', defaultTo: 'guest' }
    })

    const resolver = jsonRestSchemaResolver(schema)
    const result = resolver(
      { name: '  Alex  ' },
      undefined,
      {
        criteriaMode: 'firstError',
        fields: {
          name: { ref: null }
        },
        shouldUseNativeValidation: false
      }
    )

    assert.deepStrictEqual(result, {
      values: {
        name: 'Alex',
        role: 'guest'
      },
      errors: {}
    })
  })

  it('should return raw input values on success when raw mode is enabled', () => {
    const schema = createSchema({
      name: { type: 'string', required: true },
      role: { type: 'string', defaultTo: 'guest' }
    })

    const input = { name: '  Alex  ' }
    const resolver = jsonRestSchemaResolver(schema, {}, { raw: true })
    const result = resolver(
      input,
      undefined,
      {
        criteriaMode: 'firstError',
        fields: {
          name: { ref: null }
        },
        shouldUseNativeValidation: false
      }
    )

    assert.deepStrictEqual(result, {
      values: { name: '  Alex  ' },
      errors: {}
    })
    assert.notStrictEqual(result.values, input)
  })

  it('should keep raw values during field-level re-validation by default', () => {
    const workspaceSummarySchema = createSchema({
      id: { type: 'id', required: true },
      slug: { type: 'string', required: true, minLength: 3 },
      ownerUserId: { type: 'id', required: true }
    })

    const schema = createSchema({
      workspace: { type: 'object', required: true, schema: workspaceSummarySchema }
    })

    const resolver = jsonRestSchemaResolver(schema)
    const input = {
      workspace: {
        slug: '  main  '
      }
    }

    const result = resolver(
      input,
      undefined,
      {
        criteriaMode: 'firstError',
        names: ['workspace.slug'],
        fields: {
          'workspace.slug': { ref: null },
          'workspace.id': { ref: null },
          'workspace.ownerUserId': { ref: null }
        },
        shouldUseNativeValidation: false
      }
    )

    assert.deepStrictEqual(result, {
      values: {
        workspace: {
          slug: '  main  '
        }
      },
      errors: {}
    })
    assert.notStrictEqual(result.values, input)
  })

  it('should allow normalized field-level success values when explicitly requested', () => {
    const workspaceSummarySchema = createSchema({
      id: { type: 'id', required: true },
      slug: { type: 'string', required: true, minLength: 3 },
      ownerUserId: { type: 'id', required: true }
    })

    const schema = createSchema({
      workspace: { type: 'object', required: true, schema: workspaceSummarySchema }
    })

    const resolver = jsonRestSchemaResolver(schema, {}, { normalizeOnFieldValidation: true })
    const result = resolver(
      {
        workspace: {
          slug: '  main  '
        }
      },
      undefined,
      {
        criteriaMode: 'firstError',
        names: ['workspace.slug'],
        fields: {
          'workspace.slug': { ref: null },
          'workspace.id': { ref: null },
          'workspace.ownerUserId': { ref: null }
        },
        shouldUseNativeValidation: false
      }
    )

    assert.deepStrictEqual(result, {
      values: {
        workspace: {
          slug: 'main'
        }
      },
      errors: {}
    })
  })

  it('should map nested array item errors into hierarchical React Hook Form errors', () => {
    const roleSchema = createSchema({
      id: { type: 'string', required: true },
      label: { type: 'string', required: true, minLength: 2 }
    })

    const schema = createSchema({
      roles: { type: 'array', items: roleSchema }
    })

    const labelRef = createMockRef()
    const resolver = jsonRestSchemaResolver(schema)
    const result = resolver(
      {
        roles: [
          { id: 'admin' }
        ]
      },
      undefined,
      {
        criteriaMode: 'firstError',
        fields: {
          'roles.0.id': { ref: createMockRef() },
          'roles.0.label': { ref: labelRef }
        },
        shouldUseNativeValidation: false
      }
    )

    assert.deepStrictEqual(result.values, {})
    assert.strictEqual(result.errors.roles[0].label.type, 'REQUIRED')
    assert.strictEqual(result.errors.roles[0].label.message, 'Field is required')
    assert.strictEqual(result.errors.roles[0].label.ref, labelRef)
  })

  it('should place direct array-field errors under the React Hook Form root key', () => {
    const schema = createSchema({
      roles: {
        type: 'array',
        validator: value => Array.isArray(value) && value.length > 0 ? undefined : 'Pick at least one role.'
      }
    })

    const resolver = jsonRestSchemaResolver(schema)
    const result = resolver(
      {
        roles: []
      },
      undefined,
      {
        criteriaMode: 'firstError',
        names: ['roles.0.label'],
        fields: {
          'roles.0.label': { ref: createMockRef() }
        },
        shouldUseNativeValidation: false
      }
    )

    assert.deepStrictEqual(result.values, {})
    assert.strictEqual(result.errors.roles.root.type, 'CUSTOM_VALIDATOR_FAILED')
    assert.strictEqual(result.errors.roles.root.message, 'Pick at least one role.')
  })

  it('should support criteriaMode=all by exposing the field error types map', () => {
    const schema = createSchema({
      name: { type: 'string', required: true }
    })

    const resolver = jsonRestSchemaResolver(schema)
    const result = resolver(
      {},
      undefined,
      {
        criteriaMode: 'all',
        fields: {
          name: { ref: null }
        },
        shouldUseNativeValidation: false
      }
    )

    assert.strictEqual(result.errors.name.type, 'REQUIRED')
    assert.deepStrictEqual(result.errors.name.types, {
      REQUIRED: 'Field is required'
    })
  })

  it('should honor custom schema operations inside the resolver', () => {
    const schema = createSchema({
      name: { type: 'string', required: true },
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

    const resolver = jsonRestSchemaResolver(schema, { operation: 'upsert' })
    const result = resolver(
      {},
      undefined,
      {
        criteriaMode: 'firstError',
        fields: {
          name: { ref: null },
          role: { ref: null }
        },
        shouldUseNativeValidation: false
      }
    )

    assert.deepStrictEqual(result, {
      values: {
        role: 'guest'
      },
      errors: {}
    })
  })

  it('should support bracket-style RHF field names and selected paths', () => {
    const roleSchema = createSchema({
      id: { type: 'string', required: true },
      label: { type: 'string', required: true, minLength: 2 }
    })

    const schema = createSchema({
      roles: { type: 'array', items: roleSchema }
    })

    const resolver = jsonRestSchemaResolver(schema, {}, { normalizeOnFieldValidation: true })
    const result = resolver(
      {
        roles: [
          { label: '  Editor  ' }
        ]
      },
      undefined,
      {
        criteriaMode: 'firstError',
        names: ['roles[0].label'],
        fields: {
          'roles[0].label': { ref: createMockRef() },
          'roles[0].id': { ref: createMockRef() }
        },
        shouldUseNativeValidation: false
      }
    )

    assert.deepStrictEqual(result, {
      values: {
        roles: [
          { label: 'Editor' }
        ]
      },
      errors: {}
    })
  })

  it('should apply native browser validation messages when requested', () => {
    const schema = createSchema({
      name: { type: 'string', required: true }
    })

    const nameRef = createMockRef()
    const resolver = jsonRestSchemaResolver(schema)
    const errorResult = resolver(
      {},
      undefined,
      {
        criteriaMode: 'firstError',
        fields: {
          name: { ref: nameRef }
        },
        shouldUseNativeValidation: true
      }
    )

    assert.strictEqual(errorResult.errors.name.message, 'Field is required')
    assert.strictEqual(nameRef.customValidity, 'Field is required')
    assert.strictEqual(nameRef.reportValidityCalls, 1)

    const successResult = resolver(
      { name: 'Alex' },
      undefined,
      {
        criteriaMode: 'firstError',
        fields: {
          name: { ref: nameRef }
        },
        shouldUseNativeValidation: true
      }
    )

    assert.deepStrictEqual(successResult.errors, {})
    assert.strictEqual(nameRef.customValidity, '')
    assert.strictEqual(nameRef.reportValidityCalls, 2)
  })

  it('should reject invalid resolver configuration clearly', () => {
    const schema = createSchema({
      name: { type: 'string' }
    })

    assert.throws(
      () => jsonRestSchemaResolver({}, {}, {}),
      /jsonRestSchemaResolver\(\) expects a Schema instance\./
    )

    assert.throws(
      () => jsonRestSchemaResolver(schema, { operation: 'create', mode: 'patch' }),
      /Resolver schema options `operation` and `mode` must match when both are provided\./
    )

    assert.throws(
      () => jsonRestSchemaResolver(schema, {}, { raw: 'yes' }),
      /jsonRestSchemaResolver\(\) resolver option `raw` must be a boolean\./
    )

    assert.throws(
      () => jsonRestSchemaResolver(schema, {}, { normalizeOnFieldValidation: 'yes' }),
      /jsonRestSchemaResolver\(\) resolver option `normalizeOnFieldValidation` must be a boolean\./
    )
  })
})

describe('2.36. Vue + Vuetify Adapters', () => {
  it('useSchemaForm should validate full forms and expose the normalized result', () => {
    const schema = createSchema({
      name: { type: 'string', required: true },
      role: { type: 'string', defaultTo: 'guest' }
    })

    const form = useSchemaForm(schema, {
      values: {
        name: '  Alex  '
      }
    })

    const result = form.validate()

    assert.deepStrictEqual(result, {
      validatedObject: {
        name: 'Alex',
        role: 'guest'
      },
      errors: {}
    })
    assert.deepStrictEqual(form.errors, {})
    assert.deepStrictEqual(form.lastResult, result)
  })

  it('useSchemaForm should validate only the selected field path without leaking sibling required rules', () => {
    const workspaceSummarySchema = createSchema({
      id: { type: 'id', required: true },
      slug: { type: 'string', required: true, minLength: 3 },
      ownerUserId: { type: 'id', required: true }
    })

    const schema = createSchema({
      workspace: { type: 'object', required: true, schema: workspaceSummarySchema }
    })

    const form = useSchemaForm(schema, {
      values: {
        workspace: {
          slug: '  main  '
        }
      },
      operation: 'create'
    })

    const result = form.validateField('workspace.slug')

    assert.deepStrictEqual(result, {
      validatedObject: {
        workspace: {
          slug: 'main'
        }
      },
      errors: {}
    })
    assert.deepStrictEqual(form.errors, {})
  })

  it('useSchemaForm should merge selected-path errors and clear only the validated path on the next pass', () => {
    const schema = createSchema({
      name: { type: 'string', required: true, minLength: 3 },
      email: { type: 'string', required: true }
    })

    const values = {
      name: 'x'
    }
    const form = useSchemaForm(schema, {
      values,
      operation: 'create'
    })

    form.validateField('name')
    assertError(form.errors, 'name', 'MIN_LENGTH')

    form.validateField('email')
    assertError(form.errors, 'name', 'MIN_LENGTH')
    assertError(form.errors, 'email', 'REQUIRED')

    values.name = '  Alex  '
    form.validateField('name')

    assert.strictEqual(form.errors.name, undefined)
    assertError(form.errors, 'email', 'REQUIRED')
  })

  it('useSchemaForm should support bracket-style selected paths', () => {
    const roleSchema = createSchema({
      id: { type: 'string', required: true },
      label: { type: 'string', required: true, minLength: 2 }
    })

    const schema = createSchema({
      roles: { type: 'array', items: roleSchema }
    })

    const form = useSchemaForm(schema, {
      values: {
        roles: [
          { label: '  Editor  ' }
        ]
      },
      operation: 'patch'
    })

    const result = form.validateFields(['roles[0].label'])

    assert.deepStrictEqual(result, {
      validatedObject: {
        roles: [
          { label: 'Editor' }
        ]
      },
      errors: {}
    })
  })

  it('submit() should validate first and only call the handler on success', () => {
    const schema = createSchema({
      name: { type: 'string', required: true },
      role: { type: 'string', defaultTo: 'guest' }
    })

    const values = { value: {} }
    const form = useSchemaForm(schema, {
      values
    })
    const calls = []
    const submit = form.submit((validatedObject, result, eventName) => {
      calls.push({ validatedObject, result, eventName })
      return validatedObject
    })

    const failedResult = submit('first-submit')
    assert.deepStrictEqual(failedResult.errors, {
      name: {
        field: 'name',
        code: 'REQUIRED',
        message: 'Field is required',
        params: {}
      }
    })
    assert.strictEqual(calls.length, 0)

    values.value.name = '  Alex  '
    const successValue = submit('second-submit')

    assert.deepStrictEqual(successValue, {
      name: 'Alex',
      role: 'guest'
    })
    assert.strictEqual(calls.length, 1)
    assert.strictEqual(calls[0].eventName, 'second-submit')
    assert.deepStrictEqual(calls[0].validatedObject, {
      name: 'Alex',
      role: 'guest'
    })
  })

  it('useSchemaField should expose value and error helpers for one path', () => {
    const profileSchema = createSchema({
      name: { type: 'string', required: true, minLength: 3 }
    })

    const schema = createSchema({
      profile: { type: 'object', required: true, schema: profileSchema }
    })

    const values = { value: {} }
    const form = useSchemaForm(schema, {
      values,
      operation: 'create'
    })
    const field = useSchemaField(form, 'profile.name')

    field.setValue('x')
    assert.strictEqual(values.value.profile.name, 'x')

    field.validate()
    assert.strictEqual(field.hasError, true)
    assert.strictEqual(field.error.code, 'MIN_LENGTH')
    assert.deepStrictEqual(field.messages, [field.error.message])

    field.setValue('  Alex  ')
    field.validate()

    assert.strictEqual(field.value, '  Alex  ')
    assert.strictEqual(field.hasError, false)
    assert.deepStrictEqual(field.messages, [])
  })

  it('useSchemaForm should honor custom operations', () => {
    const schema = createSchema({
      name: { type: 'string', required: true },
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

    const form = useSchemaForm(schema, {
      values: {},
      operation: 'upsert'
    })

    assert.deepStrictEqual(form.validate(), {
      validatedObject: {
        role: 'guest'
      },
      errors: {}
    })
  })

  it('Vuetify helpers should return rule messages, flat messages, and optional field props', () => {
    const schema = createSchema({
      name: { type: 'string', required: true, minLength: 3 }
    })

    const form = useSchemaForm(schema, {
      values: {
        name: ''
      },
      operation: 'create'
    })
    const rule = createVuetifyRule(form, 'name')
    const defaultProps = fieldProps(form, 'name')
    const messageProps = fieldProps(form, 'name', { includeErrorMessages: true })

    assert.ok(Array.isArray(defaultProps.rules))
    assert.strictEqual(Object.hasOwn(defaultProps, 'errorMessages'), false)

    const firstMessage = rule('x')
    assert.strictEqual(firstMessage, form.errors.name.message)
    assert.deepStrictEqual(getVuetifyErrorMessages(form, 'name'), [firstMessage])
    assert.deepStrictEqual(messageProps.errorMessages, [firstMessage])
    assert.strictEqual(messageProps.error, true)

    const secondMessage = messageProps.rules[0]('Alex')
    assert.strictEqual(secondMessage, true)
    assert.deepStrictEqual(getVuetifyErrorMessages(form.errors, 'name'), [])
    assert.deepStrictEqual(messageProps.errorMessages, [])
    assert.strictEqual(messageProps.error, false)
  })

  it('Vue and Vuetify adapters should reject invalid configuration clearly', () => {
    const schema = createSchema({
      name: { type: 'string' }
    })

    assert.throws(
      () => useSchemaForm({}, { values: {} }),
      /useSchemaForm\(\) expects a Schema instance\./
    )

    assert.throws(
      () => useSchemaForm(schema),
      /useSchemaForm\(\) requires a `values` option\./
    )

    const form = useSchemaForm(schema, { values: {} })

    assert.throws(
      () => useSchemaField({}, 'name'),
      /useSchemaField\(\) expects a form object returned by useSchemaForm\(\)\./
    )

    assert.throws(
      () => useSchemaField(form, ''),
      /Field path must be a non-empty string\./
    )

    assert.throws(
      () => createVuetifyRule({}, 'name'),
      /Vuetify helpers expect a form object returned by useSchemaForm\(\)\./
    )

    assert.throws(
      () => fieldProps(form, ''),
      /Vuetify helpers expect a non-empty field path\./
    )
  })
})

describe('2.37. VeeValidate Bridge', () => {
  it('should return normalized values on successful validation', () => {
    const schema = createSchema({
      name: { type: 'string', required: true },
      role: { type: 'string', defaultTo: 'guest' }
    })

    const standardSchema = toVeeValidateSchema(schema)
    const result = standardSchema['~standard'].validate({
      name: '  Alex  '
    })

    assert.deepStrictEqual(result, {
      value: {
        name: 'Alex',
        role: 'guest'
      }
    })
  })

  it('should expose nested issue paths for failed validation', () => {
    const roleSchema = createSchema({
      id: { type: 'string', required: true },
      label: { type: 'string', required: true, minLength: 2 }
    })

    const schema = createSchema({
      workspace: {
        type: 'object',
        required: true,
        schema: createSchema({
          slug: { type: 'string', required: true, minLength: 3 }
        })
      },
      roles: { type: 'array', items: roleSchema }
    })

    const standardSchema = toVeeValidateSchema(schema)
    const result = standardSchema['~standard'].validate({
      workspace: {
        slug: 'x'
      },
      roles: [
        { id: 'admin' }
      ]
    })

    assert.deepStrictEqual(result, {
      issues: [
        {
          message: 'Length must be at least 3 characters.',
          path: ['workspace', 'slug']
        },
        {
          message: 'Field is required',
          path: ['roles', 0, 'label']
        }
      ]
    })
  })

  it('should honor custom operations when building the VeeValidate schema', () => {
    const schema = createSchema({
      name: { type: 'string', required: true },
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

    const standardSchema = toVeeValidateSchema(schema, {
      operation: 'upsert'
    })

    assert.deepStrictEqual(standardSchema['~standard'].validate({}), {
      value: {
        role: 'guest'
      }
    })
  })

  it('should return a root-level issue for non-object validation input', () => {
    const schema = createSchema({
      name: { type: 'string' }
    })

    const standardSchema = toVeeValidateSchema(schema)

    assert.deepStrictEqual(standardSchema['~standard'].validate(null), {
      issues: [
        {
          message: 'Validation input must be a plain object.'
        }
      ]
    })
  })

  it('should reject invalid bridge configuration clearly', () => {
    const schema = createSchema({
      name: { type: 'string' }
    })

    assert.throws(
      () => toVeeValidateSchema({}),
      /toVeeValidateSchema\(\) expects a Schema instance\./
    )

    assert.throws(
      () => toVeeValidateSchema(schema, { operation: 'create', mode: 'patch' }),
      /VeeValidate schema options `operation` and `mode` must match when both are provided\./
    )
  })
})

describe('2.5. Transport JSON Schema Export', () => {
  it('should export an operation-aware draft-07 JSON Schema for transport validation', () => {
    const schema = createSchema({
      id: { type: 'id', required: true },
      name: { type: 'string', required: true, minLength: 3, maxLength: 10 },
      count: { type: 'integer', min: 1, max: 9 },
      age: { type: 'number', min: 18, defaultTo: 18 },
      isActive: { type: 'boolean', nullable: true },
      nickname: { type: 'string', nullOnEmpty: true, notEmpty: true }
    })

    const transportSchema = schema.toJsonSchema()

    assert.deepStrictEqual(transportSchema, {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        id: {
          type: ['integer', 'string'],
          minimum: 1,
          pattern: '^[1-9][0-9]*$',
          'x-json-rest-schema': { castType: 'id' }
        },
        name: {
          type: 'string',
          minLength: 3,
          maxLength: 10,
          'x-json-rest-schema': { castType: 'string' }
        },
        count: {
          type: ['integer', 'string'],
          minimum: 1,
          maximum: 9,
          'x-json-rest-schema': { castType: 'integer' }
        },
        age: {
          type: ['number', 'string'],
          minimum: 18,
          default: 18,
          'x-json-rest-schema': { castType: 'number' }
        },
        isActive: {
          anyOf: [
            { type: 'boolean' },
            { type: 'number', enum: [0, 1] },
            { type: 'string', enum: ['false', '0', 'no', 'n', 'off', 'true', '1', 'yes', 'y', 'on'] },
            { type: 'null' }
          ],
          'x-json-rest-schema': { castType: 'boolean' }
        },
        nickname: {
          anyOf: [
            {
              type: 'string',
              minLength: 1
            },
            { const: '' }
          ],
          'x-json-rest-schema': { castType: 'string' }
        }
      },
      additionalProperties: false,
      required: ['id', 'name']
    })
  })

  it('should cast integer values and reject non-integers', () => {
    const schema = createSchema({
      count: { type: 'integer', required: true, min: 1, max: 9 }
    })

    const { validatedObject, errors } = schema.create({ count: '7' })
    assert.deepStrictEqual(errors, {})
    assert.strictEqual(validatedObject.count, 7)

    const invalid = schema.create({ count: '7.5' })
    assert.strictEqual(invalid.errors.count.code, 'TYPE_CAST_FAILED')
  })

  it('should omit required fields and defaults in patch mode', () => {
    const schema = createSchema({
      id: { type: 'id', required: true },
      name: { type: 'string', required: true },
      age: { type: 'number', defaultTo: 18 }
    })

    const transportSchema = schema.toJsonSchema({ mode: 'patch' })

    assert.strictEqual(Object.hasOwn(transportSchema, 'required'), false)
    assert.strictEqual(Object.hasOwn(transportSchema.properties.age, 'default'), false)
  })

  it('should export custom operation contracts through the operation option', () => {
    const schema = createSchema({
      id: { type: 'id', required: true },
      age: { type: 'number', defaultTo: 18 }
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

    const transportSchema = schema.toJsonSchema({ operation: 'upsert' })

    assert.strictEqual(Object.hasOwn(transportSchema, 'required'), false)
    assert.strictEqual(transportSchema.properties.age.default, 18)
  })

  it('should keep mode as compatibility sugar for built-in operations', () => {
    const schema = createSchema({
      id: { type: 'id', required: true },
      age: { type: 'number', defaultTo: 18 }
    })

    assert.deepStrictEqual(
      schema.toJsonSchema({ mode: 'patch' }),
      schema.toJsonSchema({ operation: 'patch' })
    )
  })

  it('should reject unknown operation names during transport export', () => {
    const schema = createSchema({ id: { type: 'id' } })

    assert.throws(
      () => schema.toJsonSchema({ operation: 'publish' }),
      /Unknown JSON Schema export operation 'publish'\./
    )
  })

  it('should allow additionalProperties to be configured explicitly', () => {
    const schema = createSchema({ id: { type: 'id' } })
    const transportSchema = schema.toJsonSchema({ additionalProperties: true })

    assert.strictEqual(transportSchema.additionalProperties, true)
  })

  it('should export nested object fields, object maps, passthrough nested objects, opaque object bags, and schema-backed array item objects', () => {
    const workspaceSummarySchema = createSchema({
      id: { type: 'id', required: true },
      slug: { type: 'string', required: true, minLength: 3 }
    })

    const roleSchema = createSchema({
      id: { type: 'string', required: true },
      label: { type: 'string', required: true }
    })

    const schema = createSchema({
      workspace: { type: 'object', required: true, schema: workspaceSummarySchema },
      errorDetails: {
        type: 'object',
        schema: createSchema({
          fieldErrors: {
            type: 'object',
            values: {
              type: 'string',
              minLength: 1
            },
            required: false
          }
        }),
        additionalProperties: true
      },
      fieldErrors: {
        type: 'object',
        values: {
          type: 'string',
          minLength: 1
        }
      },
      metadata: { type: 'object', additionalProperties: true },
      roles: { type: 'array', required: true, items: roleSchema },
      assignableRoleIds: { type: 'array', items: { type: 'string', minLength: 1 } }
    })

    const transportSchema = schema.toJsonSchema()
    const workspaceDefinition = resolveReferencedDefinition(transportSchema, transportSchema.properties.workspace)
    const errorDetailsDefinition = resolveReferencedDefinition(transportSchema, transportSchema.properties.errorDetails)
    const roleDefinition = resolveReferencedDefinition(transportSchema, transportSchema.properties.roles.items)

    assert.strictEqual(typeof getDefinitionRef(transportSchema.properties.workspace), 'string')
    assert.deepStrictEqual(transportSchema.properties.workspace['x-json-rest-schema'], { castType: 'object' })

    assert.deepStrictEqual(transportSchema.properties.metadata, {
      type: 'object',
      additionalProperties: true,
      'x-json-rest-schema': { castType: 'object' }
    })

    assert.deepStrictEqual(transportSchema.properties.fieldErrors, {
      type: 'object',
      additionalProperties: {
        type: 'string',
        minLength: 1,
        'x-json-rest-schema': { castType: 'string' }
      },
      'x-json-rest-schema': { castType: 'object' }
    })

    assert.strictEqual(typeof getDefinitionRef(transportSchema.properties.errorDetails), 'string')
    assert.deepStrictEqual(transportSchema.properties.errorDetails['x-json-rest-schema'], { castType: 'object' })

    assert.deepStrictEqual(transportSchema.properties.roles, {
      type: 'array',
      items: {
        allOf: transportSchema.properties.roles.items.allOf,
        'x-json-rest-schema': { castType: 'object' }
      },
      'x-json-rest-schema': { castType: 'array' }
    })

    assert.deepStrictEqual(transportSchema.properties.assignableRoleIds, {
      type: 'array',
      items: {
        type: 'string',
        minLength: 1,
        'x-json-rest-schema': { castType: 'string' }
      },
      'x-json-rest-schema': { castType: 'array' }
    })

    assert.deepStrictEqual(workspaceDefinition, {
      type: 'object',
      properties: {
        id: {
          type: ['integer', 'string'],
          minimum: 1,
          pattern: '^[1-9][0-9]*$',
          'x-json-rest-schema': { castType: 'id' }
        },
        slug: {
          type: 'string',
          minLength: 3,
          'x-json-rest-schema': { castType: 'string' }
        }
      },
      additionalProperties: false,
      required: ['id', 'slug']
    })

    assert.deepStrictEqual(errorDetailsDefinition, {
      type: 'object',
      properties: {
        fieldErrors: {
          type: 'object',
          additionalProperties: {
            type: 'string',
            minLength: 1,
            'x-json-rest-schema': { castType: 'string' }
          },
          'x-json-rest-schema': { castType: 'object' }
        }
      },
      additionalProperties: true
    })

    assert.deepStrictEqual(roleDefinition, {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          'x-json-rest-schema': { castType: 'string' }
        },
        label: {
          type: 'string',
          'x-json-rest-schema': { castType: 'string' }
        }
      },
      additionalProperties: false,
      required: ['id', 'label']
    })
  })

  it('should inherit patch semantics inside nested object transport schemas', () => {
    const workspaceSummarySchema = createSchema({
      id: { type: 'id', required: true },
      slug: { type: 'string', required: true }
    })

    const schema = createSchema({
      workspace: { type: 'object', required: true, schema: workspaceSummarySchema }
    })

    const patchTransportSchema = schema.toJsonSchema({ operation: 'patch' })
    const workspaceDefinition = resolveReferencedDefinition(patchTransportSchema, patchTransportSchema.properties.workspace)

    assert.strictEqual(Object.hasOwn(patchTransportSchema.properties.workspace, 'required'), false)
    assert.strictEqual(Object.hasOwn(workspaceDefinition, 'required'), false)
  })

  it('should export array item object schemas in replace mode even when the parent export uses patch mode', () => {
    const roleSchema = createSchema({
      id: { type: 'string', required: true },
      label: { type: 'string', required: true }
    })

    const schema = createSchema({
      roles: { type: 'array', items: roleSchema }
    })

    const patchTransportSchema = schema.toJsonSchema({ operation: 'patch' })
    const roleDefinition = resolveReferencedDefinition(patchTransportSchema, patchTransportSchema.properties.roles.items)

    assert.deepStrictEqual(roleDefinition.required, ['id', 'label'])
  })

  it('should export nested child schemas with inherited custom operations even when the child schema does not declare them', () => {
    const childSchema = createSchema({
      slug: { type: 'string', required: true },
      title: { type: 'string', defaultTo: 'Untitled' }
    })

    const schema = createSchema({
      workspace: { type: 'object', schema: childSchema }
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

    const transportSchema = schema.toJsonSchema({ operation: 'upsert' })
    const workspaceDefinition = resolveReferencedDefinition(transportSchema, transportSchema.properties.workspace)

    assert.strictEqual(Object.hasOwn(transportSchema.properties.workspace, 'required'), false)
    assert.strictEqual(Object.hasOwn(workspaceDefinition, 'required'), false)
    assert.strictEqual(workspaceDefinition.properties.title.default, 'Untitled')
  })

  it('should fail clearly for unsupported nested transport export definitions', () => {
    const schema = createSchema({
      metadata: {
        type: 'object',
        additionalProperties: false
      }
    })

    assert.throws(
      () => schema.toJsonSchema(),
      /Object field "metadata" only supports additionalProperties: true\./
    )

    const valuesSchema = createSchema({
      metadata: {
        type: 'object',
        values: { type: 'string' },
        additionalProperties: true
      }
    })

    assert.throws(
      () => valuesSchema.toJsonSchema(),
      /Object field "metadata" cannot define both values and additionalProperties: true\./
    )
  })

  it('should export self-recursive schema graphs through definition refs instead of failing', () => {
    const nodeSchema = createSchema({
      id: { type: 'string', required: true },
      children: { type: 'array', required: false }
    })

    nodeSchema.structure.children.items = nodeSchema

    const transportSchema = nodeSchema.toJsonSchema()
    const recursiveDefinition = resolveReferencedDefinition(transportSchema, transportSchema.properties.children.items)

    assert.strictEqual(typeof getDefinitionRef(transportSchema.properties.children.items), 'string')
    assert.deepStrictEqual(transportSchema.properties.children.items['x-json-rest-schema'], { castType: 'object' })
    assert.strictEqual(
      getDefinitionRef(recursiveDefinition.properties.children.items),
      getDefinitionRef(transportSchema.properties.children.items)
    )
  })

  it('should export direct self-recursive nested object fields by referencing the document root', () => {
    const nodeSchema = createSchema({
      id: { type: 'string', required: true },
      parent: { type: 'object', required: false }
    })

    nodeSchema.structure.parent.schema = nodeSchema

    const transportSchema = nodeSchema.toJsonSchema()

    assert.deepStrictEqual(transportSchema.properties.parent, {
      allOf: [
        {
          $ref: '#'
        }
      ],
      'x-json-rest-schema': { castType: 'object' }
    })
    assert.strictEqual(Object.hasOwn(transportSchema, 'definitions'), false)
  })

  it('should wrap ref-backed nested object fields before merging custom validator export fragments', () => {
    const customValidator = () => {}
    customValidator.toJsonSchema = ({ parameterValue }) => ({
      minProperties: parameterValue
    })
    createSchema.addValidator('transport-nested-object-hint', customValidator)

    const childSchema = createSchema({
      name: { type: 'string' }
    })

    const schema = createSchema({
      profile: {
        type: 'object',
        schema: childSchema,
        'transport-nested-object-hint': 1
      }
    })

    const transportSchema = schema.toJsonSchema()
    const profileDefinition = resolveReferencedDefinition(transportSchema, transportSchema.properties.profile)

    assert.strictEqual(typeof getDefinitionRef(transportSchema.properties.profile), 'string')
    assert.strictEqual(transportSchema.properties.profile.minProperties, 1)
    assert.deepStrictEqual(transportSchema.properties.profile['x-json-rest-schema'], { castType: 'object' })
    assert.deepStrictEqual(profileDefinition, {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          'x-json-rest-schema': { castType: 'string' }
        }
      },
      additionalProperties: false
    })
  })

  it('should preserve built-in transforms and passive schema metadata as extension metadata', () => {
    const schema = createSchema({
      title: {
        type: 'string',
        uppercase: true,
        length: 10,
        precision: 8,
        scale: 2
      }
    })

    const transportSchema = schema.toJsonSchema()

    assert.deepStrictEqual(transportSchema.properties.title['x-json-rest-schema'], {
      castType: 'string',
      transforms: {
        uppercase: true,
        length: 10
      },
      metadata: {
        precision: 8,
        scale: 2
      }
    })
  })

  it('should export enum values as canonical transport schema constraints', () => {
    const schema = createSchema({
      status: {
        type: 'string',
        enum: ['draft', 'published', 'archived']
      }
    })

    assert.deepStrictEqual(schema.toJsonSchema().properties.status, {
      type: 'string',
      enum: ['draft', 'published', 'archived'],
      'x-json-rest-schema': { castType: 'string' }
    })
  })

  it('should preserve temporal precision and passive numeric metadata as schema metadata', () => {
    const schema = createSchema({
      recordedAt: {
        type: 'dateTime',
        temporalPrecision: 3
      },
      amount: {
        type: 'number',
        unsigned: true,
        precision: 12,
        scale: 4
      }
    })

    const transportSchema = schema.toJsonSchema()

    assert.deepStrictEqual(transportSchema.properties.recordedAt['x-json-rest-schema'], {
      castType: 'dateTime',
      metadata: {
        temporalPrecision: 3
      }
    })

    assert.deepStrictEqual(transportSchema.properties.amount['x-json-rest-schema'], {
      castType: 'number',
      metadata: {
        unsigned: true,
        precision: 12,
        scale: 4
      }
    })
  })

  it('should ignore non-schema metadata keys that belong to other layers', () => {
    const schema = createSchema({
      email: {
        type: 'string',
        required: true,
        format: 'email',
        unique: true,
        search: true
      }
    })

    const transportSchema = schema.toJsonSchema()

    assert.deepStrictEqual(transportSchema.properties.email, {
      type: 'string',
      'x-json-rest-schema': { castType: 'string' }
    })
  })

  it('should throw for custom validators without a JSON Schema export hook', () => {
    createSchema.addValidator('transport-custom-validator', () => {})

    const schema = createSchema({
      field: {
        type: 'string',
        'transport-custom-validator': true
      }
    })

    assert.throws(
      () => schema.toJsonSchema(),
      /transport-custom-validator/
    )
  })

  it('should use custom JSON Schema export hooks when custom rules provide them', () => {
    const customType = (context) => context.value
    customType.toJsonSchema = () => ({
      type: 'string',
      pattern: '^custom$'
    })
    createSchema.addType('transport-custom-type', customType)

    const customValidator = () => {}
    customValidator.toJsonSchema = ({ parameterValue }) => ({
      minLength: parameterValue
    })
    createSchema.addValidator('transport-custom-min', customValidator)

    const schema = createSchema({
      field: {
        type: 'transport-custom-type',
        'transport-custom-min': 6
      }
    })

    assert.deepStrictEqual(schema.toJsonSchema().properties.field, {
      type: 'string',
      pattern: '^custom$',
      minLength: 6,
      'x-json-rest-schema': { castType: 'transport-custom-type' }
    })
  })
})

describe('3. Core Plugin: Type Handlers', () => {
  const testCases = [
    // None
    { type: 'none', input: { field: 123 }, expected: 123 },
    { type: 'none', input: { field: { a: 1 } }, expected: { a: 1 } },

    // String
    { type: 'string', input: { field: ' test ' }, expected: 'test' },
    { type: 'string', input: { field: ' test ' }, options: { noTrim: true }, expected: ' test ' },
    { type: 'string', input: { field: 123 }, expected: '123' },
    { type: 'string', input: { field: null }, error: 'NOT_NULLABLE' },
    { type: 'string', input: { field: undefined }, error: 'TYPE_CAST_FAILED' },
    { type: 'string', input: { field: {} }, error: 'TYPE_CAST_FAILED' },

    // Number
    { type: 'number', input: { field: '42.5' }, expected: 42.5 },
    { type: 'number', input: { field: ' 42.5 ' }, expected: 42.5 },
    { type: 'number', input: { field: '' }, error: 'TYPE_CAST_FAILED' },
    { type: 'number', input: { field: '   ' }, error: 'TYPE_CAST_FAILED' },
    { type: 'number', input: { field: 'Infinity' }, error: 'TYPE_CAST_FAILED' },
    { type: 'number', input: { field: null }, error: 'NOT_NULLABLE' },
    { type: 'number', input: { field: 'abc' }, error: 'TYPE_CAST_FAILED' },

    // Timestamp
    { type: 'timestamp', input: { field: 1672531200000 }, expected: 1672531200000 },
    { type: 'timestamp', input: { field: '0' }, options: { nullable: true }, expected: null },
    { type: 'timestamp', input: { field: 'abc' }, error: 'TYPE_CAST_FAILED' },

    // DateTime & Date
    { type: 'dateTime', input: { field: '2025-01-01T12:30:00Z' }, expected: new Date('2025-01-01T12:30:00Z') },
    { type: 'dateTime', input: { field: 'invalid' }, expected: null },
    { type: 'date', input: { field: '2025-01-01T12:30:00Z' }, expected: new Date('2025-01-01T00:00:00Z') },
    { type: 'date', input: { field: '2025-01-01' }, expected: new Date('2025-01-01T00:00:00Z') },

    // Array
    { type: 'array', input: { field: 'one' }, expected: ['one'] },
    { type: 'array', input: { field: ['one', 'two'] }, expected: ['one', 'two'] },

    // Object
    { type: 'object', input: { field: { nested: true } }, expected: { nested: true } },
    { type: 'object', input: { field: 'not-an-object' }, error: 'TYPE_CAST_FAILED' },
    { type: 'object', input: { field: ['nope'] }, error: 'TYPE_CAST_FAILED' },

    // Boolean
    { type: 'boolean', input: { field: 'true' }, expected: true },
    { type: 'boolean', input: { field: true }, expected: true },
    { type: 'boolean', input: { field: 'on' }, expected: true },
    { type: 'boolean', input: { field: ' yes ' }, expected: true },
    { type: 'boolean', input: { field: 'false' }, expected: false },
    { type: 'boolean', input: { field: 1 }, expected: true },
    { type: 'boolean', input: { field: 0 }, expected: false },
    { type: 'boolean', input: { field: 'no' }, options: { stringFalseWhen: 'no' }, expected: false },
    { type: 'boolean', input: { field: 'maybe' }, error: 'TYPE_CAST_FAILED' },

    // ID
    { type: 'id', input: { field: '123' }, expected: 123 },
    { type: 'id', input: { field: 123 }, expected: 123 },
    { type: 'id', input: { field: '00123' }, error: 'TYPE_CAST_FAILED' },
    { type: 'id', input: { field: '123abc' }, error: 'TYPE_CAST_FAILED' },
    { type: 'id', input: { field: 0 }, error: 'TYPE_CAST_FAILED' },
  ]

  testCases.forEach(({ type, input, expected, options = {}, error }) => {
    const title = error
      ? `type:'${type}' should fail for input: ${JSON.stringify(input.field)}`
      : `type:'${type}' should process input ${JSON.stringify(input.field)} to ${JSON.stringify(expected)}`

    it(title, () => {
      const schema = createSchema({ field: { type, ...options } })
      const { validatedObject, errors } = schema.create(input)

      if (error) {
        assertError(errors, 'field', error)
      } else {
        assert.strictEqual(Object.keys(errors).length, 0, `Expected no errors but found: ${JSON.stringify(errors)}`)
        assert.deepStrictEqual(validatedObject.field, expected)
      }
    })
  })

  it("type:'serialize' should process an object to a string", () => {
    const schema = createSchema({ field: { type: 'serialize' } })
    const inputObject = { a: 1, b: 2 }
    const input = { field: inputObject }
    const expected = JSON.stringify(inputObject)
    const { validatedObject, errors } = schema.create(input)

    assert.strictEqual(Object.keys(errors).length, 0, `Expected no errors but found: ${JSON.stringify(errors)}`)
    assert.strictEqual(validatedObject.field, expected)
  })

  it('type:`serialize` should handle circular references', () => {
    const schema = createSchema({ field: { type: 'serialize' } })
    const circular = { a: 1 }
    circular.b = circular
    const { validatedObject, errors } = schema.create({ field: circular })
    assert.strictEqual(Object.keys(errors).length, 0)
    assert.strictEqual(typeof validatedObject.field, 'string')

    const parsed = flatted.parse(validatedObject.field)
    assert.strictEqual(parsed.b, parsed, 'Circular reference was not maintained')
  })
})

describe('4. Core Plugin: Validator Handlers', () => {
  it('`min`/`max` validators should work for numbers, `minLength`/`maxLength` for strings', () => {
    const schema = createSchema({
      num: { type: 'number', min: 10, max: 20 },
      str: { type: 'string', minLength: 3, maxLength: 5 },
    })

    const { errors: err1 } = schema.create({ num: 9, str: 'hi' })
    assertError(err1, 'num', 'MIN_VALUE')
    assertError(err1, 'str', 'MIN_LENGTH')
    assert.deepStrictEqual(err1.num.params, { min: 10, actual: 9 })
    assert.deepStrictEqual(err1.str.params, { min: 3, actual: 2 })

    const { errors: err2 } = schema.create({ num: 21, str: 'hello world' })
    assertError(err2, 'num', 'MAX_VALUE')
    assertError(err2, 'str', 'MAX_LENGTH')
  })

  it('`validator` should work with a custom synchronous function', () => {
    const schema = createSchema({
      syncField: { type: 'string', validator: (val) => val === 'ok' ? undefined : 'Value must be "ok"' }
    })

    const { errors: err1 } = schema.create({ syncField: 'not_ok' })
    assertError(err1, 'syncField', 'CUSTOM_VALIDATOR_FAILED')

    const { errors: err2 } = schema.create({ syncField: 'ok' })
    assert.strictEqual(Object.keys(err2).length, 0)
  })

  it('`validator` should throw clearly when a custom validator returns a Promise', () => {
    const schema = createSchema({
      field: {
        type: 'string',
        validator: () => Promise.resolve('not allowed')
      }
    })

    assert.throws(
      () => schema.create({ field: 'value' }),
      /Custom validator for "field" must be synchronous\./
    )
  })

  it('validator handlers should throw clearly when a registered validator returns a Promise', () => {
    createSchema.addValidator('promise-validator-handler', () => Promise.resolve())

    const schema = createSchema({
      field: {
        type: 'string',
        'promise-validator-handler': true
      }
    })

    assert.throws(
      () => schema.create({ field: 'value' }),
      /Validator handler for "promise-validator-handler" must be synchronous\./
    )
  })

  it('type handlers should throw clearly when a registered type returns a Promise', () => {
    createSchema.addType('promise-type-handler', () => Promise.resolve('value'))

    const schema = createSchema({
      field: {
        type: 'promise-type-handler'
      }
    })

    assert.throws(
      () => schema.create({ field: 'value' }),
      /Type handler for "promise-type-handler" must be synchronous\./
    )
  })

  it('`enum` should enforce membership against the declared enum values', () => {
    const schema = createSchema({
      status: { type: 'string', enum: ['draft', 'published', 'archived'] }
    })

    const { errors: invalidErrors } = schema.create({ status: 'deleted' })
    assertError(invalidErrors, 'status', 'ENUM_VALUE')

    const { errors: validErrors } = schema.create({ status: 'published' })
    assert.strictEqual(Object.keys(validErrors).length, 0)
  })

  it('`enum` should support deep object membership in browser-safe builds', () => {
    const schema = createSchema({
      config: {
        type: 'blob',
        enum: [
          {
            scope: 'admin',
            flags: ['read', 'write'],
            rules: [{ allow: true }]
          }
        ]
      }
    })

    const { errors: validErrors } = schema.create({
      config: {
        scope: 'admin',
        flags: ['read', 'write'],
        rules: [{ allow: true }]
      }
    })

    assert.strictEqual(Object.keys(validErrors).length, 0)
  })

  it('`pattern` should enforce regular expression matches for strings', () => {
    const schema = createSchema({
      color: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' }
    })

    const { errors: invalidErrors } = schema.create({ color: 'bad' })
    assertError(invalidErrors, 'color', 'PATTERN')

    const { errors: validErrors } = schema.create({ color: '#0F6B54' })
    assert.strictEqual(Object.keys(validErrors).length, 0)
  })

  it('`uppercase`/`lowercase` should transform strings', () => {
    const schema = createSchema({
      upper: { type: 'string', uppercase: true },
      lower: { type: 'string', lowercase: true },
    })
    const { validatedObject } = schema.create({ upper: 'test', lower: 'TEST' })
    assert.strictEqual(validatedObject.upper, 'TEST')
    assert.strictEqual(validatedObject.lower, 'test')
  })

  it('`length` should truncate strings and error on long numbers', () => {
    const schema = createSchema({
      str: { type: 'string', length: 5 },
      num: { type: 'number', length: 3 }
    })

    const { validatedObject, errors } = schema.create({ str: '123456789', num: 1234 })
    assert.strictEqual(validatedObject.str, '12345')
    assertError(errors, 'num', 'RANGE_EXCEEDED')
  })

  it('`notEmpty` should fail on empty strings', () => {
    const schema = createSchema({ field: { type: 'string', notEmpty: true } })
    const { errors } = schema.create({ field: '' })
    assertError(errors, 'field', 'NOT_EMPTY')
  })
})

describe('5. Extensibility: Custom Plugins', () => {
  it('should allow defining and using a custom plugin', () => {
    // 1. Define the plugin
    const myPlugin = {
      install (api) {
        api.addType('hexColor', (ctx) => {
          if (typeof ctx.value !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(ctx.value)) {
            ctx.throwTypeError()
          }
          return ctx.value.toLowerCase()
        })
        api.addValidator('isAwesome', (ctx) => {
          if (ctx.parameterValue === true && ctx.value !== 'awesome') {
            ctx.throwParamError('NOT_AWESOME', 'This field must be awesome')
          }
        })
      }
    }

    // 2. Install it via `use()` on the global factory
    createSchema.use(myPlugin)

    // 3. Use the new rules in a schema
    const schema = createSchema({
      color: { type: 'hexColor' },
      mood: { type: 'string', isAwesome: true },
    })

    // 4. Test it
    const { validatedObject, errors } = schema.create({
      color: '#FF00AA',
      mood: 'awesome'
    })

    assert.strictEqual(Object.keys(errors).length, 0, 'Custom plugin validation failed')
    assert.strictEqual(validatedObject.color, '#ff00aa')
    assert.strictEqual(validatedObject.mood, 'awesome')

    const { errors: failErrors } = schema.create({
      color: 'red',
      mood: 'good'
    })

    assertError(failErrors, 'color', 'TYPE_CAST_FAILED')
    assertError(failErrors, 'mood', 'NOT_AWESOME')
  })
})

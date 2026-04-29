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
import { createSchema } from './src/index.js'
import { Schema } from './src/Schema.js'
import * as flatted from 'flatted'

// Helper for asserting that a specific error exists and has the correct code.
function assertError (errors, fieldName, expectedCode) {
  const errorObject = errors[fieldName]
  assert.ok(errorObject, `Expected an error for field '${fieldName}' but found none.`)
  assert.strictEqual(errorObject.code, expectedCode, `For field '${fieldName}', expected error code '${expectedCode}' but got '${errorObject.code}'.`)
}

describe('1. Core API (`createSchema`)', () => {
  it('should export a function `createSchema`', () => {
    assert.strictEqual(typeof createSchema, 'function')
  })

  it('should have `use`, `addType`, and `addValidator` methods on the factory', () => {
    assert.strictEqual(typeof createSchema.use, 'function')
    assert.strictEqual(typeof createSchema.addType, 'function')
    assert.strictEqual(typeof createSchema.addValidator, 'function')
  })

  it('`createSchema(structure)` should return an instance of Schema', () => {
    const mySchema = createSchema({})
    assert.ok(mySchema instanceof Schema, 'Did not return a Schema instance')
  })

  it('should allow adding a type handler and using it', () => {
    createSchema.addType('custom-string', ctx => `custom-${ctx.value}`)
    const schema = createSchema({ name: { type: 'custom-string' } })
    const { validatedObject } = schema.create({ name: 'test' })
    assert.strictEqual(validatedObject.name, 'custom-test')
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

    it('should fail clearly for unsupported nested definition combinations', () => {
      const schemaWithInvalidObject = createSchema({
        metadata: {
          type: 'object',
          schema: createSchema({ value: { type: 'string' } }),
          additionalProperties: true
        }
      })

      assert.throws(
        () => schemaWithInvalidObject.create({ metadata: {} }),
        /Object field "metadata" cannot define both schema and additionalProperties: true\./
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

  it('should export nested object fields, opaque object bags, and recursive array item schemas', () => {
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
      metadata: { type: 'object', additionalProperties: true },
      roles: { type: 'array', required: true, items: roleSchema },
      assignableRoleIds: { type: 'array', items: { type: 'string', minLength: 1 } }
    })

    const transportSchema = schema.toJsonSchema()

    assert.deepStrictEqual(transportSchema.properties.workspace, {
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
      required: ['id', 'slug'],
      'x-json-rest-schema': { castType: 'object' }
    })

    assert.deepStrictEqual(transportSchema.properties.metadata, {
      type: 'object',
      additionalProperties: true,
      'x-json-rest-schema': { castType: 'object' }
    })

    assert.deepStrictEqual(transportSchema.properties.roles, {
      type: 'array',
      items: {
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
        required: ['id', 'label'],
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

    assert.strictEqual(Object.hasOwn(patchTransportSchema.properties.workspace, 'required'), false)
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

    assert.deepStrictEqual(patchTransportSchema.properties.roles.items.required, ['id', 'label'])
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

    assert.strictEqual(Object.hasOwn(transportSchema.properties.workspace, 'required'), false)
    assert.strictEqual(transportSchema.properties.workspace.properties.title.default, 'Untitled')
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

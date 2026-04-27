/**
 * @file Absurdly comprehensive tests for the entire schema validation library.
 * This file is aligned with the final version that uses an object map for errors.
 *
 * To Run:
 * 1. Make sure you are in the project root directory.
 * 2. Run the command: `node --test`
 */

import { test, describe, it, before } from 'node:test'
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

  it('should allow adding a type handler and using it', async () => {
    createSchema.addType('custom-string', ctx => `custom-${ctx.value}`)
    const schema = createSchema({ name: { type: 'custom-string' } })
    const { validatedObject } = await schema.create({ name: 'test' })
    assert.strictEqual(validatedObject.name, 'custom-test')
  })

  it('should allow adding a validator and using it', async () => {
    createSchema.addValidator('must-be-awesome', ctx => {
      if (ctx.value !== 'awesome') {
        ctx.throwParamError('NOT_AWESOME', 'This field must be awesome')
      }
    })
    const schema = createSchema({ framework: { type: 'string', 'must-be-awesome': true } })
    const { errors } = await schema.create({ framework: 'good' })
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
})

describe('2. Core Validation Logic (`Schema.js`)', () => {
  it('should return no errors for a valid object', async () => {
    const schema = createSchema({ name: { type: 'string' } })
    const { errors } = await schema.create({ name: 'test' })
    assert.strictEqual(Object.keys(errors).length, 0)
  })

  it('should return a `FIELD_NOT_ALLOWED` error for spurious fields', async () => {
    const schema = createSchema({ name: { type: 'string' } })
    const { errors } = await schema.create({ name: 'test', extra: 'field' })
    assert.strictEqual(Object.keys(errors).length, 1)
    assertError(errors, 'extra', 'FIELD_NOT_ALLOWED')
  })

  it('should correctly handle the `required` validator', async () => {
    const schema = createSchema({ name: { type: 'string', required: true } })
    const { errors } = await schema.create({})
    assert.strictEqual(Object.keys(errors).length, 1)
    assertError(errors, 'name', 'REQUIRED')
  })

  it('should return a `NOT_NULLABLE` error if a field is null but not allowed to be', async () => {
    const schema = createSchema({ name: { type: 'string' } })
    const { errors } = await schema.create({ name: null })
    assertError(errors, 'name', 'NOT_NULLABLE')
  })

  it('should allow null if `nullable` is true', async () => {
    const schema = createSchema({ name: { type: 'string', nullable: true } })
    const { errors, validatedObject } = await schema.create({ name: null })
    assert.strictEqual(Object.keys(errors).length, 0)
    assert.strictEqual(validatedObject.name, null)
  })

  it('should cast empty string to null if `nullOnEmpty` is true', async () => {
    const schema = createSchema({ name: { type: 'string', nullOnEmpty: true } })
    const { errors, validatedObject } = await schema.create({ name: '' })
    assert.strictEqual(Object.keys(errors).length, 0)
    assert.strictEqual(validatedObject.name, null)
  })

  it('should apply defaultTo values even when the object has validation errors', async () => {
    const schema = createSchema({
      name: { type: 'string', required: true },
      role: { type: 'string', defaultTo: 'user' },
    })

    // Case 1: Invalid object (missing required field), defaultTo should still be applied.
    const { validatedObject: invalidObj, errors } = await schema.create({})
    assert.strictEqual(Object.keys(errors).length, 1)
    assert.strictEqual(invalidObj.role, 'user', 'defaultTo should be applied even to invalid objects')
    assert.strictEqual(Object.hasOwn(invalidObj, 'name'), false, 'Missing required field should remain omitted in create-mode validation')

    // Case 2: Valid object, defaultTo should also be applied.
    const { validatedObject: validObj, errors: validErrors } = await schema.create({ name: 'test' })
    assert.strictEqual(Object.keys(validErrors).length, 0)
    assert.strictEqual(validObj.role, 'user')
  })

  describe('Validation Options', () => {
    const schema = createSchema({
      name: { type: 'string', required: true, minLength: 3 },
      role: { type: 'string', defaultTo: 'guest' }
    })

    it('`skipFields`: should completely ignore specified fields', async () => {
      const { errors } = await schema.create({ name: 'a' }, { skipFields: ['name'] })
      assert.strictEqual(Object.keys(errors).length, 0)
    })

    it('`skipParams`: should skip specific validators on a field', async () => {
      // name: 'a' would fail `minLength: 3`, but we skip it
      const { errors } = await schema.create({ name: 'a' }, { skipParams: { name: ['minLength'] } })
      assert.strictEqual(Object.keys(errors).length, 0)
    })
  })

  describe('Operation Contracts', () => {
    const schema = createSchema({
      name: { type: 'string', required: true },
      role: { type: 'string', defaultTo: 'guest' },
      bio: { type: 'string', nullable: true }
    })

    it('`create()` should enforce required fields, apply defaults, and omit untouched optional fields', async () => {
      const { validatedObject, errors } = await schema.create({ name: '  Alex  ' })
      assert.strictEqual(Object.keys(errors).length, 0)
      assert.deepStrictEqual(validatedObject, {
        name: 'Alex',
        role: 'guest'
      })
    })

    it('`replace()` should enforce required fields and preserve omitted optional fields', async () => {
      const { validatedObject, errors } = await schema.replace({ name: '  Alex  ' })
      assert.strictEqual(Object.keys(errors).length, 0)
      assert.deepStrictEqual(validatedObject, {
        name: 'Alex',
        role: 'guest'
      })
    })

    it('`patch()` should only validate and return explicitly provided fields', async () => {
      const { validatedObject, errors } = await schema.patch({ name: '  Alex  ' })
      assert.strictEqual(Object.keys(errors).length, 0)
      assert.deepStrictEqual(validatedObject, {
        name: 'Alex'
      })
    })

    it('`patch()` should not enforce missing required fields when they are absent', async () => {
      const { validatedObject, errors } = await schema.patch({ bio: null })
      assert.strictEqual(Object.keys(errors).length, 0)
      assert.deepStrictEqual(validatedObject, {
        bio: null
      })
    })

    it('operation methods should reject removed validation options instead of aliasing old behavior', async () => {
      await assert.rejects(
        async () => schema.create({ role: 'admin' }, { onlyObjectValues: true }),
        /Unsupported validation option `onlyObjectValues`/
      )

      await assert.rejects(
        async () => schema.create({ role: 'admin' }, { mode: 'patch' }),
        /Unsupported validation option `mode`/
      )
    })

    it('operation contracts should reject explicitly undefined fields instead of silently treating them as absent', async () => {
      const { errors } = await schema.patch({ name: undefined })
      assertError(errors, 'name', 'TYPE_CAST_FAILED')
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
  it('should export a mode-aware draft-07 JSON Schema for transport validation', () => {
    const schema = createSchema({
      id: { type: 'id', required: true },
      name: { type: 'string', required: true, minLength: 3, maxLength: 10 },
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

  it('should allow additionalProperties to be configured explicitly', () => {
    const schema = createSchema({ id: { type: 'id' } })
    const transportSchema = schema.toJsonSchema({ additionalProperties: true })

    assert.strictEqual(transportSchema.additionalProperties, true)
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

    it(title, async () => {
      const schema = createSchema({ field: { type, ...options } })
      const { validatedObject, errors } = await schema.create(input)

      if (error) {
        assertError(errors, 'field', error)
      } else {
        assert.strictEqual(Object.keys(errors).length, 0, `Expected no errors but found: ${JSON.stringify(errors)}`)
        assert.deepStrictEqual(validatedObject.field, expected)
      }
    })
  })

  it("type:'serialize' should process an object to a string", async () => {
    const schema = createSchema({ field: { type: 'serialize' } })
    const inputObject = { a: 1, b: 2 }
    const input = { field: inputObject }
    const expected = JSON.stringify(inputObject)
    const { validatedObject, errors } = await schema.create(input)

    assert.strictEqual(Object.keys(errors).length, 0, `Expected no errors but found: ${JSON.stringify(errors)}`)
    assert.strictEqual(validatedObject.field, expected)
  })

  it('type:`serialize` should handle circular references', async () => {
    const schema = createSchema({ field: { type: 'serialize' } })
    const circular = { a: 1 }
    circular.b = circular
    const { validatedObject, errors } = await schema.create({ field: circular })
    assert.strictEqual(Object.keys(errors).length, 0)
    assert.strictEqual(typeof validatedObject.field, 'string')

    const parsed = flatted.parse(validatedObject.field)
    assert.strictEqual(parsed.b, parsed, 'Circular reference was not maintained')
  })
})

describe('4. Core Plugin: Validator Handlers', () => {
  it('`min`/`max` validators should work for numbers, `minLength`/`maxLength` for strings', async () => {
    const schema = createSchema({
      num: { type: 'number', min: 10, max: 20 },
      str: { type: 'string', minLength: 3, maxLength: 5 },
    })

    const { errors: err1 } = await schema.create({ num: 9, str: 'hi' })
    assertError(err1, 'num', 'MIN_VALUE')
    assertError(err1, 'str', 'MIN_LENGTH')
    assert.deepStrictEqual(err1.num.params, { min: 10, actual: 9 })
    assert.deepStrictEqual(err1.str.params, { min: 3, actual: 2 })

    const { errors: err2 } = await schema.create({ num: 21, str: 'hello world' })
    assertError(err2, 'num', 'MAX_VALUE')
    assertError(err2, 'str', 'MAX_LENGTH')
  })

  it('`validator` should work with a custom function (sync and async)', async () => {
    const schema = createSchema({
      syncField: { type: 'string', validator: (val) => val === 'ok' ? undefined : 'Value must be "ok"' },
      asyncField: {
        type: 'string',
        validator: async (val) => {
          await new Promise(r => setTimeout(r, 10))
          return val === 'async_ok' ? undefined : 'Value must be "async_ok"'
        }
      }
    })

    const { errors: err1 } = await schema.create({ syncField: 'not_ok', asyncField: 'not_ok' })
    assertError(err1, 'syncField', 'CUSTOM_VALIDATOR_FAILED')
    assertError(err1, 'asyncField', 'CUSTOM_VALIDATOR_FAILED')

    const { errors: err2 } = await schema.create({ syncField: 'ok', asyncField: 'async_ok' })
    assert.strictEqual(Object.keys(err2).length, 0)
  })

  it('`enum` should enforce membership against the declared enum values', async () => {
    const schema = createSchema({
      status: { type: 'string', enum: ['draft', 'published', 'archived'] }
    })

    const { errors: invalidErrors } = await schema.create({ status: 'deleted' })
    assertError(invalidErrors, 'status', 'ENUM_VALUE')

    const { errors: validErrors } = await schema.create({ status: 'published' })
    assert.strictEqual(Object.keys(validErrors).length, 0)
  })

  it('`uppercase`/`lowercase` should transform strings', async () => {
    const schema = createSchema({
      upper: { type: 'string', uppercase: true },
      lower: { type: 'string', lowercase: true },
    })
    const { validatedObject } = await schema.create({ upper: 'test', lower: 'TEST' })
    assert.strictEqual(validatedObject.upper, 'TEST')
    assert.strictEqual(validatedObject.lower, 'test')
  })

  it('`length` should truncate strings and error on long numbers', async () => {
    const schema = createSchema({
      str: { type: 'string', length: 5 },
      num: { type: 'number', length: 3 }
    })

    const { validatedObject, errors } = await schema.create({ str: '123456789', num: 1234 })
    assert.strictEqual(validatedObject.str, '12345')
    assertError(errors, 'num', 'RANGE_EXCEEDED')
  })

  it('`notEmpty` should fail on empty strings', async () => {
    const schema = createSchema({ field: { type: 'string', notEmpty: true } })
    const { errors } = await schema.create({ field: '' })
    assertError(errors, 'field', 'NOT_EMPTY')
  })
})

describe('5. Extensibility: Custom Plugins', () => {
  it('should allow defining and using a custom plugin', async () => {
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
    const { validatedObject, errors } = await schema.create({
      color: '#FF00AA',
      mood: 'awesome'
    })

    assert.strictEqual(Object.keys(errors).length, 0, 'Custom plugin validation failed')
    assert.strictEqual(validatedObject.color, '#ff00aa')
    assert.strictEqual(validatedObject.mood, 'awesome')

    const { errors: failErrors } = await schema.create({
      color: 'red',
      mood: 'good'
    })

    assertError(failErrors, 'color', 'TYPE_CAST_FAILED')
    assertError(failErrors, 'mood', 'NOT_AWESOME')
  })
})

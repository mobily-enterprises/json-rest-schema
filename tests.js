/**
 * @file Absurdly comprehensive tests for the entire schema validation library.
 * This file is aligned with the final version that uses an object map for errors.
 *
 * To Run:
 * 1. Make sure you are in the project root directory.
 * 2. Run the command: `node --test`
 */

import { test, describe, it, before } from 'node:test';
import assert from 'node:assert';
import { createSchema } from './src/index.js';
import { Schema } from './src/Schema.js';
import * as flatted from 'flatted';

// Helper for asserting that a specific error exists and has the correct code.
function assertError(errors, fieldName, expectedCode) {
    const errorObject = errors[fieldName];
    assert.ok(errorObject, `Expected an error for field '${fieldName}' but found none.`);
    assert.strictEqual(errorObject.code, expectedCode, `For field '${fieldName}', expected error code '${expectedCode}' but got '${errorObject.code}'.`);
}


describe('1. Core API (`createSchema`)', () => {

  it('should export a function `createSchema`', () => {
    assert.strictEqual(typeof createSchema, 'function');
  });

  it('should have `use`, `addType`, and `addValidator` methods on the factory', () => {
    assert.strictEqual(typeof createSchema.use, 'function');
    assert.strictEqual(typeof createSchema.addType, 'function');
    assert.strictEqual(typeof createSchema.addValidator, 'function');
  });

  it('`createSchema(structure)` should return an instance of Schema', () => {
    const mySchema = createSchema({});
    assert.ok(mySchema instanceof Schema, 'Did not return a Schema instance');
  });

  it('should allow adding a type handler and using it', async () => {
      createSchema.addType('custom-string', ctx => `custom-${ctx.value}`);
      const schema = createSchema({ name: { type: 'custom-string' } });
      const { validatedObject } = await schema.validate({ name: 'test' });
      assert.strictEqual(validatedObject.name, 'custom-test');
  });

  it('should allow adding a validator and using it', async () => {
      createSchema.addValidator('must-be-awesome', ctx => {
          if (ctx.value !== 'awesome') {
              ctx.throwParamError('NOT_AWESOME', 'This field must be awesome');
          }
      });
      const schema = createSchema({ framework: { type: 'string', 'must-be-awesome': true }});
      const { errors } = await schema.validate({ framework: 'good' });
      assertError(errors, 'framework', 'NOT_AWESOME');
  });

  it('should throw when adding a non-function type handler', () => {
    assert.throws(() => createSchema.addType('badType', 'not-a-function'), /Type handler for 'badType' must be a function/);
  });

  it('should throw when adding a non-function validator handler', () => {
    assert.throws(() => createSchema.addValidator('badValidator', 'not-a-function'), /Validator handler for 'badValidator' must be a function/);
  });

  it('should throw when using a plugin without an `install` method', () => {
    const badPlugin = {};
    assert.throws(() => createSchema.use(badPlugin), /Plugin must have an install method/);
  });

});

describe('2. Core Validation Logic (`Schema.js`)', () => {
  
  it('should return no errors for a valid object', async () => {
    const schema = createSchema({ name: { type: 'string' } });
    const { errors } = await schema.validate({ name: 'test' });
    assert.strictEqual(Object.keys(errors).length, 0);
  });

  it('should return a `FIELD_NOT_ALLOWED` error for spurious fields', async () => {
    const schema = createSchema({ name: { type: 'string' } });
    const { errors } = await schema.validate({ name: 'test', extra: 'field' });
    assert.strictEqual(Object.keys(errors).length, 1);
    assertError(errors, 'extra', 'FIELD_NOT_ALLOWED');
  });

  it('should correctly handle the `required` validator', async () => {
    const schema = createSchema({ name: { type: 'string', required: true } });
    const { errors } = await schema.validate({});
    assert.strictEqual(Object.keys(errors).length, 1);
    assertError(errors, 'name', 'REQUIRED');
  });

  it('should return a `NOT_NULLABLE` error if a field is null but not allowed to be', async () => {
    const schema = createSchema({ name: { type: 'string' } });
    const { errors } = await schema.validate({ name: null });
    assertError(errors, 'name', 'NOT_NULLABLE');
  });

  it('should allow null if `nullable` is true', async () => {
    const schema = createSchema({ name: { type: 'string', nullable: true } });
    const { errors, validatedObject } = await schema.validate({ name: null });
    assert.strictEqual(Object.keys(errors).length, 0);
    assert.strictEqual(validatedObject.name, null);
  });

  it('should cast empty string to null if `nullOnEmpty` is true', async () => {
    const schema = createSchema({ name: { type: 'string', nullOnEmpty: true } });
    const { errors, validatedObject } = await schema.validate({ name: '' });
    assert.strictEqual(Object.keys(errors).length, 0);
    assert.strictEqual(validatedObject.name, null);
  });

  it('should apply defaultTo values even when the object has validation errors', async () => {
    const schema = createSchema({
      name: { type: 'string', required: true },
      role: { type: 'string', defaultTo: 'user' },
    });
    
    // Case 1: Invalid object (missing required field), defaultTo should still be applied.
    const { validatedObject: invalidObj, errors } = await schema.validate({});
    assert.strictEqual(Object.keys(errors).length, 1);
    assert.strictEqual(invalidObj.role, 'user', "defaultTo should be applied even to invalid objects");
    assert.strictEqual(invalidObj.name, null, "Missing required field should be null");

    // Case 2: Valid object, defaultTo should also be applied.
    const { validatedObject: validObj, errors: validErrors } = await schema.validate({ name: 'test' });
    assert.strictEqual(Object.keys(validErrors).length, 0);
    assert.strictEqual(validObj.role, 'user');
  });

  describe('Validation Options', () => {
    const schema = createSchema({
        name: { type: 'string', required: true, minLength: 3 },
        role: { type: 'string', defaultTo: 'guest' }
    });

    it('`onlyObjectValues`: should only validate fields present in the input object', async () => {
      // `name` is required but not present; should not error because we only check `role`
      const { errors } = await schema.validate({ role: 'admin' }, { onlyObjectValues: true });
      assert.strictEqual(Object.keys(errors).length, 0);
    });

    it('`skipFields`: should completely ignore specified fields', async () => {
      const { errors } = await schema.validate({ name: 'a' }, { skipFields: ['name'] });
      assert.strictEqual(Object.keys(errors).length, 0);
    });

    it('`skipParams`: should skip specific validators on a field', async () => {
      // name: 'a' would fail `minLength: 3`, but we skip it
      const { errors } = await schema.validate({ name: 'a' }, { skipParams: { name: ['minLength'] } });
      assert.strictEqual(Object.keys(errors).length, 0);
    });
  });

  it('`cleanup` method should work correctly', () => {
    const schema = createSchema({
      secret: { type: 'string', isSecret: true },
      public: { type: 'string' }
    });
    const obj = { secret: '123', public: 'abc' };
    const cleaned = schema.cleanup(obj, 'isSecret');
    assert.deepStrictEqual(cleaned, { secret: '123' });
  });

});

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
    { type: 'string', input: { field: undefined }, expected: undefined }, // `_validateField` exits early
    { type: 'string', input: { field: {} }, error: 'TYPE_CAST_FAILED' },
    
    // Number
    { type: 'number', input: { field: '42.5' }, expected: 42.5 },
    { type: 'number', input: { field: '' }, expected: 0 },
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
    { type: 'boolean', input: { field: 'on' }, expected: true },
    { type: 'boolean', input: { field: 'false' }, expected: false },
    { type: 'boolean', input: { field: 1 }, expected: true },
    { type: 'boolean', input: { field: 0 }, expected: false },
    { type: 'boolean', input: { field: 'no' }, options: { stringFalseWhen: 'no' }, expected: false },
    
    // ID
    { type: 'id', input: { field: '123' }, expected: 123 },
    { type: 'id', input: { field: 'id-123' }, error: 'TYPE_CAST_FAILED' },
  ];
  
  testCases.forEach(({ type, input, expected, options = {}, error }) => {
    const title = error 
      ? `type:'${type}' should fail for input: ${JSON.stringify(input.field)}`
      : `type:'${type}' should process input ${JSON.stringify(input.field)} to ${JSON.stringify(expected)}`;

    it(title, async () => {
      const schema = createSchema({ field: { type, ...options } });
      const { validatedObject, errors } = await schema.validate(input);

      if (error) {
        assertError(errors, 'field', error);
      } else {
        assert.strictEqual(Object.keys(errors).length, 0, `Expected no errors but found: ${JSON.stringify(errors)}`);
        assert.deepStrictEqual(validatedObject.field, expected);
      }
    });
  });

  it("type:'serialize' should process an object to a string", async () => {
    const schema = createSchema({ field: { type: 'serialize' } });
    const inputObject = { a: 1, b: 2 };
    const input = { field: inputObject };
    const expected = JSON.stringify(inputObject);
    const { validatedObject, errors } = await schema.validate(input);

    assert.strictEqual(Object.keys(errors).length, 0, `Expected no errors but found: ${JSON.stringify(errors)}`);
    assert.strictEqual(validatedObject.field, expected);
  });

  it('type:`serialize` should handle circular references', async () => {
    const schema = createSchema({ field: { type: 'serialize' } });
    const circular = { a: 1 };
    circular.b = circular;
    const { validatedObject, errors } = await schema.validate({ field: circular });
    assert.strictEqual(Object.keys(errors).length, 0);
    assert.strictEqual(typeof validatedObject.field, 'string');
    
    const parsed = flatted.parse(validatedObject.field);
    assert.strictEqual(parsed.b, parsed, 'Circular reference was not maintained');
  });
});


describe('4. Core Plugin: Validator Handlers', () => {

  it('`min`/`max` validators should work for numbers, `minLength`/`maxLength` for strings', async () => {
    const schema = createSchema({
      num: { type: 'number', min: 10, max: 20 },
      str: { type: 'string', minLength: 3, maxLength: 5 },
    });

    const { errors: err1 } = await schema.validate({ num: 9, str: 'hi' });
    assertError(err1, 'num', 'MIN_VALUE');
    assertError(err1, 'str', 'MIN_LENGTH');
    assert.deepStrictEqual(err1.num.params, { min: 10, actual: 9 });
    assert.deepStrictEqual(err1.str.params, { min: 3, actual: 2 });

    const { errors: err2 } = await schema.validate({ num: 21, str: 'hello world' });
    assertError(err2, 'num', 'MAX_VALUE');
    assertError(err2, 'str', 'MAX_LENGTH');
  });

  it('`validator` should work with a custom function (sync and async)', async () => {
    const schema = createSchema({
      syncField: { type: 'string', validator: (val) => val === 'ok' ? undefined : 'Value must be "ok"' },
      asyncField: { type: 'string', validator: async (val) => {
        await new Promise(r => setTimeout(r, 10));
        return val === 'async_ok' ? undefined : 'Value must be "async_ok"'
      }}
    });
    
    const { errors: err1 } = await schema.validate({ syncField: 'not_ok', asyncField: 'not_ok' });
    assertError(err1, 'syncField', 'CUSTOM_VALIDATOR_FAILED');
    assertError(err1, 'asyncField', 'CUSTOM_VALIDATOR_FAILED');

    const { errors: err2 } = await schema.validate({ syncField: 'ok', asyncField: 'async_ok' });
    assert.strictEqual(Object.keys(err2).length, 0);
  });

  it('`uppercase`/`lowercase` should transform strings', async () => {
    const schema = createSchema({
      upper: { type: 'string', uppercase: true },
      lower: { type: 'string', lowercase: true },
    });
    const { validatedObject } = await schema.validate({ upper: 'test', lower: 'TEST' });
    assert.strictEqual(validatedObject.upper, 'TEST');
    assert.strictEqual(validatedObject.lower, 'test');
  });

  it('`length` should truncate strings and error on long numbers', async () => {
    const schema = createSchema({
      str: { type: 'string', length: 5 },
      num: { type: 'number', length: 3 }
    });
    
    const { validatedObject, errors } = await schema.validate({ str: '123456789', num: 1234 });
    assert.strictEqual(validatedObject.str, '12345');
    assertError(errors, 'num', 'RANGE_EXCEEDED');
  });

  it('`notEmpty` should fail on empty strings', async () => {
    const schema = createSchema({ field: { type: 'string', notEmpty: true } });
    const { errors } = await schema.validate({ field: '' });
    assertError(errors, 'field', 'NOT_EMPTY');
  });
});

describe('5. Extensibility: Custom Plugins', () => {

  it('should allow defining and using a custom plugin', async () => {
    // 1. Define the plugin
    const myPlugin = {
      install(api) {
        api.addType('hexColor', (ctx) => {
          if (typeof ctx.value !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(ctx.value)) {
            ctx.throwTypeError();
          }
          return ctx.value.toLowerCase();
        });
        api.addValidator('isAwesome', (ctx) => {
          if (ctx.parameterValue === true && ctx.value !== 'awesome') {
            ctx.throwParamError('NOT_AWESOME', 'This field must be awesome');
          }
        });
      }
    };

    // 2. Install it via `use()` on the global factory
    createSchema.use(myPlugin);

    // 3. Use the new rules in a schema
    const schema = createSchema({
      color: { type: 'hexColor' },
      mood: { type: 'string', isAwesome: true },
    });

    // 4. Test it
    const { validatedObject, errors } = await schema.validate({
      color: '#FF00AA',
      mood: 'awesome'
    });

    assert.strictEqual(Object.keys(errors).length, 0, 'Custom plugin validation failed');
    assert.strictEqual(validatedObject.color, '#ff00aa');
    assert.strictEqual(validatedObject.mood, 'awesome');

    const { errors: failErrors } = await schema.validate({
      color: 'red',
      mood: 'good'
    });

    assertError(failErrors, 'color', 'TYPE_CAST_FAILED');
    assertError(failErrors, 'mood', 'NOT_AWESOME');
  });
});

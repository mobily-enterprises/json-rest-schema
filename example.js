/**
 * @file examples.js
 * A comprehensive demonstration of all built-in validation types and rules.
 *
 * To Run:
 * 1. Ensure you have the full project structure (src/, package.json).
 * 2. Run `npm install` to get dependencies.
 * 3. Run `node examples.js` in your terminal.
 */

import { createSchema } from './src/index.js'
import * as flatted from 'flatted'

// --- A schema that uses every built-in type and validator ---
const comprehensiveSchema = createSchema({
  // 'string' with various validators
  username: { type: 'string', required: true, minLength: 3, maxLength: 20, lowercase: true },
  fullName: { type: 'string', uppercase: true, defaultTo: 'N/A' },
  description: { type: 'string', length: 10 }, // 'length' truncates strings

  // 'number' with validators
  age: { type: 'number', required: true, min: 18, max: 100 },
  score: { type: 'number', defaultTo: 0 },

  // 'id' type for numeric identifiers from strings
  userId: { type: 'id', required: true },

  // 'boolean' type demonstrating string casting
  isActive: { type: 'boolean', defaultTo: false },
  hasAgreed: { type: 'boolean', required: true, validator: (val) => val === true ? undefined : 'You must agree to the terms.' },

  // 'date' and 'dateTime' types
  birthDate: { type: 'date', required: true },
  lastLogin: { type: 'dateTime', nullable: true },

  // 'array' type for handling lists
  tags: { type: 'array', notEmpty: true, defaultTo: ['general'] },

  // Demonstrating 'notEmpty' vs 'nullOnEmpty'
  optionalComment: { type: 'string', nullOnEmpty: true }, // An empty string becomes null
  requiredComment: { type: 'string', notEmpty: true }, // An empty string is an error

  // 'serialize' for complex/circular objects
  metadata: { type: 'serialize' },

  // 'none' type passes value through without changes
  unvalidatedField: { type: 'none' },

  // Note: A field not in the schema will be flagged as an error if present in the input.
})

// --- Input Data Sets ---

// 1. Data designed to fail every possible validation rule
const invalidInput = {
  username: 'Bo', // Fails minLength
  // 'fullName' is missing to test its defaultTo value later (only on valid runs)
  description: 'This description is much too long and will be cut short', // Will be truncated
  age: 17, // Fails min value
  userId: 'not-a-number', // Fails 'id' type casting
  hasAgreed: false, // Fails custom 'validator' function
  birthDate: 'invalid-date-format', // Fails 'date' type casting
  lastLogin: null, // This is actually VALID because of 'nullable: true'
  tags: [], // Fails 'notEmpty'
  optionalComment: '', // Will be cast to null, which is valid
  requiredComment: '', // Fails 'notEmpty'
  unvalidatedField: { a: 1, b: 2 }, // Will pass through 'none' type unchanged
  extraField: 'This field is not in the schema' // Will be flagged as an error
}

// 2. Data designed to pass validation and showcase casting/defaultTo
const validInput = {
  username: '  VALID_USER   ', // Will be trimmed and lowercased
  description: 'A short note that is okay.', // Will not be truncated
  age: '42', // Will be cast to number
  userId: '12345', // Will be cast to number
  isActive: 'on', // Will be cast to boolean true
  hasAgreed: true,
  birthDate: '1980-05-15T12:00:00Z', // Will be cast to 'YYYY-MM-DD'
  lastLogin: Date.now(), // Will be cast to 'YYYY-MM-DD HH:MM:SS'
  tags: 'single-tag', // Will be cast to an array: ['single-tag']
  requiredComment: 'This is a valid comment.',
  // 'optionalComment' is missing, which is valid
  // 'metadata' will have a circular reference to test serialization
  unvalidatedField: 12345,
}
const circularRef = { name: 'metadata' }
circularRef.self = circularRef
validInput.metadata = circularRef

const transportSchemaExample = createSchema({
  id: { type: 'id', required: true },
  email: { type: 'string', required: true, notEmpty: true },
  age: { type: 'number', min: 18, defaultTo: 18 },
  status: { type: 'string', enum: ['draft', 'published'] },
  nickname: { type: 'string', nullOnEmpty: true },
  publishedAt: { type: 'dateTime', temporalPrecision: 3 }
})

// --- Main Execution ---

function runComprehensiveExample () {
  console.log('--- COMPREHENSIVE VALIDATION EXAMPLE ---')
  console.log('Schemas are synchronous shared contracts. Run DB/network/business checks after validation in higher layers.')

  // --- Run 1: Invalid Data ---
  console.log('\n--- 1. Testing Invalid Data to Showcase Errors ---')
  console.log('Input:', invalidInput)

  const { validatedObject: invalidResult, errors: invalidErrors } = comprehensiveSchema.create(invalidInput)

  console.log('\nValidated Object (after attempting validation):', invalidResult)
  console.log('\nValidation Errors Found:')

  for (const fieldName in invalidErrors) {
    const err = invalidErrors[fieldName]
    const paramsString = Object.keys(err.params || {}).length > 0 ? `, Params: ${JSON.stringify(err.params)}` : ''
    console.log(`  - Field: '${fieldName}', Code: '${err.code}', Message: ${err.message}${paramsString}`)
  }
  console.assert(Object.keys(invalidErrors).length > 0, 'Test Failed: Invalid data should produce errors.')

  // --- Run 2: Valid Data ---
  console.log('\n\n--- 2. Testing Valid Data to Showcase Casting and Defaults ---')

  // We run this with create semantics so defaultTo is applied
  const { validatedObject: validResult, errors: validErrors } = comprehensiveSchema.create(validInput)

  console.log('Input:', validInput)
  console.log('\nValidated Object (after successful validation):', validResult)
  console.log('\nValidation Errors:', Object.keys(validErrors).length > 0 ? validErrors : 'None')
  console.assert(Object.keys(validErrors).length === 0, 'Test Failed: Valid data should produce no errors.')

  console.log('\n--- Verifying Specific Transformations ---')
  console.log('Username cast to lowercase:', validResult.username)
  console.log('Full name applied defaultTo:', validResult.fullName)
  console.log('Age cast to number:', validResult.age)
  console.log('\'isActive\' cast from "on" to boolean:', validResult.isActive)
  console.log('\'tags\' cast from string to array:', validResult.tags)
  console.log('Serialized metadata is a string:', typeof validResult.metadata === 'string')
  const restored = flatted.parse(validResult.metadata)
  console.log('Circular reference in restored metadata is intact:', restored.self === restored)

  console.log('\n--- 3. Transport JSON Schema Export ---')
  console.log('Create schema export:', JSON.stringify(transportSchemaExample.toJsonSchema(), null, 2))
  console.log('Patch schema export:', JSON.stringify(transportSchemaExample.toJsonSchema({ mode: 'patch' }), null, 2))
}

runComprehensiveExample()

/**
 * @file example.js
 * A broad demonstration of built-in validation types, rules, operations, and adapters.
 *
 * To Run:
 * 1. Ensure you have the full project structure (src/, package.json).
 * 2. Run `npm install` to get dependencies.
 * 3. Run `node example.js` in your terminal.
 */

import { createSchema, flattenErrors, getError, hasError, nestErrors } from './src/index.js'
import { jsonRestSchemaResolver } from './src/adapters/react-hook-form.js'
import { toVeeValidateSchema } from './src/adapters/vee-validate.js'
import { useSchemaField, useSchemaForm } from './src/adapters/vue.js'
import { createVuetifyRule, fieldProps, getVuetifyErrorMessages } from './src/adapters/vuetify.js'
import * as flatted from 'flatted'

// --- A schema that demonstrates common built-in types and validators ---
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

  // JSON-native temporal strings and explicit epoch units
  birthDate: { type: 'date', required: true },
  lastLogin: { type: 'dateTime', nullable: true },
  dailyReminderTime: { type: 'time' },
  lastLoginEpochMilliseconds: { type: 'epochMilliseconds' },
  sessionStartedEpochSeconds: { type: 'epochSeconds' },

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

// 1. Data designed to demonstrate several validation failures
const invalidInput = {
  username: 'Bo', // Fails minLength
  // 'fullName' is missing, so its default is still applied alongside these errors
  description: 'This description is much too long and will be cut short', // Will be truncated
  age: 17, // Fails min value
  userId: 'not-a-number', // Fails 'id' type casting
  hasAgreed: false, // Fails custom 'validator' function
  birthDate: 'invalid-date-format', // Fails 'date' type casting
  lastLogin: null, // This is actually VALID because of 'nullable: true'
  dailyReminderTime: '25:00', // Fails the time range check
  lastLoginEpochMilliseconds: '1.5', // Epoch values must be integers
  sessionStartedEpochSeconds: '01', // Canonical integer strings cannot have leading zeroes
  tags: [], // Fails 'notEmpty'
  optionalComment: '', // Will be cast to null, which is valid
  requiredComment: '', // Fails 'notEmpty'
  unvalidatedField: { a: 1, b: 2 }, // Will pass through 'none' type unchanged
  extraField: 'This field is not in the schema' // Will be flagged as an error
}

// 2. Data designed to pass validation and showcase casting/defaultTo
const validInput = {
  username: '  VALID_USER   ', // Will be trimmed and lowercased
  description: 'Short note', // Already within the configured length
  age: '42', // Will be cast to number
  userId: '12345', // Will be cast to number
  isActive: 'on', // Will be cast to boolean true
  hasAgreed: true,
  birthDate: '1980-05-15', // Calendar dates remain exact YYYY-MM-DD strings
  lastLogin: '2025-01-15T08:30:00Z', // Datetimes require seconds and an explicit timezone
  dailyReminderTime: '09:30:00.123', // Times are offset-free wall-clock strings
  lastLoginEpochMilliseconds: '1736929800000', // Canonical strings are cast to numbers
  sessionStartedEpochSeconds: '1736929800',
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
  label: { type: 'string', required: true }
})

const nestedContractExample = createSchema({
  workspace: {
    type: 'object',
    required: true,
    schema: workspaceSummarySchema
  },
  settings: {
    type: 'object',
    required: true,
    schema: workspaceSettingsSchema
  },
  roles: {
    type: 'array',
    required: true,
    items: roleSchema
  },
  assignableRoleIds: {
    type: 'array',
    items: { type: 'string', minLength: 1 }
  },
  metadata: {
    type: 'object',
    additionalProperties: true
  }
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
  console.log('Birth date preserved as a string:', validResult.birthDate)
  console.log('Last login preserved as an RFC 3339 string:', validResult.lastLogin)
  console.log('Reminder time preserved as a string:', validResult.dailyReminderTime)
  console.log('Epoch milliseconds cast to a number:', validResult.lastLoginEpochMilliseconds)
  console.log('Epoch seconds cast to a number:', validResult.sessionStartedEpochSeconds)
  console.log('Serialized metadata is a string:', typeof validResult.metadata === 'string')
  const restored = flatted.parse(validResult.metadata)
  console.log('Circular reference in restored metadata is intact:', restored.self === restored)

  console.log('\n--- 3. Custom Operation Example ---')
  console.log('Upsert result:', transportSchemaExample.upsert({ status: 'draft' }))

  console.log('\n--- 4. Nested Contract Example ---')
  const nestedInput = {
    workspace: {
      id: '42',
      slug: '  main-workspace  ',
      ownerUserId: '7'
    },
    settings: {
      invitesEnabled: 'yes'
    },
    roles: [
      { id: 'admin', label: '  Admin  ' },
      { id: 'member', label: 'Member' }
    ],
    assignableRoleIds: [' admin ', 'member'],
    metadata: {
      theme: 'dark',
      betaFlags: {
        collaboration: true
      }
    }
  }

  const nestedResult = nestedContractExample.create(nestedInput)
  console.log('Nested create result:', nestedResult)
  console.log('Nested patch result:', nestedContractExample.patch({
    workspace: {
      slug: '  sandbox  '
    }
  }))

  const nestedInvalidResult = nestedContractExample.create({
    workspace: {
      id: '42',
      slug: 'ok',
      extra: true
    },
    settings: {},
    roles: [
      { id: 'admin' }
    ],
    assignableRoleIds: ['owner', '   '],
    metadata: {
      theme: 'dark'
    }
  })

  console.log('\nNested invalid result with dotted-path errors:', nestedInvalidResult)

  console.log('\n--- 5. Error Helper Example ---')
  console.log('getError(workspace.slug):', getError(nestedInvalidResult.errors, 'workspace.slug'))
  console.log('hasError(roles.0.label):', hasError(nestedInvalidResult.errors, 'roles.0.label'))
  const nestedUiErrors = nestErrors(nestedInvalidResult.errors)
  console.log('nestErrors(errors):', nestedUiErrors)
  console.log('flattenErrors(nestedUiErrors):', flattenErrors(nestedUiErrors))

  console.log('\n--- 6. Path-Scoped Validation Example ---')
  console.log('validateAt(workspace.slug):', nestedContractExample.validateAt('workspace.slug', {
    workspace: {
      slug: '  sandbox  '
    }
  }, {
    operation: 'create'
  }))

  console.log('validatePaths([workspace.slug, metadata]):', nestedContractExample.validatePaths([
    'workspace.slug',
    'metadata'
  ], {
    workspace: {
      slug: '  focused  '
    },
    metadata: {
      theme: 'dark'
    }
  }, {
    operation: 'patch'
  }))

  console.log('\n--- 7. React Hook Form Resolver Example ---')
  const reactHookFormResolver = jsonRestSchemaResolver(transportSchemaExample)
  console.log('Resolver submit result:', reactHookFormResolver(
    {
      id: '42',
      email: 'alex@example.com',
      status: 'draft'
    },
    undefined,
    {
      criteriaMode: 'firstError',
      fields: {
        id: { ref: null },
        email: { ref: null },
        status: { ref: null }
      },
      shouldUseNativeValidation: false
    }
  ))

  console.log('\n--- 8. Vue + Vuetify Adapter Example ---')
  const vueValues = {
    value: {
      workspace: {
        slug: '  sandbox  '
      }
    }
  }
  const vueForm = useSchemaForm(nestedContractExample, {
    values: vueValues,
    operation: 'patch'
  })
  const slugField = useSchemaField(vueForm, 'workspace.slug')
  const slugProps = fieldProps(vueForm, 'workspace.slug', {
    includeErrorMessages: true
  })
  const slugRule = createVuetifyRule(vueForm, 'workspace.slug')

  console.log('Vue field validate result:', slugField.validate())
  console.log('Vue field messages:', slugField.messages)
  console.log('Vuetify rule("x"):', slugRule('x'))
  console.log('Vuetify error messages after invalid rule:', getVuetifyErrorMessages(vueForm, 'workspace.slug'))
  console.log('Vuetify fieldProps.errorMessages:', slugProps.errorMessages)

  vueValues.value.workspace.slug = '  release  '
  const submitVueForm = vueForm.submit(validatedObject => ({ saved: validatedObject }))
  console.log('Vue submit result:', submitVueForm('save-click'))

  console.log('\n--- 9. VeeValidate Bridge Example ---')
  const veeValidateSchema = toVeeValidateSchema(transportSchemaExample)
  console.log('VeeValidate success result:', veeValidateSchema['~standard'].validate({
    id: '42',
    email: ' alex@example.com ',
    status: 'draft'
  }))
  console.log('VeeValidate failure result:', veeValidateSchema['~standard'].validate({
    id: '0',
    status: 'draft'
  }))

  console.log('\n--- 10. Transport JSON Schema Export ---')
  console.log('Create schema export:', JSON.stringify(transportSchemaExample.toJsonSchema(), null, 2))
  console.log('Patch schema export:', JSON.stringify(transportSchemaExample.toJsonSchema({ operation: 'patch' }), null, 2))
  console.log('Upsert schema export:', JSON.stringify(transportSchemaExample.toJsonSchema({ operation: 'upsert' }), null, 2))
  console.log('Nested schema export:', JSON.stringify(nestedContractExample.toJsonSchema(), null, 2))
}

runComprehensiveExample()

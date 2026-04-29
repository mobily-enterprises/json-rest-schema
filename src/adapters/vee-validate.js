/**
 * @file VeeValidate v5 bridge for json-rest-schema.
 *
 * VeeValidate v5 accepts Standard Schema-compatible validators as
 * `validationSchema`. This module returns a small Standard Schema wrapper
 * around a `json-rest-schema` Schema instance.
 */

import { Schema } from '../core/Schema.js'
import { isPlainObject, pathToSegments } from '../utils/adapter-helpers.js'

function resolveOperationName (schema, schemaOptions = {}) {
  const operationName = schemaOptions.operation ?? schemaOptions.mode ?? 'create'

  if (
    Object.hasOwn(schemaOptions, 'operation') &&
    Object.hasOwn(schemaOptions, 'mode') &&
    schemaOptions.operation !== schemaOptions.mode
  ) {
    throw new Error('VeeValidate schema options `operation` and `mode` must match when both are provided.')
  }

  if (!schema.operations[operationName]) {
    throw new Error(`Unknown operation "${operationName}".`)
  }

  return operationName
}

function buildSchemaValidationOptions (schemaOptions = {}) {
  const validationOptions = { ...schemaOptions }
  delete validationOptions.operation
  delete validationOptions.mode
  return validationOptions
}

function toStandardIssues (errors) {
  return Object.values(errors).map(error => ({
    message: error.message,
    path: pathToSegments(error.field)
  }))
}

export function toVeeValidateSchema (schema, schemaOptions = {}) {
  if (!(schema instanceof Schema)) {
    throw new Error('toVeeValidateSchema() expects a Schema instance.')
  }

  const operationName = resolveOperationName(schema, schemaOptions)
  const validationOptions = buildSchemaValidationOptions(schemaOptions)

  return {
    '~standard': {
      version: 1,
      vendor: 'json-rest-schema',

      validate (value) {
        if (!isPlainObject(value)) {
          return {
            issues: [
              {
                message: 'Validation input must be a plain object.'
              }
            ]
          }
        }

        const result = schema.validateWith(operationName, value, validationOptions)

        if (Object.keys(result.errors).length === 0) {
          return { value: result.validatedObject }
        }

        return {
          issues: toStandardIssues(result.errors)
        }
      }
    }
  }
}

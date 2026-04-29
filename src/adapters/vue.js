/**
 * @file Vue-friendly form helpers for json-rest-schema.
 *
 * This module deliberately avoids importing Vue directly. It works with plain
 * objects, Vue reactive proxies, or simple ref-like `{ value }` containers that
 * the caller already owns.
 */

import { Schema } from '../core/Schema.js'
import { getError, nestErrors } from '../utils/error-helpers.js'
import {
  createStateBox,
  getNestedValue,
  normalizeFieldPath,
  readSourceValue,
  replaceContainerValue,
  setNestedValue,
  uniqueNormalizedPaths
} from '../utils/adapter-helpers.js'

function resolveOperationName (schema, schemaOptions = {}) {
  const operationName = schemaOptions.operation ?? schemaOptions.mode ?? 'create'

  if (
    Object.hasOwn(schemaOptions, 'operation') &&
    Object.hasOwn(schemaOptions, 'mode') &&
    schemaOptions.operation !== schemaOptions.mode
  ) {
    throw new Error('Vue form options `operation` and `mode` must match when both are provided.')
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

function pickSchemaOptions (options = {}) {
  const pickedOptions = {}

  if (Object.hasOwn(options, 'operation')) {
    pickedOptions.operation = options.operation
  }

  if (Object.hasOwn(options, 'mode')) {
    pickedOptions.mode = options.mode
  }

  if (Object.hasOwn(options, 'skipFields')) {
    pickedOptions.skipFields = options.skipFields
  }

  if (Object.hasOwn(options, 'skipParams')) {
    pickedOptions.skipParams = options.skipParams
  }

  return pickedOptions
}

function createEmptyValuesRoot () {
  return {}
}

function ensurePlainObjectValues (values) {
  return values === undefined ? createEmptyValuesRoot() : values
}

function buildPathMatcher (path) {
  return candidatePath =>
    candidatePath === path ||
    candidatePath.startsWith(`${path}.`) ||
    path.startsWith(`${candidatePath}.`)
}

function clearSelectedErrors (errors, selectedPaths) {
  const nextErrors = { ...errors }
  const matchers = selectedPaths.map(path => buildPathMatcher(path))

  for (const path of Object.keys(nextErrors)) {
    if (matchers.some(matchesPath => matchesPath(path))) {
      delete nextErrors[path]
    }
  }

  return nextErrors
}

function mergeSelectedErrors (existingErrors, selectedPaths, nextErrors) {
  return {
    ...clearSelectedErrors(existingErrors, selectedPaths),
    ...nextErrors
  }
}

function getRelevantError (errors, path) {
  const normalizedPath = normalizeFieldPath(path)

  if (normalizedPath === '') return undefined

  const exactError = getError(errors, normalizedPath)
  if (exactError) return exactError

  const segments = normalizedPath.split('.')

  while (segments.length > 1) {
    segments.pop()
    const parentPath = segments.join('.')
    const parentError = getError(errors, parentPath)

    if (parentError) {
      return parentError
    }
  }

  return undefined
}

function writeResultState (state, result) {
  replaceContainerValue(state, result)
}

function createFormValidationResult (form, result, errors) {
  writeResultState(form._state.lastResult, result)
  replaceContainerValue(form._state.errors, errors)
  return result
}

function resolveFormValues (form, overrideValues) {
  const values = readSourceValue(overrideValues ?? form._state.values)
  return ensurePlainObjectValues(values)
}

function assertSchema (schema) {
  if (!(schema instanceof Schema)) {
    throw new Error('useSchemaForm() expects a Schema instance.')
  }
}

function assertForm (form) {
  if (!form || typeof form.validate !== 'function' || typeof form.validateField !== 'function') {
    throw new Error('useSchemaField() expects a form object returned by useSchemaForm().')
  }
}

function assertPath (path) {
  if (typeof path !== 'string' || normalizeFieldPath(path) === '') {
    throw new Error('Field path must be a non-empty string.')
  }
}

function validateSelectedPaths (form, paths, overrideOptions = {}) {
  const selectedPaths = uniqueNormalizedPaths(paths)

  if (selectedPaths.length === 0) {
    throw new Error('validateFields() expects a non-empty array of field paths.')
  }

  const schemaOptions = {
    ...form._state.schemaOptions,
    ...pickSchemaOptions(overrideOptions)
  }
  const operationName = resolveOperationName(form.schema, schemaOptions)
  const validationOptions = buildSchemaValidationOptions(schemaOptions)
  const currentValues = resolveFormValues(form, overrideOptions.values)
  const result = form.schema.validatePaths(selectedPaths, currentValues, {
    ...validationOptions,
    operation: operationName
  })
  const mergedErrors = mergeSelectedErrors(form.errors, selectedPaths, result.errors)

  return createFormValidationResult(form, result, mergedErrors)
}

export function useSchemaForm (schema, options = {}) {
  assertSchema(schema)

  if (!Object.hasOwn(options, 'values')) {
    throw new Error('useSchemaForm() requires a `values` option.')
  }

  const form = {
    schema,
    _state: {
      values: options.values,
      errors: options.errors ?? createStateBox({}),
      lastResult: options.lastResult ?? createStateBox(null),
      schemaOptions: pickSchemaOptions(options)
    },

    validate (overrideOptions = {}) {
      const schemaOptions = {
        ...this._state.schemaOptions,
        ...pickSchemaOptions(overrideOptions)
      }
      const operationName = resolveOperationName(this.schema, schemaOptions)
      const validationOptions = buildSchemaValidationOptions(schemaOptions)
      const currentValues = resolveFormValues(this, overrideOptions.values)
      const result = this.schema.validateWith(operationName, currentValues, validationOptions)

      return createFormValidationResult(this, result, result.errors)
    },

    validateField (path, overrideOptions = {}) {
      assertPath(path)
      return validateSelectedPaths(this, [path], overrideOptions)
    },

    validateFields (paths, overrideOptions = {}) {
      return validateSelectedPaths(this, paths, overrideOptions)
    },

    clearErrors (paths) {
      if (paths === undefined) {
        replaceContainerValue(this._state.errors, {})
        return
      }

      const selectedPaths = Array.isArray(paths) ? uniqueNormalizedPaths(paths) : [normalizeFieldPath(paths)]
      replaceContainerValue(this._state.errors, clearSelectedErrors(this.errors, selectedPaths))
    },

    setErrors (errors) {
      replaceContainerValue(this._state.errors, errors ?? {})
    },

    submit (handler, overrideOptions = {}) {
      if (typeof handler !== 'function') {
        throw new Error('submit() expects a handler function.')
      }

      return (...args) => {
        const result = this.validate(overrideOptions)

        if (Object.keys(result.errors).length > 0) {
          return result
        }

        return handler(result.validatedObject, result, ...args)
      }
    },

    getError (path) {
      return getRelevantError(this.errors, path)
    },

    hasError (path) {
      return !!this.getError(path)
    },

    getErrorMessages (path) {
      const error = this.getError(path)
      return error ? [error.message] : []
    },

    field (path) {
      return useSchemaField(this, path)
    },

    get values () {
      return readSourceValue(this._state.values)
    },

    get errors () {
      return readSourceValue(this._state.errors) ?? {}
    },

    get nestedErrors () {
      return nestErrors(this.errors)
    },

    get hasErrors () {
      return Object.keys(this.errors).length > 0
    },

    get lastResult () {
      return readSourceValue(this._state.lastResult)
    }
  }

  return form
}

export function useSchemaField (form, path) {
  assertForm(form)
  assertPath(path)

  const normalizedPath = normalizeFieldPath(path)

  return {
    path: normalizedPath,

    validate (overrideOptions = {}) {
      return form.validateField(normalizedPath, overrideOptions)
    },

    clearError () {
      form.clearErrors(normalizedPath)
    },

    setValue (value) {
      const currentValues = form.values

      if (typeof form._state.values === 'function') {
        throw new Error('useSchemaField().setValue() cannot write through a getter-only values source.')
      }

      if (currentValues === undefined || currentValues === null || typeof currentValues !== 'object') {
        const nextValues = createEmptyValuesRoot()
        setNestedValue(nextValues, normalizedPath, value)
        replaceContainerValue(form._state.values, nextValues)
        return
      }

      setNestedValue(currentValues, normalizedPath, value)
    },

    get value () {
      return getNestedValue(form.values, normalizedPath)
    },

    get error () {
      return form.getError(normalizedPath)
    },

    get hasError () {
      return form.hasError(normalizedPath)
    },

    get message () {
      return this.error?.message
    },

    get messages () {
      return form.getErrorMessages(normalizedPath)
    }
  }
}

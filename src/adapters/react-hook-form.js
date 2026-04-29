/**
 * @file React Hook Form resolver adapter for json-rest-schema.
 */

import { Schema } from '../core/Schema.js'

function isPlainObject (value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function cloneValue (value) {
  if (Array.isArray(value)) {
    return value.map(item => cloneValue(item))
  }

  if (isPlainObject(value)) {
    const clonedObject = {}

    for (const [key, nestedValue] of Object.entries(value)) {
      clonedObject[key] = cloneValue(nestedValue)
    }

    return clonedObject
  }

  return value
}

function mergeValues (target, source) {
  if (Array.isArray(source)) {
    const output = Array.isArray(target) ? target : []

    for (const indexKey of Object.keys(source)) {
      const index = Number(indexKey)
      output[index] = mergeValues(output[index], source[index])
    }

    return output
  }

  if (isPlainObject(source)) {
    const output = isPlainObject(target) ? target : {}

    for (const [key, nestedValue] of Object.entries(source)) {
      output[key] = mergeValues(output[key], nestedValue)
    }

    return output
  }

  return source
}

function normalizeFieldPath (path) {
  if (typeof path !== 'string') return path

  const normalizedPath = path
    .replace(/\[(.+?)\]/g, '.$1')
    .replace(/^\.+/, '')
    .replace(/\.+/g, '.')
    .replace(/\.$/, '')

  return normalizedPath
}

function uniqueNormalizedPaths (paths = []) {
  return [...new Set(
    paths
      .map(path => normalizeFieldPath(path))
      .filter(path => typeof path === 'string' && path !== '')
  )]
}

function escapePathForRegExp (path) {
  return path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function isNameInFieldArray (names, path) {
  const escapedPath = escapePathForRegExp(path)
  return names.some(name => name.match(`^${escapedPath}\\.\\d+`))
}

function createContainer (nextSegment) {
  return /^[0-9]+$/.test(nextSegment) ? [] : {}
}

function setNestedValue (target, path, value) {
  const segments = path.split('.')
  let currentNode = target

  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index]
    const isLast = index === segments.length - 1

    if (isLast) {
      currentNode[segment] = value
      return
    }

    if (currentNode[segment] === undefined) {
      currentNode[segment] = createContainer(segments[index + 1])
    }

    currentNode = currentNode[segment]
  }
}

function getNestedValue (target, path) {
  const segments = path.split('.')
  let currentNode = target

  for (const segment of segments) {
    if (currentNode === null || currentNode === undefined) return undefined
    if (typeof currentNode !== 'object') return undefined
    if (!Object.hasOwn(currentNode, segment)) return undefined
    currentNode = currentNode[segment]
  }

  return currentNode
}

function mapFieldsByNormalizedPath (fields = {}) {
  const mappedFields = {}

  for (const [path, field] of Object.entries(fields)) {
    const normalizedPath = normalizeFieldPath(path)
    if (normalizedPath === '') continue
    mappedFields[normalizedPath] = field
  }

  return mappedFields
}

function setCustomValidityForRef (ref, message) {
  if (!ref || typeof ref.setCustomValidity !== 'function' || typeof ref.reportValidity !== 'function') {
    return
  }

  ref.setCustomValidity(message)
  ref.reportValidity()
}

function applyNativeValidation (flatErrors, options) {
  const fieldsByPath = mapFieldsByNormalizedPath(options.fields)

  for (const [fieldPath, field] of Object.entries(fieldsByPath)) {
    const message = flatErrors[fieldPath]?.message ?? ''

    if (field.ref) {
      setCustomValidityForRef(field.ref, message)
      continue
    }

    if (Array.isArray(field.refs)) {
      field.refs.forEach(ref => setCustomValidityForRef(ref, message))
    }
  }
}

function createReactHookFormFieldError (error, ref, criteriaMode) {
  const fieldError = {
    type: error.code,
    message: error.message,
    ref,
    code: error.code,
    params: error.params
  }

  if (criteriaMode === 'all') {
    fieldError.types = { [error.code]: error.message }
  }

  return fieldError
}

function toReactHookFormErrors (flatErrors, options) {
  const normalizedNames = uniqueNormalizedPaths(options.names ?? Object.keys(flatErrors))
  const fieldsByPath = mapFieldsByNormalizedPath(options.fields)
  const nestedErrors = {}

  for (const [path, error] of Object.entries(flatErrors)) {
    const reactHookFormError = createReactHookFormFieldError(
      error,
      fieldsByPath[path]?.ref,
      options.criteriaMode
    )

    if (isNameInFieldArray(normalizedNames, path)) {
      const fieldArrayErrors = { ...(getNestedValue(nestedErrors, path) ?? {}) }
      setNestedValue(fieldArrayErrors, 'root', reactHookFormError)
      setNestedValue(nestedErrors, path, fieldArrayErrors)
      continue
    }

    setNestedValue(nestedErrors, path, reactHookFormError)
  }

  return nestedErrors
}

function resolveOperationName (schema, schemaOptions = {}) {
  const operationName = schemaOptions.operation ?? schemaOptions.mode ?? 'create'

  if (
    Object.hasOwn(schemaOptions, 'operation') &&
    Object.hasOwn(schemaOptions, 'mode') &&
    schemaOptions.operation !== schemaOptions.mode
  ) {
    throw new Error('Resolver schema options `operation` and `mode` must match when both are provided.')
  }

  if (!schema.operations[operationName]) {
    throw new Error(`Unknown operation "${operationName}".`)
  }

  return operationName
}

function buildSchemaValidationOptions (schemaOptions) {
  const validationOptions = { ...schemaOptions }
  delete validationOptions.operation
  delete validationOptions.mode
  return validationOptions
}

function shouldValidateSelectedPaths (selectedPaths, options) {
  if (selectedPaths.length === 0) return false

  const registeredPaths = uniqueNormalizedPaths(Object.keys(options.fields ?? {}))
  if (registeredPaths.length === 0) return false
  if (selectedPaths.length !== registeredPaths.length) return true

  const registeredSet = new Set(registeredPaths)
  return selectedPaths.some(path => !registeredSet.has(path))
}

function buildSuccessValues (values, validationResult, shouldUseSelectedPaths, resolverOptions) {
  if (resolverOptions.raw === true) {
    return cloneValue(values)
  }

  if (!shouldUseSelectedPaths) {
    return validationResult.validatedObject
  }

  if (resolverOptions.normalizeOnFieldValidation === true) {
    return mergeValues(cloneValue(values), validationResult.validatedObject)
  }

  return cloneValue(values)
}

/**
 * Creates a React Hook Form resolver for a json-rest-schema Schema instance.
 *
 * @param {Schema} schema
 * @param {{operation?: string, mode?: string, skipFields?: string[], skipParams?: object}} [schemaOptions={}]
 * @param {{raw?: boolean, normalizeOnFieldValidation?: boolean}} [resolverOptions={}]
 * @returns {(values: object, context: any, options: object) => {values: object, errors: object}}
 */
export function jsonRestSchemaResolver (schema, schemaOptions = {}, resolverOptions = {}) {
  if (!(schema instanceof Schema)) {
    throw new Error('jsonRestSchemaResolver() expects a Schema instance.')
  }

  if (typeof resolverOptions !== 'object' || resolverOptions === null || Array.isArray(resolverOptions)) {
    throw new Error('jsonRestSchemaResolver() resolver options must be an object.')
  }

  if (resolverOptions.raw !== undefined && typeof resolverOptions.raw !== 'boolean') {
    throw new Error('jsonRestSchemaResolver() resolver option `raw` must be a boolean.')
  }

  if (
    resolverOptions.normalizeOnFieldValidation !== undefined &&
    typeof resolverOptions.normalizeOnFieldValidation !== 'boolean'
  ) {
    throw new Error('jsonRestSchemaResolver() resolver option `normalizeOnFieldValidation` must be a boolean.')
  }

  const operationName = resolveOperationName(schema, schemaOptions)
  const validationOptions = buildSchemaValidationOptions(schemaOptions)

  return (values, _context, options) => {
    const selectedPaths = uniqueNormalizedPaths(options.names)
    const useSelectedPaths = shouldValidateSelectedPaths(selectedPaths, options)

    const validationResult = useSelectedPaths
      ? schema.validatePaths(selectedPaths, values, { ...validationOptions, operation: operationName })
      : schema.validateWith(operationName, values, validationOptions)

    if (Object.keys(validationResult.errors).length > 0) {
      const errors = toReactHookFormErrors(validationResult.errors, options)
      if (options.shouldUseNativeValidation) {
        applyNativeValidation(validationResult.errors, options)
      }

      return {
        values: {},
        errors
      }
    }

    if (options.shouldUseNativeValidation) {
      applyNativeValidation({}, options)
    }

    return {
      values: buildSuccessValues(values, validationResult, useSelectedPaths, resolverOptions),
      errors: {}
    }
  }
}

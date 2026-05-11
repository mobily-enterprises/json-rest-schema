/**
 * @file Defines the Schema class, which contains the core validation engine.
 */

/**
 * @typedef {object} ValidationError
 * @property {string} field - The name of the field that failed validation.
 * @property {string} code - A stable, machine-readable error code (e.g., 'MIN_LENGTH').
 * @property {string} message - The human-readable error message.
 * @property {object} [params] - A key-value object with context about the error (e.g., { min: 3, actual: 2 }).
 */

/**
 * @typedef {object} ValidationContext
 * @property {Schema} schema - The current schema instance.
 * @property {object} definition - The schema definition for the specific field.
 * @property {any} value - The current value of the field being processed.
 * @property {string} fieldName - The name of the field.
 * @property {object} object - The full object being validated (with modifications).
 * @property {object} objectBeforeCast - The original, unmodified input object.
 * @property {any} valueBeforeCast - The original value of the field.
 * @property {object} options - The global validation options.
 * @property {string} mode - The active validation contract. Preserved as a compatibility alias for `operation`.
 * @property {string} operation - The active validation contract name.
 * @property {boolean} fieldPresent - Whether the field was explicitly present in the input object.
 * @property {{nullable: boolean, nullOnEmpty: boolean}} computedOptions - Calculated options.
 * @property {string} [parameterName] - The name of the validator parameter being processed.
 * @property {any} [parameterValue] - The value of the validator parameter.
 * @property {function(): void} throwTypeError - Throws a standardized type casting error.
 * @property {function(string, string, object=): void} throwParamError - Throws a standardized parameter validation error.
 */

import { buildJsonSchema } from './transport-schema.js'
import {
  resolveArrayItemsConfig,
  resolveObjectFieldMode,
  resolveObjectValuesConfig
} from './nested-contract.js'
import {
  buildPathSegments as buildSafePathSegments,
  setOwnProperty
} from '../utils/path-helpers.js'
import { isPlainObject } from '../utils/object-helpers.js'

function isThenable (value) {
  return value !== null &&
    (typeof value === 'object' || typeof value === 'function') &&
    typeof value.then === 'function'
}

function isSchemaInstance (value) {
  return value instanceof Schema
}

function createSelectionNode () {
  return {
    self: false,
    children: {}
  }
}

function hasSelectionChildren (selectionNode) {
  return Object.keys(selectionNode.children).length > 0
}

function joinPath (basePath, pathSegment) {
  return `${basePath}.${String(pathSegment)}`
}

function buildFieldPath (basePath, fieldName) {
  return basePath === '' ? String(fieldName) : joinPath(basePath, fieldName)
}

function stripPathPrefix (path, prefix) {
  if (path === prefix) return ''

  const prefixWithDot = `${prefix}.`
  if (!path.startsWith(prefixWithDot)) return null

  return path.slice(prefixWithDot.length)
}

function prefixErrorMap (errors, prefix) {
  const prefixedErrors = {}

  for (const error of Object.values(errors)) {
    const field = joinPath(prefix, error.field)
    setOwnProperty(prefixedErrors, field, { ...error, field })
  }

  return prefixedErrors
}

function buildPathSegments (path) {
  return buildSafePathSegments(path, 'validatePath')
}

function buildSelectionTree (paths) {
  const selectionTree = {}

  for (const path of paths) {
    const segments = buildPathSegments(path)
    let currentTree = selectionTree

    for (let index = 0; index < segments.length; index++) {
      const segment = segments[index]

      if (!Object.hasOwn(currentTree, segment)) {
        setOwnProperty(currentTree, segment, createSelectionNode())
      }

      if (index === segments.length - 1) {
        currentTree[segment].self = true
      }

      currentTree = currentTree[segment].children
    }
  }

  return selectionTree
}

function getValueAtPath (value, pathSegments) {
  let currentValue = value

  for (const segment of pathSegments) {
    if (currentValue === null || currentValue === undefined) return undefined
    if (typeof currentValue !== 'object') return undefined
    if (!Object.hasOwn(currentValue, segment)) return undefined
    currentValue = currentValue[segment]
  }

  return currentValue
}

function hasSelectedValue (value) {
  if (value === null) return true
  if (Array.isArray(value)) return Object.keys(value).length > 0
  if (isPlainObject(value)) return Object.keys(value).length > 0
  return value !== undefined
}

function sortSelectionKeys (keys) {
  return [...keys].sort((left, right) => {
    const leftIsIndex = /^[0-9]+$/.test(left)
    const rightIsIndex = /^[0-9]+$/.test(right)

    if (leftIsIndex && rightIsIndex) return Number(left) - Number(right)
    if (leftIsIndex) return -1
    if (rightIsIndex) return 1
    return left.localeCompare(right)
  })
}

function isNumericPathSegment (segment) {
  return /^[0-9]+$/.test(segment)
}

function cloneSchemaIntrospectionSnapshot (schema, seen = new WeakMap()) {
  if (seen.has(schema)) return seen.get(schema)

  const snapshot = Object.create(Schema.prototype)
  seen.set(schema, snapshot)

  snapshot.structure = null
  snapshot.types = schema.types
  snapshot.validators = schema.validators
  snapshot.operations = schema.operations

  snapshot.structure = freezeIntrospectionValue(cloneIntrospectionValue(schema.structure, seen))
  snapshot._installOperationMethods()

  return Object.freeze(snapshot)
}

function cloneIntrospectionValue (value, seen = new WeakMap()) {
  if (value === null || typeof value !== 'object') return value
  if (isSchemaInstance(value)) return cloneSchemaIntrospectionSnapshot(value, seen)
  if (value instanceof Date) return new Date(value.getTime())
  if (value instanceof RegExp) {
    const cloned = new RegExp(value.source, value.flags)
    cloned.lastIndex = value.lastIndex
    return cloned
  }
  if (seen.has(value)) return seen.get(value)

  if (Array.isArray(value)) {
    const cloned = []
    seen.set(value, cloned)
    for (const item of value) {
      cloned.push(cloneIntrospectionValue(item, seen))
    }
    return cloned
  }

  if (!isPlainObject(value)) return value

  const cloned = {}
  seen.set(value, cloned)
  for (const [key, entry] of Object.entries(value)) {
    setOwnProperty(cloned, key, cloneIntrospectionValue(entry, seen))
  }
  return cloned
}

function freezeIntrospectionValue (value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object' || seen.has(value) || isSchemaInstance(value)) {
    return value
  }

  seen.add(value)

  if (Array.isArray(value)) {
    for (const item of value) {
      freezeIntrospectionValue(item, seen)
    }
  } else {
    for (const key of Reflect.ownKeys(value)) {
      freezeIntrospectionValue(value[key], seen)
    }
  }

  return Object.freeze(value)
}

function createIntrospectionSnapshot (value) {
  return freezeIntrospectionValue(cloneIntrospectionValue(value))
}

function resolveDefinitionFromSchemaPath (schema, pathSegments, basePath = '') {
  if (!isSchemaInstance(schema)) return null
  if (!Array.isArray(pathSegments) || pathSegments.length < 1) return null

  const [fieldName, ...rest] = pathSegments
  if (!Object.hasOwn(schema.structure, fieldName)) return null
  const definition = schema.structure[fieldName]

  if (rest.length < 1) return definition

  const fieldPath = buildFieldPath(basePath, fieldName)
  return resolveNestedDefinitionAtPath(schema, definition, rest, fieldPath)
}

function resolveNestedDefinitionAtPath (schema, definition, pathSegments, fieldPath) {
  if (definition?.type === 'object') {
    const objectMode = schema._resolveObjectFieldMode(fieldPath, definition)
    if (objectMode.kind !== 'nested') return null
    return resolveDefinitionFromSchemaPath(objectMode.schema, pathSegments, fieldPath)
  }

  if (definition?.type === 'array') {
    const itemsConfig = schema._resolveArrayItemsConfig(fieldPath, definition)
    if (!itemsConfig || pathSegments.length < 1) return null

    const [indexSegment, ...rest] = pathSegments
    if (!isNumericPathSegment(indexSegment)) return null

    const itemPath = joinPath(fieldPath, indexSegment)
    if (itemsConfig.kind === 'schema') {
      if (rest.length < 1) return null
      return resolveDefinitionFromSchemaPath(itemsConfig.schema, rest, itemPath)
    }

    if (rest.length < 1) return itemsConfig.definition
    return resolveNestedDefinitionAtPath(schema, itemsConfig.definition, rest, itemPath)
  }

  return null
}

function buildNestedOptions (options, prefix) {
  const nestedOptions = { ...options }

  if (Array.isArray(options.skipFields)) {
    const skipFields = options.skipFields
      .map(fieldPath => stripPathPrefix(fieldPath, prefix))
      .filter(fieldPath => fieldPath !== null && fieldPath !== '')

    if (skipFields.length > 0) nestedOptions.skipFields = skipFields
    else delete nestedOptions.skipFields
  }

  if (isPlainObject(options.skipParams)) {
    const skipParams = {}

    for (const [fieldPath, parameters] of Object.entries(options.skipParams)) {
      const nestedFieldPath = stripPathPrefix(fieldPath, prefix)
      if (nestedFieldPath === null || nestedFieldPath === '') continue
      setOwnProperty(skipParams, nestedFieldPath, parameters)
    }

    if (Object.keys(skipParams).length > 0) nestedOptions.skipParams = skipParams
    else delete nestedOptions.skipParams
  }

  return nestedOptions
}

const DEFAULT_OPERATIONS = Object.freeze({
  create: Object.freeze({
    targetFields: 'schema',
    enforceRequired: true,
    applyDefaults: true,
    outputFields: 'validated',
    rejectExplicitUndefined: true
  }),
  replace: Object.freeze({
    targetFields: 'schema',
    enforceRequired: true,
    applyDefaults: true,
    outputFields: 'validated',
    rejectExplicitUndefined: true
  }),
  patch: Object.freeze({
    targetFields: 'input',
    enforceRequired: false,
    applyDefaults: false,
    outputFields: 'input',
    rejectExplicitUndefined: true
  })
})

function validateOperationOption (operationName, descriptor, key, allowedValues) {
  const value = descriptor[key]
  if (!allowedValues.includes(value)) {
    throw new Error(`Operation "${operationName}" must define ${key} as one of: ${allowedValues.join(', ')}.`)
  }
}

function validateBooleanOperationOption (operationName, descriptor, key, required = true) {
  const value = descriptor[key]
  if (value === undefined && !required) return
  if (typeof value !== 'boolean') {
    throw new Error(`Operation "${operationName}" must define ${key} as a boolean.`)
  }
}

function normalizeOperationDescriptor (operationName, descriptor) {
  if (typeof descriptor !== 'object' || descriptor === null || Array.isArray(descriptor)) {
    throw new Error(`Operation "${operationName}" must be an object.`)
  }

  validateOperationOption(operationName, descriptor, 'targetFields', ['schema', 'input'])
  validateBooleanOperationOption(operationName, descriptor, 'enforceRequired')
  validateBooleanOperationOption(operationName, descriptor, 'applyDefaults')
  validateOperationOption(operationName, descriptor, 'outputFields', ['validated', 'input'])
  validateBooleanOperationOption(operationName, descriptor, 'rejectExplicitUndefined', false)

  return Object.freeze({
    targetFields: descriptor.targetFields,
    enforceRequired: descriptor.enforceRequired,
    applyDefaults: descriptor.applyDefaults,
    outputFields: descriptor.outputFields,
    rejectExplicitUndefined: descriptor.rejectExplicitUndefined === undefined ? true : descriptor.rejectExplicitUndefined
  })
}

function normalizeOperations (operations = {}) {
  if (typeof operations !== 'object' || operations === null || Array.isArray(operations)) {
    throw new Error('Schema operations must be an object.')
  }

  const normalizedOperations = {}

  for (const [operationName, descriptor] of Object.entries(DEFAULT_OPERATIONS)) {
    setOwnProperty(normalizedOperations, operationName, descriptor)
  }

  for (const [operationName, descriptor] of Object.entries(operations)) {
    setOwnProperty(normalizedOperations, operationName, normalizeOperationDescriptor(operationName, descriptor))
  }

  return Object.freeze(normalizedOperations)
}

function cloneValidationOptions (options) {
  const validationOptions = { ...options }
  delete validationOptions.operation
  delete validationOptions.mode
  return validationOptions
}

/**
 * Represents an instance of a schema that can validate objects against a structure.
 * This class is instantiated by the createSchema factory function.
 */
export class Schema {
  /**
   * @param {object} structure The schema definition.
   * @param {object} types The globally registered type handlers.
   * @param {object} validators The globally registered validator handlers.
   * @param {object} [operations={}] Per-schema operation descriptors.
   */
  constructor (structure, types, validators, operations = {}) {
    this.structure = structure
    this.types = Object.freeze({ ...types })
    this.validators = Object.freeze({ ...validators })
    this.operations = normalizeOperations(operations)

    this._installOperationMethods()
  }

  // --- Private Helpers ---

  /** @private */
  _typeError (field) {
    return this._paramError(field, 'TYPE_CAST_FAILED', 'Value could not be cast to the required type.')
  }

  /** @private */
  _paramError (field, code, message, params = {}) {
    const e = new Error(message)
    e.errorObject = { field, code, message, params }
    return e
  }

  /** @private */
  _paramToBeSkipped (parameterName, skipParams, fieldName) {
    if (typeof skipParams !== 'object' || skipParams === null) return false
    if (Array.isArray(skipParams[fieldName]) && skipParams[fieldName].includes(parameterName)) return true
    return false
  }

  /** @private */
  _fieldToBeSkipped (fieldPath, options) {
    return Array.isArray(options.skipFields) && options.skipFields.includes(fieldPath)
  }

  /** @private */
  _mergeErrors (target, source) {
    for (const [fieldPath, error] of Object.entries(source)) {
      setOwnProperty(target, fieldPath, error)
    }
  }

  /** @private */
  _singleErrorMap (error) {
    const errors = {}
    setOwnProperty(errors, error.field, error)
    return errors
  }

  /** @private */
  _assertSupportedOptions (options = {}) {
    if (Object.hasOwn(options, 'onlyObjectValues')) {
      throw new Error('Unsupported validation option `onlyObjectValues`. Call `patch()` directly.')
    }
    if (Object.hasOwn(options, 'mode')) {
      throw new Error('Unsupported validation option `mode`. Call `validateWith()` or an operation method directly.')
    }
    if (Object.hasOwn(options, 'operation')) {
      throw new Error('Unsupported validation option `operation`. Call `validateWith()` or an operation method directly.')
    }
  }

  /** @private */
  _buildOperationSettings (operationName, operation, object) {
    return {
      operationName,
      operation,
      targetFieldNames: operation.targetFields === 'input' ? Object.keys(object) : Object.keys(this.structure),
      outputFieldNames: operation.outputFields === 'input' ? Object.keys(object) : Object.keys(this.structure),
      enforceRequired: operation.enforceRequired,
      applyDefaults: operation.applyDefaults,
      rejectExplicitUndefined: operation.rejectExplicitUndefined,
      defaultedFields: new Set(),
      isFieldPresent: (fieldName) => Object.hasOwn(object, fieldName)
    }
  }

  /** @private */
  _assertPlainObjectInput (methodName, object) {
    if (!isPlainObject(object)) {
      throw new Error(`${methodName}() expects a plain object input.`)
    }
  }

  /** @private */
  _resolvePathValidationRequest (options = {}) {
    const operationName = options.operation ?? options.mode ?? 'patch'

    if (Object.hasOwn(options, 'operation') && Object.hasOwn(options, 'mode') && options.operation !== options.mode) {
      throw new Error('Path validation options `operation` and `mode` must match when both are provided.')
    }

    const operation = this.operations[operationName]
    if (!operation) {
      throw new Error(`Unknown operation "${operationName}".`)
    }

    return {
      operationName,
      operation,
      validationOptions: cloneValidationOptions(options)
    }
  }

  /** @private */
  _buildOperationResult (object, workingObject, settings) {
    const validatedObject = {}

    for (const fieldName of settings.outputFieldNames) {
      if (!Object.hasOwn(this.structure, fieldName)) continue
      const fieldPresent = settings.isFieldPresent(fieldName)
      const includeField = (
        workingObject[fieldName] !== undefined ||
        (fieldPresent && object[fieldName] === null) ||
        settings.defaultedFields.has(fieldName)
      )

      if (!includeField) continue
      if (!fieldPresent && !settings.defaultedFields.has(fieldName)) continue

      setOwnProperty(validatedObject, fieldName, workingObject[fieldName])
    }

    return validatedObject
  }

  /** @private */
  _resolveObjectFieldMode (fieldPath, definition) {
    return resolveObjectFieldMode(fieldPath, definition)
  }

  /** @private */
  _resolveArrayItemsConfig (fieldPath, definition) {
    return resolveArrayItemsConfig(fieldPath, definition)
  }

  /** @private */
  _resolveObjectValuesConfig (fieldPath, definition) {
    return resolveObjectValuesConfig(fieldPath, definition)
  }

  /** @private */
  _buildArrayItemSettings (definition, settings) {
    if (definition.type === 'object' && Object.hasOwn(definition, 'schema')) {
      return {
        ...settings,
        operationName: 'replace',
        operation: this.operations.replace
      }
    }

    return settings
  }

  /** @private */
  _castValue (definition, rawValue, fieldPath, currentObject, containerKey, objectBeforeCast, options, settings) {
    const nullable = definition.nullable === true || options.nullable === true
    const nullOnEmpty = definition.nullOnEmpty === true || options.nullOnEmpty === true

    if (rawValue === null) {
      if (nullable) {
        setOwnProperty(currentObject, containerKey, null)
        return { errors: {}, shouldContinue: false }
      }

      return {
        errors: this._singleErrorMap({
          field: fieldPath,
          code: 'NOT_NULLABLE',
          message: 'Field cannot be null',
          params: {}
        }),
        shouldContinue: false
      }
    }

    if (rawValue === '' && nullOnEmpty) {
      setOwnProperty(currentObject, containerKey, null)
      return { errors: {}, shouldContinue: false }
    }

    /** @type {ValidationContext} */
    const context = {
      schema: this,
      definition,
      value: rawValue,
      fieldName: fieldPath,
      object: currentObject,
      objectBeforeCast,
      valueBeforeCast: rawValue,
      options,
      mode: settings.operationName,
      operation: settings.operationName,
      fieldPresent: true,
      computedOptions: { nullable: nullable || nullOnEmpty, nullOnEmpty },

      throwTypeError: () => {
        throw this._typeError(fieldPath)
      },
      throwParamError: (code, message, params) => {
        throw this._paramError(fieldPath, code, message, params)
      }
    }

    const typeHandler = this.types[definition.type]
    if (!typeHandler) throw new Error(`No casting function for type: ${definition.type}`)

    try {
      const castResult = typeHandler(context)
      if (isThenable(castResult)) {
        throw new Error(`Type handler for "${definition.type}" must be synchronous.`)
      }

      if (castResult !== undefined) {
        setOwnProperty(currentObject, containerKey, castResult)
        context.value = castResult
      }
    } catch (e) {
      if (e.errorObject) {
        return {
          errors: this._singleErrorMap(e.errorObject),
          shouldContinue: false
        }
      }

      throw e
    }

    return {
      errors: {},
      context,
      shouldContinue: true
    }
  }

  /** @private */
  _runFieldValidators (definition, fieldPath, currentObject, containerKey, context, options) {
    for (const paramName of Object.keys(definition)) {
      if (paramName === 'type') continue
      if (this._paramToBeSkipped(paramName, options.skipParams, fieldPath)) continue

      const validatorHandler = this.validators[paramName]
      if (!validatorHandler) continue

      try {
        context.parameterName = paramName
        context.parameterValue = definition[paramName]
        const validatorResult = validatorHandler(context)
        if (isThenable(validatorResult)) {
          throw new Error(`Validator handler for "${paramName}" must be synchronous.`)
        }
        if (validatorResult !== undefined) {
          setOwnProperty(currentObject, containerKey, validatorResult)
          context.value = validatorResult
        }
      } catch (e) {
        if (e.errorObject) return this._singleErrorMap(e.errorObject)
        throw e
      }
    }

    return {}
  }

  /** @private */
  _normalizeAndValidateValue (definition, rawValue, fieldPath, currentObject, containerKey, objectBeforeCast, options, settings) {
    const castResult = this._castValue(definition, rawValue, fieldPath, currentObject, containerKey, objectBeforeCast, options, settings)
    if (Object.keys(castResult.errors).length > 0) return castResult.errors
    if (!castResult.shouldContinue) return {}

    const { context } = castResult

    const nestedErrors = this._validateNestedValue(definition, fieldPath, currentObject, containerKey, options, settings)
    if (Object.keys(nestedErrors).length > 0) {
      return nestedErrors
    }

    context.value = currentObject[containerKey]
    return this._runFieldValidators(definition, fieldPath, currentObject, containerKey, context, options)
  }

  /** @private */
  _validateNestedValue (definition, fieldPath, currentObject, containerKey, options, settings) {
    if (definition.type === 'object') {
      const objectMode = this._resolveObjectFieldMode(fieldPath, definition)
      if (objectMode.kind === 'nested') {
        return this._validateNestedObjectSchema(
          objectMode,
          fieldPath,
          currentObject,
          containerKey,
          options,
          settings
        )
      }

      if (objectMode.kind === 'map') {
        return this._validateObjectValues(
          fieldPath,
          currentObject,
          containerKey,
          objectMode.valuesConfig,
          options,
          settings
        )
      }

      return {}
    }

    if (definition.type !== 'array') return {}

    const itemsConfig = this._resolveArrayItemsConfig(fieldPath, definition)
    if (!itemsConfig) return {}

    return this._validateArrayItems(fieldPath, currentObject, containerKey, itemsConfig, options, settings)
  }

  /** @private */
  _validateNestedObjectSchema (objectMode, fieldPath, currentObject, containerKey, options, settings) {
    const sourceObject = currentObject[containerKey]
    const nestedInput = objectMode.allowAdditionalProperties
      ? this._extractKnownObjectFields(sourceObject, objectMode.schema)
      : sourceObject

    const nestedResult = objectMode.schema._validateWithOperation(
      settings.operationName,
      settings.operation,
      nestedInput,
      buildNestedOptions(options, fieldPath)
    )

    setOwnProperty(currentObject, containerKey, objectMode.allowAdditionalProperties
      ? this._mergeKnownAndPassthroughObjectFields(sourceObject, objectMode.schema, nestedResult.validatedObject)
      : nestedResult.validatedObject)

    return prefixErrorMap(nestedResult.errors, fieldPath)
  }

  /** @private */
  _extractKnownObjectFields (sourceObject, nestedSchema) {
    const knownObject = {}

    for (const [key, value] of Object.entries(sourceObject)) {
      if (Object.hasOwn(nestedSchema.structure, key)) {
        setOwnProperty(knownObject, key, value)
      }
    }

    return knownObject
  }

  /** @private */
  _mergeKnownAndPassthroughObjectFields (sourceObject, nestedSchema, validatedObject) {
    const mergedObject = {}

    for (const key of Object.keys(sourceObject)) {
      if (!Object.hasOwn(nestedSchema.structure, key)) {
        setOwnProperty(mergedObject, key, sourceObject[key])
        continue
      }

      if (Object.hasOwn(validatedObject, key)) {
        setOwnProperty(mergedObject, key, validatedObject[key])
      }
    }

    for (const [key, value] of Object.entries(validatedObject)) {
      if (!Object.hasOwn(mergedObject, key)) {
        setOwnProperty(mergedObject, key, value)
      }
    }

    return mergedObject
  }

  /** @private */
  _validateObjectValues (fieldPath, currentObject, containerKey, valuesConfig, options, settings) {
    const originalEntries = currentObject[containerKey]
    const normalizedEntries = { ...originalEntries }
    const errors = {}

    setOwnProperty(currentObject, containerKey, normalizedEntries)

    for (const key of Object.keys(originalEntries)) {
      const valuePath = joinPath(fieldPath, key)

      if (this._fieldToBeSkipped(valuePath, options)) continue

      const rawValue = normalizedEntries[key]

      if (rawValue === undefined) {
        if (settings.rejectExplicitUndefined) {
          this._mergeErrors(errors, this._singleErrorMap(this._typeError(valuePath).errorObject))
        } else {
          delete normalizedEntries[key]
        }
        continue
      }

      if (valuesConfig.kind === 'schema') {
        const valueResult = valuesConfig.schema._validateWithOperation(
          'replace',
          valuesConfig.schema.operations.replace,
          rawValue,
          buildNestedOptions(options, valuePath)
        )

        setOwnProperty(normalizedEntries, key, valueResult.validatedObject)
        this._mergeErrors(errors, prefixErrorMap(valueResult.errors, valuePath))
        continue
      }

      const valueErrors = this._normalizeAndValidateValue(
        valuesConfig.definition,
        rawValue,
        valuePath,
        normalizedEntries,
        key,
        originalEntries,
        options,
        this._buildArrayItemSettings(valuesConfig.definition, settings)
      )

      this._mergeErrors(errors, valueErrors)
    }

    return errors
  }

  /** @private */
  _validateArrayItems (fieldPath, currentObject, containerKey, itemsConfig, options, settings) {
    const originalItems = currentObject[containerKey]
    const normalizedItems = originalItems.slice()
    const errors = {}

    setOwnProperty(currentObject, containerKey, normalizedItems)

    for (let index = 0; index < normalizedItems.length; index++) {
      const itemPath = joinPath(fieldPath, index)

      if (this._fieldToBeSkipped(itemPath, options)) continue

      if (!Object.hasOwn(originalItems, index) || normalizedItems[index] === undefined) {
        if (settings.rejectExplicitUndefined) {
          this._mergeErrors(errors, this._singleErrorMap(this._typeError(itemPath).errorObject))
        } else {
          delete normalizedItems[index]
        }
        continue
      }

      if (itemsConfig.kind === 'schema') {
        const itemResult = itemsConfig.schema._validateWithOperation(
          'replace',
          itemsConfig.schema.operations.replace,
          normalizedItems[index],
          buildNestedOptions(options, itemPath)
        )

        setOwnProperty(normalizedItems, index, itemResult.validatedObject)
        this._mergeErrors(errors, prefixErrorMap(itemResult.errors, itemPath))
        continue
      }

      const itemErrors = this._normalizeAndValidateValue(
        itemsConfig.definition,
        normalizedItems[index],
        itemPath,
        normalizedItems,
        index,
        originalItems,
        options,
        this._buildArrayItemSettings(itemsConfig.definition, settings)
      )

      this._mergeErrors(errors, itemErrors)
    }

    return errors
  }

  /**
   * Processes a single field through the entire validation pipeline (pre-checks, casting, validators).
   * This is the heart of the validation logic for an individual field.
   * @private
   * @param {string} fieldName - The name of the field to validate.
   * @param {object} object - The original input object.
   * @param {object} validatedObject - The object being built with validated data.
   * @param {object} options - The global validation options.
   * @param {object} settings - Mode-specific validation settings.
   * @returns {ValidationError|null} An error object if validation fails, otherwise null.
   */
  _validateField (fieldName, object, validatedObject, options, settings) {
    if (!Object.hasOwn(this.structure, fieldName)) return {}
    const definition = this.structure[fieldName]

    if (this._fieldToBeSkipped(fieldName, options)) return {}

    const fieldPresent = settings.isFieldPresent(fieldName)
    const rawValue = object[fieldName]
    const valueMissing = rawValue === undefined

    if (settings.enforceRequired && definition.required && (!fieldPresent || valueMissing)) {
      if (!this._paramToBeSkipped('required', options.skipParams, fieldName)) {
        return this._singleErrorMap({
          field: fieldName,
          code: 'REQUIRED',
          message: 'Field is required',
          params: {}
        })
      }
    }

    if (!fieldPresent) {
      return {}
    }

    if (valueMissing) {
      if (settings.rejectExplicitUndefined) {
        return this._singleErrorMap(this._typeError(fieldName).errorObject)
      }
      return {}
    }

    return this._normalizeAndValidateValue(definition, rawValue, fieldName, validatedObject, fieldName, object, options, settings)
  }

  /** @private */
  _validateWithOperation (operationName, operation, object, options) {
    this._assertSupportedOptions(options)

    const errors = {}
    const workingObject = { ...object }
    const settings = this._buildOperationSettings(operationName, operation, object)

    for (const fieldName of Object.keys(object)) {
      if (!Object.hasOwn(this.structure, fieldName)) {
        setOwnProperty(errors, fieldName, { field: fieldName, code: 'FIELD_NOT_ALLOWED', message: 'Field not allowed', params: {} })
      }
    }

    for (const fieldName of settings.targetFieldNames) {
      const fieldErrors = this._validateField(fieldName, object, workingObject, options, settings)
      this._mergeErrors(errors, fieldErrors)
    }

    if (settings.applyDefaults) {
      for (const fieldName of Object.keys(this.structure)) {
        if (settings.isFieldPresent(fieldName)) continue

        if (this.structure[fieldName].defaultTo !== undefined) {
          const def = this.structure[fieldName].defaultTo
          setOwnProperty(workingObject, fieldName, typeof def === 'function' ? def() : def)
          settings.defaultedFields.add(fieldName)
        }
      }
    }

    return {
      validatedObject: this._buildOperationResult(object, workingObject, settings),
      errors
    }
  }

  /** @private */
  _validateSelectedTree (selectionTree, object, options, settings, basePath = '') {
    const errors = {}
    const validatedObject = {}

    for (const fieldName of sortSelectionKeys(Object.keys(selectionTree))) {
      const fieldPath = buildFieldPath(basePath, fieldName)
      if (!Object.hasOwn(this.structure, fieldName)) {
        throw new Error(`Unknown schema path "${fieldPath}".`)
      }

      const fieldErrors = this._validateSelectedField(
        fieldName,
        selectionTree[fieldName],
        object,
        validatedObject,
        options,
        settings,
        fieldPath
      )

      this._mergeErrors(errors, fieldErrors)
    }

    return { validatedObject, errors }
  }

  /** @private */
  _validateSelectedField (fieldName, selectionNode, object, validatedObject, options, settings, fieldPath) {
    if (!Object.hasOwn(this.structure, fieldName)) return {}
    const definition = this.structure[fieldName]
    const exactSelected = selectionNode.self === true
    const hasChildren = hasSelectionChildren(selectionNode)

    if (this._fieldToBeSkipped(fieldPath, options)) return {}

    const fieldPresent = Object.hasOwn(object, fieldName)
    const rawValue = object[fieldName]
    const errors = {}

    if (!fieldPresent) {
      if (exactSelected && settings.enforceRequired && definition.required && !this._paramToBeSkipped('required', options.skipParams, fieldPath)) {
        this._mergeErrors(errors, this._singleErrorMap({
          field: fieldPath,
          code: 'REQUIRED',
          message: 'Field is required',
          params: {}
        }))
      }

      if (exactSelected && settings.applyDefaults && definition.defaultTo !== undefined) {
        const defaultValue = typeof definition.defaultTo === 'function' ? definition.defaultTo() : definition.defaultTo
        setOwnProperty(validatedObject, fieldName, defaultValue)
      }

      return errors
    }

    if (rawValue === undefined) {
      if (exactSelected && settings.rejectExplicitUndefined) {
        return this._singleErrorMap(this._typeError(fieldPath).errorObject)
      }

      return {}
    }

    const currentObject = { [fieldName]: rawValue }

    if (exactSelected) {
      const fieldErrors = this._normalizeAndValidateValue(
        definition,
        rawValue,
        fieldPath,
        currentObject,
        fieldName,
        object,
        options,
        settings
      )

      if (Object.hasOwn(currentObject, fieldName) && currentObject[fieldName] !== undefined) {
        setOwnProperty(validatedObject, fieldName, currentObject[fieldName])
      } else if (currentObject[fieldName] === null) {
        setOwnProperty(validatedObject, fieldName, null)
      }

      return fieldErrors
    }

    if (!hasChildren) return {}

    const castResult = this._castValue(definition, rawValue, fieldPath, currentObject, fieldName, object, options, settings)
    if (Object.keys(castResult.errors).length > 0) {
      return castResult.errors
    }

    if (!castResult.shouldContinue) return {}

    const nestedResult = this._validateSelectedDescendants(
      definition,
      selectionNode.children,
      fieldPath,
      currentObject,
      fieldName,
      options,
      settings
    )

    if (hasSelectedValue(currentObject[fieldName])) {
      setOwnProperty(validatedObject, fieldName, currentObject[fieldName])
    }

    return nestedResult
  }

  /** @private */
  _validateSelectedDescendants (definition, selectionTree, fieldPath, currentObject, containerKey, options, settings) {
    if (definition.type === 'object') {
      const objectMode = this._resolveObjectFieldMode(fieldPath, definition)
      if (objectMode.kind !== 'nested') {
        throw new Error(`Schema path "${fieldPath}" does not support nested field selection.`)
      }

      const nestedValue = currentObject[containerKey]
      if (!isPlainObject(nestedValue)) return {}

      const nestedResult = objectMode.schema._validateSelectedTree(
        selectionTree,
        nestedValue,
        buildNestedOptions(options, fieldPath),
        {
          ...settings,
          defaultedFields: new Set()
        }
      )

      setOwnProperty(currentObject, containerKey, nestedResult.validatedObject)
      return prefixErrorMap(nestedResult.errors, fieldPath)
    }

    if (definition.type === 'array') {
      const itemsConfig = this._resolveArrayItemsConfig(fieldPath, definition)
      if (!itemsConfig) {
        throw new Error(`Schema path "${fieldPath}" does not define array items for nested selection.`)
      }

      return this._validateSelectedArrayItems(fieldPath, currentObject, containerKey, itemsConfig, selectionTree, options, settings)
    }

    throw new Error(`Schema path "${fieldPath}" does not support nested field selection.`)
  }

  /** @private */
  _validateSelectedArrayItems (fieldPath, currentObject, containerKey, itemsConfig, selectionTree, options, settings) {
    const normalizedItems = []
    const sourceItems = currentObject[containerKey]
    const errors = {}

    setOwnProperty(currentObject, containerKey, normalizedItems)

    for (const indexKey of sortSelectionKeys(Object.keys(selectionTree))) {
      if (!/^[0-9]+$/.test(indexKey)) {
        throw new Error(`Schema path "${joinPath(fieldPath, indexKey)}" is invalid because array segments must use numeric indexes.`)
      }

      const index = Number(indexKey)
      const itemPath = joinPath(fieldPath, index)
      const selectionNode = selectionTree[indexKey]
      const exactSelected = selectionNode.self === true
      const hasChildren = hasSelectionChildren(selectionNode)

      if (this._fieldToBeSkipped(itemPath, options)) continue
      if (!Object.hasOwn(sourceItems, index)) {
        if (exactSelected && settings.rejectExplicitUndefined) {
          setOwnProperty(errors, itemPath, this._typeError(itemPath).errorObject)
        }
        continue
      }

      const rawValue = sourceItems[index]
      if (rawValue === undefined) {
        if (exactSelected && settings.rejectExplicitUndefined) {
          setOwnProperty(errors, itemPath, this._typeError(itemPath).errorObject)
        }
        continue
      }

      if (itemsConfig.kind === 'schema') {
        if (exactSelected) {
          const itemResult = itemsConfig.schema._validateWithOperation(
            'replace',
            itemsConfig.schema.operations.replace,
            rawValue,
            buildNestedOptions(options, itemPath)
          )

          if (hasSelectedValue(itemResult.validatedObject)) {
            setOwnProperty(normalizedItems, index, itemResult.validatedObject)
          }

          this._mergeErrors(errors, prefixErrorMap(itemResult.errors, itemPath))
          continue
        }

        if (!hasChildren) continue

        const itemResult = itemsConfig.schema._validateSelectedTree(
          selectionNode.children,
          rawValue,
          buildNestedOptions(options, itemPath),
          {
            ...settings,
            operationName: 'replace',
            operation: itemsConfig.schema.operations.replace,
            defaultedFields: new Set()
          }
        )

        if (hasSelectedValue(itemResult.validatedObject)) {
          setOwnProperty(normalizedItems, index, itemResult.validatedObject)
        }

        this._mergeErrors(errors, prefixErrorMap(itemResult.errors, itemPath))
        continue
      }

      const itemSettings = this._buildArrayItemSettings(itemsConfig.definition, settings)
      const itemHolder = [rawValue]

      if (exactSelected) {
        const itemErrors = this._normalizeAndValidateValue(
          itemsConfig.definition,
          rawValue,
          itemPath,
          itemHolder,
          0,
          sourceItems,
          options,
          itemSettings
        )

        if (Object.hasOwn(itemHolder, 0) && itemHolder[0] !== undefined) {
          setOwnProperty(normalizedItems, index, itemHolder[0])
        } else if (itemHolder[0] === null) {
          setOwnProperty(normalizedItems, index, null)
        }

        this._mergeErrors(errors, itemErrors)
        continue
      }

      if (!hasChildren) continue

      const castResult = this._castValue(itemsConfig.definition, rawValue, itemPath, itemHolder, 0, sourceItems, options, itemSettings)
      if (Object.keys(castResult.errors).length > 0) {
        this._mergeErrors(errors, castResult.errors)
        continue
      }

      if (!castResult.shouldContinue) continue

      const itemErrors = this._validateSelectedDescendants(
        itemsConfig.definition,
        selectionNode.children,
        itemPath,
        itemHolder,
        0,
        options,
        itemSettings
      )

      if (hasSelectedValue(itemHolder[0])) {
        setOwnProperty(normalizedItems, index, itemHolder[0])
      }

      this._mergeErrors(errors, itemErrors)
    }

    return errors
  }

  // --- Public API ---

  /**
   * Validates an object with a named operation contract.
   * @param {string} operationName - The operation contract to use.
   * @param {object} object - The input object to validate.
   * @param {object} [options={}] - Validation options.
   * @returns {{validatedObject: object, errors: Object.<string, ValidationError>}}
   */
  validateWith (operationName, object, options = {}) {
    const operation = this.operations[operationName]
    if (!operation) {
      throw new Error(`Unknown operation "${operationName}".`)
    }

    this._assertPlainObjectInput(operationName, object)

    return this._validateWithOperation(operationName, operation, object, options)
  }

  /**
   * Validates a single schema path against the selected operation.
   * Defaults to `patch` semantics when no operation is specified.
   * @param {string} path - A dotted schema path such as `email` or `workspace.slug`.
   * @param {object} object - The input object to validate.
   * @param {{operation?: string, mode?: string}} [options={}] - Path validation options.
   * @returns {{validatedValue: any, errors: Object.<string, ValidationError>}}
   */
  validateAt (path, object, options = {}) {
    this._assertPlainObjectInput('validateAt', object)

    const pathSegments = buildPathSegments(path)
    const { operationName, operation, validationOptions } = this._resolvePathValidationRequest(options)
    const result = this._validateSelectedTree(
      buildSelectionTree([path]),
      object,
      validationOptions,
      this._buildOperationSettings(operationName, operation, object)
    )

    return {
      validatedValue: getValueAtPath(result.validatedObject, pathSegments),
      errors: result.errors
    }
  }

  /**
   * Validates a selected set of schema paths against the chosen operation.
   * Defaults to `patch` semantics when no operation is specified.
   * @param {string[]} paths - A list of dotted schema paths.
   * @param {object} object - The input object to validate.
   * @param {{operation?: string, mode?: string}} [options={}] - Path validation options.
   * @returns {{validatedObject: object, errors: Object.<string, ValidationError>}}
   */
  validatePaths (paths, object, options = {}) {
    this._assertPlainObjectInput('validatePaths', object)

    if (!Array.isArray(paths) || paths.length === 0) {
      throw new Error('validatePaths() expects a non-empty array of schema paths.')
    }

    const { operationName, operation, validationOptions } = this._resolvePathValidationRequest(options)
    return this._validateSelectedTree(
      buildSelectionTree(paths),
      object,
      validationOptions,
      this._buildOperationSettings(operationName, operation, object)
    )
  }

  /**
   * Installs operation aliases such as `create`, `replace`, `patch`, or user-defined operations.
   * @private
   */
  _installOperationMethods () {
    for (const operationName of Object.keys(this.operations)) {
      if (operationName in this) {
        throw new Error(`Operation name "${operationName}" is reserved and cannot be used as a schema method.`)
      }

      this[operationName] = (object, options = {}) => this.validateWith(operationName, object, options)
    }
  }

  /**
   * Exports the schema as a transport-facing JSON Schema object.
   * @param {{operation?: string, mode?: 'create'|'replace'|'patch', additionalProperties?: boolean}} [options={}] - Export options.
   * @returns {object} A draft-07 JSON Schema object.
   */
  toJsonSchema (options = {}) {
    return buildJsonSchema(this, options)
  }

  /**
   * Returns a frozen snapshot map of the schema's top-level field definitions.
   * @returns {object}
   */
  getFieldDefinitions () {
    return createIntrospectionSnapshot(this.structure)
  }

  /**
   * Resolves a field definition by dotted path. Array items use numeric segments such as `roles.0.id`.
   * Returns a frozen snapshot, or `null` when the path does not resolve to a field definition.
   * @param {string} path
   * @returns {object|null}
   */
  getFieldDefinition (path) {
    if (typeof path !== 'string' || path.trim() === '') {
      throw new Error('Field path must be a non-empty string.')
    }

    const definition = resolveDefinitionFromSchemaPath(this, buildPathSegments(path.trim()))
    return definition === null ? null : createIntrospectionSnapshot(definition)
  }

  /**
   * Resolves the `messages` object for a field definition by dotted path.
   * Returns a frozen snapshot, or an empty frozen object when no messages exist.
   * @param {string} path
   * @returns {object}
   */
  getFieldMessages (path) {
    const definition = this.getFieldDefinition(path)
    if (!definition || typeof definition.messages !== 'object' || definition.messages === null) {
      return Object.freeze({})
    }

    return createIntrospectionSnapshot(definition.messages)
  }

  /**
   * Utility to filter an object, keeping only fields that have a specific parameter.
   * @param {object} object - The object to clean.
   * @param {string} parameterName - The schema parameter to look for.
   * @returns {object} A new object with only the matching fields.
   */
  cleanup (object, parameterName) {
    const newObject = {}
    for (const k of Object.keys(object)) {
      if (Object.hasOwn(this.structure, k) && this.structure[k][parameterName]) {
        setOwnProperty(newObject, k, object[k])
      }
    }
    return newObject
  }
}

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

function isThenable (value) {
  return value !== null &&
    (typeof value === 'object' || typeof value === 'function') &&
    typeof value.then === 'function'
}

function isPlainObject (value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isSchemaInstance (value) {
  return value instanceof Schema
}

function joinPath (basePath, pathSegment) {
  return `${basePath}.${String(pathSegment)}`
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
    prefixedErrors[field] = { ...error, field }
  }

  return prefixedErrors
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
      skipParams[nestedFieldPath] = parameters
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
    normalizedOperations[operationName] = descriptor
  }

  for (const [operationName, descriptor] of Object.entries(operations)) {
    normalizedOperations[operationName] = normalizeOperationDescriptor(operationName, descriptor)
  }

  return Object.freeze(normalizedOperations)
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
    this.types = types
    this.validators = validators
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
      target[fieldPath] = error
    }
  }

  /** @private */
  _singleErrorMap (error) {
    return { [error.field]: error }
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
  _buildOperationResult (object, workingObject, settings) {
    const validatedObject = {}

    for (const fieldName of settings.outputFieldNames) {
      if (this.structure[fieldName] === undefined) continue
      const fieldPresent = settings.isFieldPresent(fieldName)
      const includeField = (
        workingObject[fieldName] !== undefined ||
        (fieldPresent && object[fieldName] === null) ||
        settings.defaultedFields.has(fieldName)
      )

      if (!includeField) continue
      if (!fieldPresent && !settings.defaultedFields.has(fieldName)) continue

      validatedObject[fieldName] = workingObject[fieldName]
    }

    return validatedObject
  }

  /** @private */
  _resolveObjectFieldMode (fieldPath, definition) {
    const hasNestedSchema = Object.hasOwn(definition, 'schema')
    const hasAdditionalProperties = Object.hasOwn(definition, 'additionalProperties')

    if (hasNestedSchema && definition.additionalProperties === true) {
      throw new Error(`Object field "${fieldPath}" cannot define both schema and additionalProperties: true.`)
    }

    if (hasAdditionalProperties && definition.additionalProperties !== true) {
      throw new Error(`Object field "${fieldPath}" only supports additionalProperties: true.`)
    }

    if (hasNestedSchema) {
      if (!isSchemaInstance(definition.schema)) {
        throw new Error(`Object field "${fieldPath}" must define schema as a Schema instance.`)
      }

      return { kind: 'nested', schema: definition.schema }
    }

    if (definition.additionalProperties === true) {
      return { kind: 'opaque' }
    }

    return { kind: 'plain' }
  }

  /** @private */
  _resolveArrayItemsConfig (fieldPath, definition) {
    if (!Object.hasOwn(definition, 'items')) return null

    const { items } = definition

    if (isSchemaInstance(items)) {
      return { kind: 'schema', schema: items }
    }

    if (!isPlainObject(items) || typeof items.type !== 'string') {
      throw new Error(`Array field "${fieldPath}" must define items as either a Schema instance or a field definition object.`)
    }

    return { kind: 'definition', definition: items }
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
  _normalizeAndValidateValue (definition, rawValue, fieldPath, currentObject, containerKey, objectBeforeCast, options, settings) {
    const nullable = definition.nullable === true || options.nullable === true
    const nullOnEmpty = definition.nullOnEmpty === true || options.nullOnEmpty === true

    if (rawValue === null) {
      if (nullable) {
        currentObject[containerKey] = null
        return {}
      }

      return this._singleErrorMap({
        field: fieldPath,
        code: 'NOT_NULLABLE',
        message: 'Field cannot be null',
        params: {}
      })
    }

    if (String(rawValue) === '' && nullOnEmpty) {
      currentObject[containerKey] = null
      return {}
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
        currentObject[containerKey] = castResult
        context.value = castResult
      }
    } catch (e) {
      if (e.errorObject) return this._singleErrorMap(e.errorObject)
      throw e
    }

    const nestedErrors = this._validateNestedValue(definition, fieldPath, currentObject, containerKey, options, settings)
    if (Object.keys(nestedErrors).length > 0) {
      return nestedErrors
    }

    context.value = currentObject[containerKey]

    for (const paramName in definition) {
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
          currentObject[containerKey] = validatorResult
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
  _validateNestedValue (definition, fieldPath, currentObject, containerKey, options, settings) {
    if (definition.type === 'object') {
      const objectMode = this._resolveObjectFieldMode(fieldPath, definition)
      if (objectMode.kind !== 'nested') return {}

      const nestedResult = objectMode.schema._validateWithOperation(
        settings.operationName,
        settings.operation,
        currentObject[containerKey],
        buildNestedOptions(options, fieldPath)
      )

      currentObject[containerKey] = nestedResult.validatedObject
      return prefixErrorMap(nestedResult.errors, fieldPath)
    }

    if (definition.type !== 'array') return {}

    const itemsConfig = this._resolveArrayItemsConfig(fieldPath, definition)
    if (!itemsConfig) return {}

    return this._validateArrayItems(fieldPath, currentObject, containerKey, itemsConfig, options, settings)
  }

  /** @private */
  _validateArrayItems (fieldPath, currentObject, containerKey, itemsConfig, options, settings) {
    const originalItems = currentObject[containerKey]
    const normalizedItems = originalItems.slice()
    const errors = {}

    currentObject[containerKey] = normalizedItems

    for (let index = 0; index < normalizedItems.length; index++) {
      const itemPath = joinPath(fieldPath, index)

      if (this._fieldToBeSkipped(itemPath, options)) continue

      if (itemsConfig.kind === 'schema') {
        const itemResult = itemsConfig.schema._validateWithOperation(
          'replace',
          itemsConfig.schema.operations.replace,
          normalizedItems[index],
          buildNestedOptions(options, itemPath)
        )

        normalizedItems[index] = itemResult.validatedObject
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
    const definition = this.structure[fieldName]
    if (!definition) return {}

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

    for (const fieldName in object) {
      if (this.structure[fieldName] === undefined) {
        errors[fieldName] = { field: fieldName, code: 'FIELD_NOT_ALLOWED', message: 'Field not allowed', params: {} }
      }
    }

    for (const fieldName of settings.targetFieldNames) {
      const fieldErrors = this._validateField(fieldName, object, workingObject, options, settings)
      this._mergeErrors(errors, fieldErrors)
    }

    if (settings.applyDefaults) {
      for (const fieldName in this.structure) {
        if (settings.isFieldPresent(fieldName)) continue

        if (this.structure[fieldName].defaultTo !== undefined) {
          const def = this.structure[fieldName].defaultTo
          workingObject[fieldName] = typeof def === 'function' ? def() : def
          settings.defaultedFields.add(fieldName)
        }
      }
    }

    return {
      validatedObject: this._buildOperationResult(object, workingObject, settings),
      errors
    }
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

    return this._validateWithOperation(operationName, operation, object, options)
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
   * Utility to filter an object, keeping only fields that have a specific parameter.
   * @param {object} object - The object to clean.
   * @param {string} parameterName - The schema parameter to look for.
   * @returns {object} A new object with only the matching fields.
   */
  cleanup (object, parameterName) {
    const newObject = {}
    for (const k in object) {
      if (this.structure[k] && this.structure[k][parameterName]) {
        newObject[k] = object[k]
      }
    }
    return newObject
  }
}

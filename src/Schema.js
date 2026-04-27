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
 * @property {'create'|'replace'|'patch'} mode - The active validation contract.
 * @property {boolean} fieldPresent - Whether the field was explicitly present in the input object.
 * @property {{nullable: boolean, nullOnEmpty: boolean}} computedOptions - Calculated options.
 * @property {string} [parameterName] - The name of the validator parameter being processed.
 * @property {any} [parameterValue] - The value of the validator parameter.
 * @property {function(): void} throwTypeError - Throws a standardized type casting error.
 * @property {function(string, string, object=): void} throwParamError - Throws a standardized parameter validation error.
 */

import { buildJsonSchema } from './transport-schema.js'

/**
 * Represents an instance of a schema that can validate objects against a structure.
 * This class is instantiated by the createSchema factory function.
 */
export class Schema {
  /**
   * @param {object} structure The schema definition.
   * @param {object} types The globally registered type handlers.
   * @param {object} validators The globally registered validator handlers.
   */
  constructor (structure, types, validators) {
    this.structure = structure
    this.types = types
    this.validators = validators
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
  _assertSupportedOptions (options = {}) {
    if (Object.hasOwn(options, 'onlyObjectValues')) {
      throw new Error('Unsupported validation option `onlyObjectValues`. Call `patch()` directly.')
    }
    if (Object.hasOwn(options, 'mode')) {
      throw new Error('Unsupported validation option `mode`. Call `create()`, `replace()`, or `patch()` directly.')
    }
  }

  /** @private */
  _buildOperationSettings (mode, object) {
    return {
      mode,
      enforceRequired: mode !== 'patch',
      rejectExplicitUndefined: true,
      defaultedFields: new Set(),
      isFieldPresent: (fieldName) => Object.hasOwn(object, fieldName)
    }
  }

  /** @private */
  _buildOperationResult (object, workingObject, settings) {
    const validatedObject = {}

    const targetFields = settings.mode === 'patch' ? Object.keys(object) : Object.keys(this.structure)
    for (const fieldName of targetFields) {
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

  /**
   * Processes a single field through the entire validation pipeline (pre-checks, casting, validators).
   * This is the heart of the validation logic for an individual field.
   * @private
   * @param {string} fieldName - The name of the field to validate.
   * @param {object} object - The original input object.
   * @param {object} validatedObject - The object being built with validated data.
   * @param {object} options - The global validation options.
   * @param {object} settings - Mode-specific validation settings.
   * @returns {Promise<ValidationError|null>} An error object if validation fails, otherwise null.
   */
  async _validateField (fieldName, object, validatedObject, options, settings) {
    const definition = this.structure[fieldName]
    if (!definition) return null

    if (Array.isArray(options.skipFields) && options.skipFields.includes(fieldName)) return null

    const fieldPresent = settings.isFieldPresent(fieldName)
    const rawValue = object[fieldName]
    const valueMissing = rawValue === undefined

    if (settings.enforceRequired && definition.required && (!fieldPresent || valueMissing)) {
      if (!this._paramToBeSkipped('required', options.skipParams, fieldName)) {
        return { field: fieldName, code: 'REQUIRED', message: 'Field is required', params: {} }
      }
    }

    if (!fieldPresent) {
      return null
    }

    if (valueMissing) {
      if (settings.rejectExplicitUndefined) {
        return this._typeError(fieldName).errorObject
      }
      return null
    }

    const nullable = definition.nullable === true || options.nullable === true
    const nullOnEmpty = definition.nullOnEmpty === true || options.nullOnEmpty === true

    if (rawValue === null) {
      if (nullable) {
        validatedObject[fieldName] = null
        return null
      }
      return { field: fieldName, code: 'NOT_NULLABLE', message: 'Field cannot be null', params: {} }
    }

    if (String(rawValue) === '' && nullOnEmpty) {
      validatedObject[fieldName] = null
      return null
    }

    /** @type {ValidationContext} */
    const context = {
      schema: this,
      definition,
      value: rawValue,
      fieldName,
      object: validatedObject,
      objectBeforeCast: object,
      valueBeforeCast: rawValue,
      options,
      mode: settings.mode,
      fieldPresent,
      computedOptions: { nullable: nullable || nullOnEmpty, nullOnEmpty },

      throwTypeError: () => {
        throw this._typeError(fieldName)
      },
      throwParamError: (code, message, params) => {
        throw this._paramError(fieldName, code, message, params)
      }
    }

    const typeHandler = this.types[definition.type]
    if (!typeHandler) throw new Error(`No casting function for type: ${definition.type}`)

    try {
      const castResult = await typeHandler(context)
      if (castResult !== undefined) {
        validatedObject[fieldName] = castResult
        context.value = castResult
      }
    } catch (e) {
      if (e.errorObject) return e.errorObject
      throw e
    }

    for (const paramName in definition) {
      if (paramName === 'type') continue
      if (this._paramToBeSkipped(paramName, options.skipParams, fieldName)) continue

      const validatorHandler = this.validators[paramName]
      if (validatorHandler) {
        try {
          context.parameterName = paramName
          context.parameterValue = definition[paramName]
          const validatorResult = await validatorHandler(context)
          if (validatorResult !== undefined) {
            validatedObject[fieldName] = validatorResult
            context.value = validatorResult
          }
        } catch (e) {
          if (e.errorObject) return e.errorObject
          throw e
        }
      }
    }
    return null
  }

  /** @private */
  async _validateWithOperationMode (object, options, mode) {
    this._assertSupportedOptions(options)

    const errors = {}
    const workingObject = { ...object }
    const validationPromises = []
    const settings = this._buildOperationSettings(mode, object)

    for (const fieldName in object) {
      if (this.structure[fieldName] === undefined) {
        errors[fieldName] = { field: fieldName, code: 'FIELD_NOT_ALLOWED', message: 'Field not allowed', params: {} }
      }
    }

    const targetFields = mode === 'patch' ? Object.keys(object) : Object.keys(this.structure)
    for (const fieldName of targetFields) {
      validationPromises.push(
        this._validateField(fieldName, object, workingObject, options, settings)
      )
    }

    const results = await Promise.all(validationPromises)
    for (const error of results) {
      if (error) {
        errors[error.field] = error
      }
    }

    if (mode !== 'patch') {
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
   * Validates an object as a create payload.
   * Applies required checks and defaults, while leaving omitted optional fields omitted.
   * @param {object} object - The input object to validate.
   * @param {object} [options={}] - Validation options.
   * @returns {Promise<{validatedObject: object, errors: Object.<string, ValidationError>}>}
   */
  async create (object, options = {}) {
    return this._validateWithOperationMode(object, options, 'create')
  }

  /**
   * Validates an object as a full replacement payload.
   * Applies required checks and defaults, while leaving omitted fields omitted.
   * @param {object} object - The input object to validate.
   * @param {object} [options={}] - Validation options.
   * @returns {Promise<{validatedObject: object, errors: Object.<string, ValidationError>}>}
   */
  async replace (object, options = {}) {
    return this._validateWithOperationMode(object, options, 'replace')
  }

  /**
   * Validates an object as a partial update payload.
   * Only explicitly provided fields are validated and returned.
   * @param {object} object - The input object to validate.
   * @param {object} [options={}] - Validation options.
   * @returns {Promise<{validatedObject: object, errors: Object.<string, ValidationError>}>}
   */
  async patch (object, options = {}) {
    return this._validateWithOperationMode(object, options, 'patch')
  }

  /**
   * Exports the schema as a transport-facing JSON Schema object.
   * @param {{mode?: 'create'|'replace'|'patch', additionalProperties?: boolean}} [options={}] - Export options.
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

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
 * @property {{canBeNull: boolean, emptyAsNull: boolean}} computedOptions - Calculated options.
 * @property {string} [parameterName] - The name of the validator parameter being processed.
 * @property {any} [parameterValue] - The value of the validator parameter.
 */


/**
 * Represents an instance of a schema that can validate objects against a structure.
 * This class is instantiated by the SchemaManager.
 */
export class Schema {
  /**
   * @param {object} structure The schema definition.
   * @param {{types: object, validators: object}} registries The type and validator handlers.
   */
  constructor(structure, registries) {
    this.structure = structure;
    this.types = registries.types;
    this.validators = registries.validators;
  }

  // --- Private Helpers ---

  /** @private */
  _typeError(field) {
    return this._paramError(field, 'TYPE_CAST_FAILED', 'Value could not be cast to the required type.');
  }

  /** @private */
  _paramError(field, code, message, params = {}) {
    const e = new Error(message);
    e.errorObject = { field, code, message, params };
    return e;
  }
  
  /** @private */
  _paramToBeSkipped(parameterName, skipParams, fieldName) {
    if (typeof skipParams !== 'object' || skipParams === null) return false;
    if (Array.isArray(skipParams[fieldName]) && skipParams[fieldName].includes(parameterName)) return true;
    return false;
  }

  /**
   * Processes a single field through the entire validation pipeline (pre-checks, casting, validators).
   * This is the heart of the validation logic for an individual field.
   * @private
   * @param {string} fieldName - The name of the field to validate.
   * @param {object} object - The original input object.
   * @param {object} validatedObject - The object being built with validated data.
   * @param {object} options - The global validation options.
   * @returns {Promise<ValidationError|null>} An error object if validation fails, otherwise null.
   */
  async _validateField(fieldName, object, validatedObject, options) {
    const definition = this.structure[fieldName];
    if (!definition) return null;

    // --- 1. Pre-validation Checks ---
    if (Array.isArray(options.skipFields) && options.skipFields.includes(fieldName)) return null;

    if (definition.required && object[fieldName] === undefined) {
      if (!this._paramToBeSkipped('required', options.skipParams, fieldName)) {
        return { field: fieldName, code: 'REQUIRED', message: 'Field is required', params: {} };
      }
    }

    if (object[fieldName] === undefined) {
      // It's not required and it's not present, so we can stop processing this field.
      // The 'default' value will be applied in the main `validate` loop's post-processing step.
      return null;
    }
    
    const canBeNull = definition.canBeNull === true || options.canBeNull === true;
    const emptyAsNull = definition.emptyAsNull === true || options.emptyAsNull === true;

    if (object[fieldName] === null) {
      return canBeNull ? null : { field: fieldName, code: 'NOT_NULLABLE', message: 'Field cannot be null', params: {} };
    }

    if (String(object[fieldName]) === '' && emptyAsNull) {
      validatedObject[fieldName] = null;
      return null;
    }

    /** @type {ValidationContext} */
    const context = {
      schema: this,
      definition,
      value: validatedObject[fieldName],
      fieldName,
      object: validatedObject,
      objectBeforeCast: object,
      valueBeforeCast: object[fieldName],
      options,
      computedOptions: { canBeNull: canBeNull || emptyAsNull, emptyAsNull }
    };

    // --- 2. Type Casting ---
    const typeHandler = this.types[definition.type];
    if (!typeHandler) throw new Error(`No casting function for type: ${definition.type}`);

    try {
      const castResult = await typeHandler(context);
      if (castResult !== undefined) {
        validatedObject[fieldName] = castResult;
        context.value = castResult; // Update context for subsequent validators.
      }
    } catch (e) {
      if (e.errorObject) return e.errorObject; // It's a validation error.
      throw e; // It's an unexpected system error, re-throw it.
    }

    // --- 3. Parameter Validators ---
    for (const paramName in definition) {
      if (paramName === 'type') continue;
      if (this._paramToBeSkipped(paramName, options.skipParams, fieldName)) continue;
      
      const validatorHandler = this.validators[paramName];
      if (validatorHandler) {
        try {
          context.parameterName = paramName;
          context.parameterValue = definition[paramName];
          const validatorResult = await validatorHandler(context);
          if (validatorResult !== undefined) {
            validatedObject[fieldName] = validatorResult;
            context.value = validatorResult; // Update context value for the next validator.
          }
        } catch (e) {
          if (e.errorObject) return e.errorObject; // It's a validation error.
          throw e; // It's an unexpected system error.
        }
      }
    }
    return null; // Field is valid
  }


  // --- Public API ---
  
  /**
   * Validates an object against the schema structure.
   * This method orchestrates the validation process.
   * @param {object} object - The input object to validate.
   * @param {object} [options={}] - Validation options.
   * @returns {Promise<{validatedObject: object, errors: Object.<string, ValidationError>}>}
   */
  async validate(object, options = {}) {
    const errors = {};
    const validatedObject = { ...object };
    const validationPromises = [];

    // Step 1: Check for fields in the input that are not in the schema.
    for (const fieldName in object) {
      if (this.structure[fieldName] === undefined) {
        errors[fieldName] = { field: fieldName, code: 'FIELD_NOT_ALLOWED', message: 'Field not allowed', params: {} };
      }
    }

    // Step 2: Determine which fields to iterate over for validation.
    const targetFields = options.onlyObjectValues ? Object.keys(object) : Object.keys(this.structure);

    // Step 3: Concurrently validate all fields.
    for (const fieldName of targetFields) {
        validationPromises.push(
            this._validateField(fieldName, object, validatedObject, options)
        );
    }
    
    // Step 4: Collect results from all validation pipelines.
    const results = await Promise.all(validationPromises);
    for(const error of results) {
        if (error) {
            errors[error.field] = error;
        }
    }
    
    // Step 5: Post-process for defaults on fields that were not present in the input.
    // This happens ONLY if the object is otherwise valid, preventing hydration of partial data.
    if (Object.keys(errors).length === 0 && !options.onlyObjectValues) {
        for(const fieldName in this.structure) {
            if(validatedObject[fieldName] === undefined && this.structure[fieldName].default !== undefined) {
                const def = this.structure[fieldName].default;
                validatedObject[fieldName] = typeof def === 'function' ? def() : def;
            }
        }
    }
    
    return { validatedObject, errors };
  }

  /**
   * Utility to filter an object, keeping only fields that have a specific parameter.
   * @param {object} object - The object to clean.
   * @param {string} parameterName - The schema parameter to look for.
   * @returns {object} A new object with only the matching fields.
   */
  cleanup(object, parameterName) {
    const newObject = {};
    for (const k in object) {
      if (this.structure[k] && this.structure[k][parameterName]) {
        newObject[k] = object[k];
      }
    }
    return newObject;
  }
}

/**
 * @file Contains all the built-in type and validator handlers for the schema library.
 */

import * as flatted from 'flatted';

/**
 * @typedef {import('./Schema.js').ValidationContext} ValidationContext
 */

/**
 * The CorePlugin provides the default set of types and validators.
 */
const CorePlugin = {
  /**
   * Installs the core types and validators.
   * @param {{addType: Function, addValidator: Function}} api - An object containing registration functions.
   */
  install(api) {
    const { addType, addValidator } = api; // Destructure the API functions

    // --- Type Handlers ---

    addType('none', context => context.value);

    addType('file', context => {
      const val = context.value;
      if (val === undefined || val === null) context.throwTypeError();

      // Only attempt to convert primitives. Fail on complex objects/arrays.
      // A file is expected to be just a file handle
      const valType = typeof val;
      if (valType === 'string' || valType === 'number' || valType === 'boolean') {
          const s = val.toString();
          return context.definition.noTrim ? s : s.trim();
      }
      
      // If it's not a primitive that can be safely converted, it's a type error.
      context.throwTypeError();
    });


    addType('string', context => {
      const val = context.value;
      if (val === undefined || val === null) return '';

      // Only attempt to convert primitives. Fail on complex objects/arrays.
      const valType = typeof val;
      if (valType === 'string' || valType === 'number' || valType === 'boolean') {
          const s = val.toString();
          return context.definition.noTrim ? s : s.trim();
      }
      
      // If it's not a primitive that can be safely converted, it's a type error.
      context.throwTypeError();
    });

    addType('blob', context => context.value);
    addType('number', context => {
      if (context.value === undefined || context.value === null || context.value === '') return 0;
      const r = Number(context.value);
      if (isNaN(r)) context.throwTypeError();
      return r;
    });
    addType('timestamp', context => {
      const r = Number(context.value);
      if (isNaN(r)) context.throwTypeError();
      if (!r && context.computedOptions.canBeNull) return null;
      return r;
    });
    addType('dateTime', context => {
      if (!context.value || !Number(new Date(context.value))) return null;
      const d = new Date(context.value);
      if (isNaN(d)) context.throwTypeError();
      return d.toISOString().slice(0, 19).replace('T', ' ');
    });
    addType('date', context => {
      const r = context.schema.types.dateTime(context); // Access through context.schema.types
      return r && typeof r === 'string' ? r.slice(0, 10) : r;
    });
    addType('array', context => {
        if (context.definition.type === 'array' && !Array.isArray(context.value)) {
            return [context.value];
        }
        return context.value;
    });
    addType('object', context => context.value);
    addType('serialize', context => {
      try {
        return flatted.stringify(context.value);
      } catch (e) {
        context.throwTypeError();
      }
    });
    addType('boolean', context => {
      if (typeof context.value === 'string') {
        const falseVal = context.definition.stringFalseWhen || 'false';
        const trueVal = context.definition.stringTrueWhen || 'true';
        const lowerValue = context.value.toLowerCase();
        if (lowerValue === falseVal) return false;
        if ([trueVal, 'on'].includes(lowerValue)) return true;
        return false;
      }
      return !!context.value;
    });
    addType('id', context => {
      const n = parseInt(context.value, 10);
      if (isNaN(n)) context.throwTypeError();
      return n;
    });

    // --- Validator Handlers ---
    addValidator('min', context => {
      if (context.value === undefined) return;
      if (context.definition.type === 'number' && typeof context.value === 'number' && context.value < context.parameterValue) {
        context.throwParamError('MIN_VALUE', `Value must be at least ${context.parameterValue}.`, { min: context.parameterValue, actual: context.value });
      }
      if (context.definition.type === 'string' && context.value.toString && context.value.toString().length < context.parameterValue) {
        context.throwParamError('MIN_LENGTH', `Length must be at least ${context.parameterValue} characters.`, { min: context.parameterValue, actual: context.value.toString().length });
      }
    });
    addValidator('max', context => {
      if (context.value === undefined) return;
      if (context.definition.type === 'number' && typeof context.value === 'number' && context.value > context.parameterValue) {
        context.throwParamError('MAX_VALUE', `Value must be no more than ${context.parameterValue}.`, { max: context.parameterValue, actual: context.value });
      }
      if (context.definition.type === 'string' && context.value.toString && context.value.toString().length > context.parameterValue) {
        context.throwParamError('MAX_LENGTH', `Length must be no more than ${context.parameterValue} characters.`, { max: context.parameterValue, actual: context.value.toString().length });
      }
    });
    addValidator('validator', async context => {
        if (typeof context.parameterValue !== 'function') {
            throw new Error(`Validator for ${context.fieldName} must be a function.`);
        }
        const r = await context.parameterValue(context.value, context.object, context);
        if (typeof r === 'string') {
          context.throwParamError('CUSTOM_VALIDATOR_FAILED', r);
        }
    });
    addValidator('uppercase', context => {
        if (typeof context.value === 'string') return context.value.toUpperCase();
    });
    addValidator('lowercase', context => {
        if (typeof context.value === 'string') return context.value.toLowerCase();
    });
    addValidator('length', context => {
        if (typeof context.value === 'string') {
            return context.value.substr(0, context.parameterValue);
        } else if (Number.isInteger(Number(context.valueBeforeCast)) && String(context.valueBeforeCast).length > context.parameterValue) {
            context.throwParamError('RANGE_EXCEEDED', 'Numeric value is out of the allowed character range.', { max: context.parameterValue, actual: String(context.valueBeforeCast).length });
        }
    });
    addValidator('notEmpty', context => {
        const bc = context.valueBeforeCast;
        const bcs = (bc !== undefined && bc !== null && bc.toString) ? bc.toString() : '';
        if (context.parameterValue && !Array.isArray(context.value) && bc !== undefined && bcs === '') {
            context.throwParamError('NOT_EMPTY', 'Field cannot be empty.');
        }
    });
    addValidator('required', () => {}); // Stays as a no-op, logic is handled in _validateField  
  }
};

export default CorePlugin;

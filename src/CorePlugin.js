/**
 * @file Contains all the built-in type and validator handlers for the schema library.
 */

import * as flatted from 'flatted';

/**
 * @typedef {import('./Schema.js').ValidationContext} ValidationContext
 * @typedef {import('./SchemaManager.js').SchemaManager} SchemaManager
 */

/**
 * The CorePlugin provides the default set of types and validators.
 */
const CorePlugin = {
  /**
   * Installs the core types and validators into the SchemaManager.
   * @param {SchemaManager} manager - The schema manager instance.
   */
  install(manager) {
    // --- Type Handlers ---

    manager.addType('none', context => context.value);
    
    // CORRECTED: This handler is now more robust.
    manager.addType('string', context => {
      const val = context.value;
      if (val === undefined || val === null) return '';

      // Only attempt to convert primitives. Fail on complex objects/arrays.
      const valType = typeof val;
      if (valType === 'string' || valType === 'number' || valType === 'boolean') {
          const s = val.toString();
          return context.definition.noTrim ? s : s.trim();
      }
      
      // If it's not a primitive that can be safely converted, it's a type error.
      throw context.schema._typeError(context.fieldName);
    });

    manager.addType('blob', context => context.value);
    manager.addType('number', context => {
      if (context.value === undefined || context.value === null || context.value === '') return 0;
      const r = Number(context.value);
      if (isNaN(r)) throw context.schema._typeError(context.fieldName);
      return r;
    });
    manager.addType('timestamp', context => {
      const r = Number(context.value);
      if (isNaN(r)) throw context.schema._typeError(context.fieldName);
      if (!r && context.computedOptions.canBeNull) return null;
      return r;
    });
    manager.addType('dateTime', context => {
      if (!context.value || !Number(new Date(context.value))) return null;
      const d = new Date(context.value);
      if (isNaN(d)) throw context.schema._typeError(context.fieldName);
      return d.toISOString().slice(0, 19).replace('T', ' ');
    });
    manager.addType('date', context => {
      const r = manager.types.dateTime(context);
      return r && typeof r === 'string' ? r.slice(0, 10) : r;
    });
    manager.addType('array', context => Array.isArray(context.value) ? context.value : [context.value]);
    manager.addType('object', context => context.value);
    manager.addType('serialize', context => {
      try {
        return flatted.stringify(context.value);
      } catch (e) {
        throw context.schema._typeError(context.fieldName);
      }
    });
    manager.addType('boolean', context => {
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
    manager.addType('id', context => {
      const n = parseInt(context.value, 10);
      if (isNaN(n)) throw context.schema._typeError(context.fieldName);
      return n;
    });

    // --- Validator Handlers ---
    manager.addValidator('min', context => {
      if (context.value === undefined) return;
      if (context.definition.type === 'number' && typeof context.value === 'number' && context.value < context.parameterValue) {
        throw context.schema._paramError(context.fieldName, 'MIN_VALUE', `Value must be at least ${context.parameterValue}.`, { min: context.parameterValue, actual: context.value });
      }
      if (context.definition.type === 'string' && context.value.toString && context.value.toString().length < context.parameterValue) {
        throw context.schema._paramError(context.fieldName, 'MIN_LENGTH', `Length must be at least ${context.parameterValue} characters.`, { min: context.parameterValue, actual: context.value.toString().length });
      }
    });
    manager.addValidator('max', context => {
      if (context.value === undefined) return;
      if (context.definition.type === 'number' && typeof context.value === 'number' && context.value > context.parameterValue) {
        throw context.schema._paramError(context.fieldName, 'MAX_VALUE', `Value must be no more than ${context.parameterValue}.`, { max: context.parameterValue, actual: context.value });
      }
      if (context.definition.type === 'string' && context.value.toString && context.value.toString().length > context.parameterValue) {
        throw context.schema._paramError(context.fieldName, 'MAX_LENGTH', `Length must be no more than ${context.parameterValue} characters.`, { max: context.parameterValue, actual: context.value.toString().length });
      }
    });
    manager.addValidator('validator', async context => {
        if (typeof context.parameterValue !== 'function') {
            throw new Error(`Validator for ${context.fieldName} must be a function.`);
        }
        const r = await context.parameterValue(context.value, context.object, context);
        if (typeof r === 'string') {
          throw context.schema._paramError(context.fieldName, 'CUSTOM_VALIDATOR_FAILED', r);
        }
    });
    manager.addValidator('uppercase', context => {
        if (typeof context.value === 'string') return context.value.toUpperCase();
    });
    manager.addValidator('lowercase', context => {
        if (typeof context.value === 'string') return context.value.toLowerCase();
    });
    manager.addValidator('length', context => {
        if (typeof context.value === 'string') {
            return context.value.substr(0, context.parameterValue);
        } else if (Number.isInteger(Number(context.valueBeforeCast)) && String(context.valueBeforeCast).length > context.parameterValue) {
            throw context.schema._paramError(context.fieldName, 'RANGE_EXCEEDED', 'Numeric value is out of the allowed character range.', { max: context.parameterValue, actual: String(context.valueBeforeCast).length });
        }
    });
    manager.addValidator('notEmpty', context => {
        const bc = context.valueBeforeCast;
        const bcs = (bc !== undefined && bc !== null && bc.toString) ? bc.toString() : '';
        if (context.parameterValue && !Array.isArray(context.value) && bc !== undefined && bcs === '') {
            throw context.schema._paramError(context.fieldName, 'NOT_EMPTY', 'Field cannot be empty.');
        }
    });
    manager.addValidator('required', () => {}); // Stays as a no-op, logic is handled in _validateField  
  }
};

export default CorePlugin;


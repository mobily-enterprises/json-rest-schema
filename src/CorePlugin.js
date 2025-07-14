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
      if (!r && context.computedOptions.nullable) return null;
      return r;
    });
    addType('dateTime', context => {
      if (!context.value || context.value === '') return null;
      
      // If already a Date object, return it
      if (context.value instanceof Date) {
        return isNaN(context.value.getTime()) ? null : context.value;
      }
      
      // Handle string values
      if (typeof context.value === 'string') {
        // Detect MySQL datetime format: 'YYYY-MM-DD HH:MM:SS'
        const isMySQLFormat = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(context.value) &&
                             !context.value.includes('T') && 
                             !context.value.includes('Z');
        
        if (isMySQLFormat) {
          // Convert to ISO format and force UTC interpretation
          const d = new Date(context.value.replace(' ', 'T') + 'Z');
          if (isNaN(d.getTime())) {
            context.throwTypeError();
          }
          return d;
        }
      }
      
      // Try to parse the value normally
      const d = new Date(context.value);
      if (isNaN(d.getTime())) {
        context.throwTypeError();
      }
      
      // Return the Date object directly - let Knex handle the database formatting
      return d;
    });
    addType('date', context => {
      if (!context.value || context.value === '') return null;
      
      // If already a Date object, return it
      if (context.value instanceof Date) {
        return isNaN(context.value.getTime()) ? null : context.value;
      }
      
      // For date-only strings, ensure we parse at UTC midnight to avoid timezone issues
      let dateStr = String(context.value);
      
      // If it's just a date (YYYY-MM-DD), add time at UTC midnight
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        dateStr += 'T00:00:00Z';
      }
      
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) {
        context.throwTypeError();
      }
      
      // Return the Date object directly - let Knex handle the database formatting
      return d;
    });
    addType('time', context => {
      if (!context.value || context.value === '') return null;
      
      // Try to parse as time string (HH:MM:SS or HH:MM)
      if (typeof context.value === 'string') {
        // Match HH:MM:SS or HH:MM format
        const timeMatch = context.value.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
        if (timeMatch) {
          const hours = parseInt(timeMatch[1], 10);
          const minutes = parseInt(timeMatch[2], 10);
          const seconds = timeMatch[3] ? parseInt(timeMatch[3], 10) : 0;
          
          // Validate ranges
          if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59 && seconds >= 0 && seconds <= 59) {
            // Return normalized HH:MM:SS format as string
            // Note: We return string because most databases don't have a true time-only type
            return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
          }
        }
      }
      
      // Try to extract time from a Date object or datetime string
      try {
        const d = new Date(context.value);
        if (!isNaN(d.getTime())) {
          // Extract time portion in HH:MM:SS format
          return d.toISOString().slice(11, 19);
        }
      } catch (e) {
        // Invalid date
      }
      
      context.throwTypeError();
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
        // First try regular JSON.stringify for non-circular objects
        return JSON.stringify(context.value);
      } catch (e) {
        // If that fails (likely circular reference), use flatted
        try {
          return flatted.stringify(context.value);
        } catch (e2) {
          context.throwTypeError();
        }
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
    addValidator('minLength', context => {
      if (context.value === undefined) return;
      if (context.definition.type === 'string' && context.value.toString && context.value.toString().length < context.parameterValue) {
        context.throwParamError('MIN_LENGTH', `Length must be at least ${context.parameterValue} characters.`, { min: context.parameterValue, actual: context.value.toString().length });
      }
    });
    
    addValidator('min', context => {
      if (context.value === undefined) return;
      if (context.definition.type === 'number' && typeof context.value === 'number' && context.value < context.parameterValue) {
        context.throwParamError('MIN_VALUE', `Value must be at least ${context.parameterValue}.`, { min: context.parameterValue, actual: context.value });
      }
    });
    addValidator('maxLength', context => {
      if (context.value === undefined) return;
      if (context.definition.type === 'string' && context.value.toString && context.value.toString().length > context.parameterValue) {
        context.throwParamError('MAX_LENGTH', `Length must be no more than ${context.parameterValue} characters.`, { max: context.parameterValue, actual: context.value.toString().length });
      }
    });
    
    addValidator('max', context => {
      if (context.value === undefined) return;
      if (context.definition.type === 'number' && typeof context.value === 'number' && context.value > context.parameterValue) {
        context.throwParamError('MAX_VALUE', `Value must be no more than ${context.parameterValue}.`, { max: context.parameterValue, actual: context.value });
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
    
    // Add new validators for database alignment
    addValidator('unsigned', () => {}); // No-op, used for schema metadata
    addValidator('precision', () => {}); // No-op, used for schema metadata
    addValidator('scale', () => {}); // No-op, used for schema metadata
    addValidator('nullable', () => {}); // No-op, handled in Schema.js
    addValidator('nullOnEmpty', () => {}); // No-op, handled in Schema.js
    addValidator('defaultTo', () => {}); // No-op, handled in Schema.js  
  }
};

export default CorePlugin;

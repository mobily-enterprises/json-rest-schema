/**
 * @file Contains all the built-in type and validator handlers for the schema library.
 */

import * as flatted from 'flatted'
import { isNumericDefinition } from './definition-helpers.js'

/**
 * @typedef {import('./Schema.js').ValidationContext} ValidationContext
 */

const DEFAULT_BOOLEAN_TRUE_VALUES = new Set(['true', '1', 'yes', 'y', 'on'])
const DEFAULT_BOOLEAN_FALSE_VALUES = new Set(['false', '0', 'no', 'n', 'off'])

function isThenable (value) {
  return value !== null &&
    (typeof value === 'object' || typeof value === 'function') &&
    typeof value.then === 'function'
}

function normalizeFiniteNumberInput (value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }

  if (typeof value === 'bigint') {
    const numberValue = Number(value)
    return Number.isSafeInteger(numberValue) ? numberValue : null
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed === '') return null
    const numberValue = Number(trimmed)
    return Number.isFinite(numberValue) ? numberValue : null
  }

  return null
}

function deepEqual (left, right) {
  if (Object.is(left, right)) return true

  if (left instanceof Date && right instanceof Date) {
    return left.getTime() === right.getTime()
  }

  if (left instanceof RegExp && right instanceof RegExp) {
    return left.source === right.source && left.flags === right.flags
  }

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) return false
    if (left.length !== right.length) return false

    for (let index = 0; index < left.length; index++) {
      if (!deepEqual(left[index], right[index])) return false
    }

    return true
  }

  if (
    left === null ||
    right === null ||
    typeof left !== 'object' ||
    typeof right !== 'object'
  ) {
    return false
  }

  if (Object.getPrototypeOf(left) !== Object.getPrototypeOf(right)) {
    return false
  }

  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)

  if (leftKeys.length !== rightKeys.length) return false

  for (const key of leftKeys) {
    if (!Object.hasOwn(right, key)) return false
    if (!deepEqual(left[key], right[key])) return false
  }

  return true
}

/**
 * The CorePlugin provides the default set of types and validators.
 */
const CorePlugin = {
  /**
   * Installs the core types and validators.
   * @param {{addType: Function, addValidator: Function}} api - An object containing registration functions.
   */
  install (api) {
    const { addType, addValidator } = api // Destructure the API functions

    // --- Type Handlers ---

    addType('none', context => context.value)

    addType('file', context => {
      const val = context.value
      if (val === undefined || val === null) context.throwTypeError()

      // Only attempt to convert primitives. Fail on complex objects/arrays.
      // A file is expected to be just a file handle
      const valType = typeof val
      if (valType === 'string' || valType === 'number' || valType === 'boolean') {
        const s = val.toString()
        return context.definition.noTrim ? s : s.trim()
      }

      // If it's not a primitive that can be safely converted, it's a type error.
      context.throwTypeError()
    })

    addType('string', context => {
      const val = context.value
      if (val === undefined || val === null) return ''

      // Only attempt to convert primitives. Fail on complex objects/arrays.
      const valType = typeof val
      if (valType === 'string' || valType === 'number' || valType === 'boolean') {
        const s = val.toString()
        return context.definition.noTrim ? s : s.trim()
      }

      // If it's not a primitive that can be safely converted, it's a type error.
      context.throwTypeError()
    })

    addType('blob', context => context.value)
    addType('number', context => {
      const numberValue = normalizeFiniteNumberInput(context.value)
      if (numberValue === null) context.throwTypeError()
      return numberValue
    })
    addType('integer', context => {
      const numberValue = normalizeFiniteNumberInput(context.value)
      if (numberValue === null || !Number.isInteger(numberValue)) context.throwTypeError()
      return numberValue
    })
    addType('timestamp', context => {
      if (typeof context.value === 'string' && context.value.trim() === '') {
        context.throwTypeError()
      }
      const r = Number(context.value)
      if (isNaN(r)) context.throwTypeError()
      return r
    })
    addType('dateTime', context => {
      if (typeof context.value === 'string' && context.value.trim() === '') {
        context.throwTypeError()
      }

      // If already a Date object, return it
      if (context.value instanceof Date) {
        if (isNaN(context.value.getTime())) context.throwTypeError()
        return context.value
      }

      // Handle string values
      if (typeof context.value === 'string') {
        // Detect MySQL datetime format: 'YYYY-MM-DD HH:MM:SS'
        const isMySQLFormat = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(context.value) &&
                             !context.value.includes('T') &&
                             !context.value.includes('Z')

        if (isMySQLFormat) {
          // Convert to ISO format and force UTC interpretation
          const d = new Date(context.value.replace(' ', 'T') + 'Z')
          if (isNaN(d.getTime())) {
            context.throwTypeError()
          }
          return d
        }
      }

      // Try to parse the value normally
      const d = new Date(context.value)
      if (isNaN(d.getTime())) {
        context.throwTypeError()
      }

      // Return the Date object directly - let Knex handle the database formatting
      return d
    })
    addType('date', context => {
      if (!context.value || context.value === '') return null

      // Parse the input value to a Date object
      let d
      if (context.value instanceof Date) {
        d = context.value
      } else {
        let dateStr = String(context.value)

        // If it's just a date (YYYY-MM-DD), add time at UTC midnight
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
          dateStr += 'T00:00:00Z'
        }

        d = new Date(dateStr)
      }

      if (isNaN(d.getTime())) {
        context.throwTypeError()
      }

      // Normalize to midnight UTC
      const normalized = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
      return normalized
    })
    addType('time', context => {
      if (!context.value || context.value === '') return null

      // Try to parse as time string (HH:MM:SS or HH:MM)
      if (typeof context.value === 'string') {
        // Match HH:MM:SS or HH:MM format
        const timeMatch = context.value.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
        if (timeMatch) {
          const hours = parseInt(timeMatch[1], 10)
          const minutes = parseInt(timeMatch[2], 10)
          const seconds = timeMatch[3] ? parseInt(timeMatch[3], 10) : 0

          // Validate ranges
          if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59 && seconds >= 0 && seconds <= 59) {
            // Return normalized HH:MM:SS format as string
            // Note: We return string because most databases don't have a true time-only type
            return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
          }
        }
      }

      // Try to extract time from a Date object or datetime string
      try {
        const d = new Date(context.value)
        if (!isNaN(d.getTime())) {
          // Extract time portion in HH:MM:SS format
          return d.toISOString().slice(11, 19)
        }
      } catch (e) {
        // Invalid date
      }

      context.throwTypeError()
    })
    addType('array', context => {
      if (context.definition.type === 'array' && !Array.isArray(context.value)) {
        return [context.value]
      }
      return context.value
    })
    addType('object', context => {
      if (context.value === null || typeof context.value !== 'object' || Array.isArray(context.value)) {
        context.throwTypeError()
      }

      return context.value
    })
    addType('serialize', context => {
      try {
        // First try regular JSON.stringify for non-circular objects
        return JSON.stringify(context.value)
      } catch (e) {
        // If that fails (likely circular reference), use flatted
        try {
          return flatted.stringify(context.value)
        } catch (e2) {
          context.throwTypeError()
        }
      }
    })
    addType('boolean', context => {
      if (typeof context.value === 'boolean') {
        return context.value
      }

      if (typeof context.value === 'number') {
        if (context.value === 1) return true
        if (context.value === 0) return false
        context.throwTypeError()
      }

      if (typeof context.value === 'bigint') {
        if (context.value === 1n) return true
        if (context.value === 0n) return false
        context.throwTypeError()
      }

      if (typeof context.value === 'string') {
        const falseVal = String(context.definition.stringFalseWhen || 'false').trim().toLowerCase()
        const trueVal = String(context.definition.stringTrueWhen || 'true').trim().toLowerCase()
        const lowerValue = context.value.trim().toLowerCase()
        const falseValues = new Set([...DEFAULT_BOOLEAN_FALSE_VALUES, falseVal])
        const trueValues = new Set([...DEFAULT_BOOLEAN_TRUE_VALUES, trueVal])

        if (falseValues.has(lowerValue)) return false
        if (trueValues.has(lowerValue)) return true
      }

      context.throwTypeError()
    })
    addType('id', context => {
      if (typeof context.value === 'number') {
        if (Number.isSafeInteger(context.value) && context.value > 0) {
          return context.value
        }
        context.throwTypeError()
      }

      if (typeof context.value === 'bigint') {
        if (context.value > 0n && context.value <= BigInt(Number.MAX_SAFE_INTEGER)) {
          return Number(context.value)
        }
        context.throwTypeError()
      }

      if (typeof context.value === 'string') {
        const trimmed = context.value.trim()
        if (!/^[1-9][0-9]*$/.test(trimmed)) {
          context.throwTypeError()
        }

        const numberValue = Number(trimmed)
        if (!Number.isSafeInteger(numberValue)) {
          context.throwTypeError()
        }

        return numberValue
      }

      context.throwTypeError()
    })

    // --- Validator Handlers ---
    addValidator('minLength', context => {
      if (context.value === undefined) return
      if (context.definition.type === 'string' && context.value.toString && context.value.toString().length < context.parameterValue) {
        context.throwParamError('MIN_LENGTH', `Length must be at least ${context.parameterValue} characters.`, { min: context.parameterValue, actual: context.value.toString().length })
      }
    })

    addValidator('min', context => {
      if (context.value === undefined) return
      if (isNumericDefinition(context.definition) && typeof context.value === 'number' && context.value < context.parameterValue) {
        context.throwParamError('MIN_VALUE', `Value must be at least ${context.parameterValue}.`, { min: context.parameterValue, actual: context.value })
      }
    })
    addValidator('maxLength', context => {
      if (context.value === undefined) return
      if (context.definition.type === 'string' && context.value.toString && context.value.toString().length > context.parameterValue) {
        context.throwParamError('MAX_LENGTH', `Length must be no more than ${context.parameterValue} characters.`, { max: context.parameterValue, actual: context.value.toString().length })
      }
    })

    addValidator('max', context => {
      if (context.value === undefined) return
      if (isNumericDefinition(context.definition) && typeof context.value === 'number' && context.value > context.parameterValue) {
        context.throwParamError('MAX_VALUE', `Value must be no more than ${context.parameterValue}.`, { max: context.parameterValue, actual: context.value })
      }
    })
    addValidator('enum', context => {
      if (!Array.isArray(context.parameterValue)) {
        throw new Error(`Enum for ${context.fieldName} must be an array.`)
      }

      const matches = context.parameterValue.some(allowedValue => deepEqual(allowedValue, context.value))
      if (!matches) {
        context.throwParamError('ENUM_VALUE', 'Value must match one of the allowed enum values.', {
          allowed: context.parameterValue
        })
      }
    })
    addValidator('pattern', context => {
      if (context.value === undefined) return
      if (context.definition.type !== 'string' || typeof context.value !== 'string') return

      const patternValue = context.parameterValue
      const matcher = patternValue instanceof RegExp
        ? patternValue
        : typeof patternValue === 'string'
          ? new RegExp(patternValue)
          : null

      if (!matcher) {
        throw new Error(`Pattern for ${context.fieldName} must be a string or RegExp.`)
      }

      if (!matcher.test(context.value)) {
        context.throwParamError('PATTERN', 'Value does not match the required pattern.', {
          pattern: matcher.source
        })
      }
    })
    addValidator('strictBoolean', context => {
      if (!context.parameterValue) return
      if (context.definition.type !== 'boolean') {
        throw new Error(`strictBoolean can only be used on boolean fields (${context.fieldName}).`)
      }
      if (typeof context.valueBeforeCast !== 'boolean') {
        context.throwParamError('STRICT_BOOLEAN', 'Value must be a boolean.')
      }
    })
    addValidator('validator', context => {
      if (typeof context.parameterValue !== 'function') {
        throw new Error(`Validator for ${context.fieldName} must be a function.`)
      }
      const r = context.parameterValue(context.value, context.object, context)
      if (isThenable(r)) {
        throw new Error(`Custom validator for "${context.fieldName}" must be synchronous.`)
      }
      if (typeof r === 'string') {
        context.throwParamError('CUSTOM_VALIDATOR_FAILED', r)
      }
    })
    addValidator('uppercase', context => {
      if (typeof context.value === 'string') return context.value.toUpperCase()
    })
    addValidator('lowercase', context => {
      if (typeof context.value === 'string') return context.value.toLowerCase()
    })
    addValidator('length', context => {
      if (typeof context.value === 'string') {
        return context.value.substr(0, context.parameterValue)
      } else if (Number.isInteger(Number(context.valueBeforeCast)) && String(context.valueBeforeCast).length > context.parameterValue) {
        context.throwParamError('RANGE_EXCEEDED', 'Numeric value is out of the allowed character range.', { max: context.parameterValue, actual: String(context.valueBeforeCast).length })
      }
    })
    addValidator('notEmpty', context => {
      const bc = context.valueBeforeCast
      const bcs = (bc !== undefined && bc !== null && bc.toString) ? bc.toString() : ''
      if (context.parameterValue && !Array.isArray(context.value) && bc !== undefined && bcs === '') {
        context.throwParamError('NOT_EMPTY', 'Field cannot be empty.')
      }
    })
    addValidator('required', () => {}) // Stays as a no-op, logic is handled in _validateField

    // Add new validators for database alignment
    addValidator('unsigned', () => {}) // No-op, used for schema metadata
    addValidator('precision', () => {}) // No-op, used for schema metadata
    addValidator('scale', () => {}) // No-op, used for schema metadata
    addValidator('temporalPrecision', () => {}) // No-op, used for schema metadata
    addValidator('nullable', () => {}) // No-op, handled in Schema.js
    addValidator('nullOnEmpty', () => {}) // No-op, handled in Schema.js
    addValidator('defaultTo', () => {}) // No-op, handled in Schema.js
  }
}

export default CorePlugin

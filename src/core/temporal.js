/**
 * @file Shared validation contracts for JSON-native temporal values.
 */

export const EPOCH_MILLISECONDS_LIMIT = 8640000000000000
export const EPOCH_SECONDS_LIMIT = 8640000000000

export const EPOCH_INTEGER_STRING_PATTERN = '^(?:0|-?[1-9]\\d*)$'

const YEAR_PATTERN = '\\d{4}'
const MONTH_PATTERN = '0[1-9]|1[0-2]'
const DAY_PATTERN = '0[1-9]|[12]\\d|3[01]'
const HOUR_PATTERN = '[01]\\d|2[0-3]'
const MINUTE_OR_SECOND_PATTERN = '[0-5]\\d'
const HOUR_MINUTE_PATTERN = `(?:${HOUR_PATTERN}):${MINUTE_OR_SECOND_PATTERN}`
const TIME_ZONE_PATTERN = `(?:Z|[+-](?:${HOUR_PATTERN}):${MINUTE_OR_SECOND_PATTERN})`
const CAPTURED_DATE_PATTERN = `(${YEAR_PATTERN})-(${MONTH_PATTERN})-(${DAY_PATTERN})`
const JSON_SCHEMA_DATE_PATTERN = `${YEAR_PATTERN}-(?:${MONTH_PATTERN})-(?:${DAY_PATTERN})`

export const DATE_JSON_SCHEMA_PATTERN = `^${JSON_SCHEMA_DATE_PATTERN}$`

const DATE_PATTERN = new RegExp(`^${CAPTURED_DATE_PATTERN}$`)
const TIME_PATTERN = new RegExp(`^${HOUR_MINUTE_PATTERN}(?::${MINUTE_OR_SECOND_PATTERN}(?:\\.(\\d+))?)?$`)
const DATE_TIME_PATTERN = new RegExp(`^${CAPTURED_DATE_PATTERN}T${HOUR_MINUTE_PATTERN}:${MINUTE_OR_SECOND_PATTERN}(?:\\.(\\d+))?${TIME_ZONE_PATTERN}$`)
const EPOCH_INTEGER_STRING = new RegExp(EPOCH_INTEGER_STRING_PATTERN)
const DAYS_PER_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

function isLeapYear (year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
}

function daysInMonth (year, month) {
  if (month === 2) return isLeapYear(year) ? 29 : 28
  return DAYS_PER_MONTH[month - 1]
}

function isValidCalendarDateParts (yearText, monthText, dayText) {
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)

  return month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth(year, month)
}

export function resolveTemporalPrecision (definition, fieldName) {
  const precision = definition.temporalPrecision
  if (precision === undefined) return undefined

  if (!Number.isInteger(precision) || precision < 0) {
    throw new Error(`temporalPrecision for "${fieldName}" must be a non-negative integer.`)
  }

  return precision
}

function hasAllowedFractionalPrecision (fraction, temporalPrecision) {
  if (fraction === undefined) return true
  return temporalPrecision === undefined || fraction.length <= temporalPrecision
}

export function isValidDate (value) {
  if (typeof value !== 'string') return false
  const match = DATE_PATTERN.exec(value)
  return match !== null && isValidCalendarDateParts(match[1], match[2], match[3])
}

export function isValidTime (value, temporalPrecision) {
  if (typeof value !== 'string') return false
  const match = TIME_PATTERN.exec(value)
  return match !== null && hasAllowedFractionalPrecision(match[1], temporalPrecision)
}

export function isValidDateTime (value, temporalPrecision) {
  if (typeof value !== 'string') return false
  const match = DATE_TIME_PATTERN.exec(value)
  if (match === null) return false

  return isValidCalendarDateParts(match[1], match[2], match[3]) &&
    hasAllowedFractionalPrecision(match[4], temporalPrecision)
}

function fractionalPattern (temporalPrecision) {
  if (temporalPrecision === undefined) return '(?:\\.\\d+)?'
  if (temporalPrecision === 0) return ''
  return `(?:\\.\\d{1,${temporalPrecision}})?`
}

export function timeJsonSchemaPattern (definition, fieldName) {
  const precision = resolveTemporalPrecision(definition, fieldName)
  return `^${HOUR_MINUTE_PATTERN}(?::${MINUTE_OR_SECOND_PATTERN}${fractionalPattern(precision)})?$`
}

export function dateTimeJsonSchemaPattern (definition, fieldName) {
  const precision = resolveTemporalPrecision(definition, fieldName)
  return `^${JSON_SCHEMA_DATE_PATTERN}T${HOUR_MINUTE_PATTERN}:${MINUTE_OR_SECOND_PATTERN}${fractionalPattern(precision)}${TIME_ZONE_PATTERN}$`
}

export function castEpochInteger (value, limit) {
  let integerValue

  if (typeof value === 'number') {
    integerValue = value
  } else if (typeof value === 'string' && EPOCH_INTEGER_STRING.test(value)) {
    integerValue = Number(value)
  } else {
    return null
  }

  if (
    !Number.isSafeInteger(integerValue) ||
    integerValue < -limit ||
    integerValue > limit
  ) {
    return null
  }

  return integerValue === 0 ? 0 : integerValue
}

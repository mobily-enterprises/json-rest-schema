/**
 * @file Small helper utilities for working with the flat dotted-path error map.
 */

import {
  buildPathSegments,
  isNumericSegment,
  isObjectLike,
  joinPath,
  setOwnProperty
} from './path-helpers.js'

function isValidationErrorObject (value) {
  return isObjectLike(value) &&
    typeof value.field === 'string' &&
    typeof value.code === 'string' &&
    typeof value.message === 'string' &&
    Object.hasOwn(value, 'params')
}

function flattenNestedErrorsInto (nestedValue, currentPath, flatErrors) {
  if (!isObjectLike(nestedValue)) {
    throw new Error(`flattenErrors() found an invalid nested error value at "${currentPath}".`)
  }

  if (isValidationErrorObject(nestedValue)) {
    if (currentPath === '') {
      throw new Error('flattenErrors() cannot flatten a root-level error object without a path.')
    }

    buildPathSegments(currentPath, 'flattenErrors')
    setOwnProperty(flatErrors, currentPath, nestedValue)
    return
  }

  const entries = Array.isArray(nestedValue)
    ? Object.entries(nestedValue)
    : Object.entries(nestedValue).sort(([left], [right]) => left.localeCompare(right))

  for (const [segment, childValue] of entries) {
    flattenNestedErrorsInto(childValue, joinPath(currentPath, segment), flatErrors)
  }
}

/**
 * Reads one error object from a flat dotted-path error map.
 * @param {Object.<string, object>} errors
 * @param {string} path
 * @returns {object|undefined}
 */
export function getError (errors, path) {
  buildPathSegments(path, 'getError')
  if (!isObjectLike(errors)) return undefined
  return Object.hasOwn(errors, path) ? errors[path] : undefined
}

/**
 * Checks whether a flat dotted-path error map contains a specific path.
 * @param {Object.<string, object>} errors
 * @param {string} path
 * @returns {boolean}
 */
export function hasError (errors, path) {
  return getError(errors, path) !== undefined
}

/**
 * Converts a flat dotted-path error map into a nested object/array structure.
 * @param {Object.<string, object>} errors
 * @returns {object}
 */
export function nestErrors (errors) {
  if (!isObjectLike(errors)) return {}

  const nestedErrors = {}

  for (const [path, error] of Object.entries(errors)) {
    const segments = buildPathSegments(path, 'nestErrors')
    let currentNode = nestedErrors

    for (let index = 0; index < segments.length; index++) {
      const segment = segments[index]
      const isLast = index === segments.length - 1

      if (isLast) {
        setOwnProperty(currentNode, segment, error)
        continue
      }

      const hasExistingNode = Object.hasOwn(currentNode, segment)
      const existingNode = hasExistingNode ? currentNode[segment] : undefined
      if (hasExistingNode && (!isObjectLike(existingNode) || isValidationErrorObject(existingNode))) {
        throw new Error(`nestErrors() cannot nest conflicting path "${path}".`)
      }

      if (!hasExistingNode) {
        const nextSegment = segments[index + 1]
        setOwnProperty(currentNode, segment, isNumericSegment(nextSegment) ? [] : {})
      }

      currentNode = currentNode[segment]
    }
  }

  return nestedErrors
}

/**
 * Converts a nested object/array error structure into the flat dotted-path map.
 * @param {object} nestedErrors
 * @returns {Object.<string, object>}
 */
export function flattenErrors (nestedErrors) {
  if (!isObjectLike(nestedErrors)) return {}

  const flatErrors = {}
  flattenNestedErrorsInto(nestedErrors, '', flatErrors)
  return flatErrors
}

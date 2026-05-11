/**
 * @file Shared helper utilities for UI adapter entry points.
 */

import { setOwnProperty } from './path-helpers.js'
import { isPlainObject } from './object-helpers.js'

export {
  getNestedValue,
  normalizeFieldPath,
  pathToSegments,
  setNestedValue,
  uniqueNormalizedPaths
} from './path-helpers.js'

export { isPlainObject } from './object-helpers.js'

export function isRefLike (value) {
  return value !== null && typeof value === 'object' && Object.hasOwn(value, 'value')
}

export function cloneValue (value) {
  if (Array.isArray(value)) {
    return value.map(item => cloneValue(item))
  }

  if (isPlainObject(value)) {
    const clonedObject = {}

    for (const [key, nestedValue] of Object.entries(value)) {
      setOwnProperty(clonedObject, key, cloneValue(nestedValue))
    }

    return clonedObject
  }

  return value
}

export function readSourceValue (source) {
  if (typeof source === 'function') {
    return source()
  }

  if (isRefLike(source)) {
    return source.value
  }

  return source
}

function syncArrayContainer (target, value) {
  target.length = 0

  if (!Array.isArray(value)) {
    throw new Error('State container array cannot be replaced with a non-array value.')
  }

  for (const item of value) {
    target.push(cloneValue(item))
  }
}

function syncObjectContainer (target, value) {
  if (!isPlainObject(value)) {
    throw new Error('State container object cannot be replaced with a non-object value.')
  }

  for (const key of Object.keys(target)) {
    delete target[key]
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    setOwnProperty(target, key, cloneValue(nestedValue))
  }
}

export function replaceContainerValue (container, value) {
  if (isRefLike(container)) {
    container.value = cloneValue(value)
    return
  }

  if (Array.isArray(container)) {
    syncArrayContainer(container, value)
    return
  }

  if (isPlainObject(container)) {
    syncObjectContainer(container, value)
    return
  }

  throw new Error('State container must be a ref-like object, array, or plain object.')
}

export function createStateBox (initialValue) {
  return { value: cloneValue(initialValue) }
}

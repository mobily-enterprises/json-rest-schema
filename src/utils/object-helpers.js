/**
 * @file Shared object-shape helpers.
 */

export function isPlainObject (value) {
  if (value === null || typeof value !== 'object') return false

  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

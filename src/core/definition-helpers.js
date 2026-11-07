/**
 * @file Shared schema-definition predicates used by runtime and transport code.
 */
import { isPlainObject } from '../utils/object-helpers.js'

export function isNumericDefinition (definition) {
  return definition?.type === 'number' ||
    definition?.type === 'integer' ||
    definition?.type === 'epochMilliseconds' ||
    definition?.type === 'epochSeconds'
}

/**
 * Refuses a minItems or maxItems that would not bound an array's length: on a
 * field that is not an array, not a non-negative integer, or a minItems above
 * maxItems. Checks array item definitions too; nested schemas check their own.
 * @param {object} structure
 * @param {string} [parentPath]
 */
export function assertArrayLengthDefinitions (structure, parentPath = '') {
  if (!isPlainObject(structure)) return
  for (const [fieldName, definition] of Object.entries(structure)) {
    if (!isPlainObject(definition)) continue
    const fieldPath = parentPath ? `${parentPath}.${fieldName}` : fieldName
    for (const keyword of ['minItems', 'maxItems']) {
      if (!Object.hasOwn(definition, keyword)) continue
      const value = definition[keyword]
      if (definition.type !== 'array' || !Number.isInteger(value) || value < 0) {
        throw new Error(`Field "${fieldPath}" ${keyword} must be a non-negative integer on an array field.`)
      }
    }
    if (definition.minItems > definition.maxItems) {
      throw new Error(`Field "${fieldPath}" minItems (${definition.minItems}) is above its maxItems (${definition.maxItems}).`)
    }
    if (definition.type === 'array' && isPlainObject(definition.items) && typeof definition.items.type === 'string') {
      assertArrayLengthDefinitions({ '[]': definition.items }, fieldPath)
    }
  }
}

/**
 * @file Shared schema-definition predicates used by runtime and transport code.
 */

export function isNumericDefinition (definition) {
  return definition?.type === 'number' ||
    definition?.type === 'integer' ||
    definition?.type === 'epochMilliseconds' ||
    definition?.type === 'epochSeconds'
}

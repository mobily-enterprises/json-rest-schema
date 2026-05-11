import { isPlainObject } from '../utils/object-helpers.js'

function isSchemaLike (value) {
  return value !== null &&
    typeof value === 'object' &&
    isPlainObject(value.structure) &&
    isPlainObject(value.operations) &&
    typeof value.validateWith === 'function' &&
    typeof value.toJsonSchema === 'function' &&
    typeof value.cleanup === 'function'
}

export function resolveArrayItemsConfig (fieldPath, definition) {
  if (!Object.hasOwn(definition, 'items')) return null

  const { items } = definition

  if (isSchemaLike(items)) {
    return { kind: 'schema', schema: items }
  }

  if (!isPlainObject(items) || typeof items.type !== 'string') {
    throw new Error(`Array field "${fieldPath}" must define items as either a Schema instance or a field definition object.`)
  }

  return { kind: 'definition', definition: items }
}

export function resolveObjectValuesConfig (fieldPath, definition) {
  if (!Object.hasOwn(definition, 'values')) return null

  const { values } = definition

  if (isSchemaLike(values)) {
    return { kind: 'schema', schema: values }
  }

  if (!isPlainObject(values) || typeof values.type !== 'string') {
    throw new Error(`Object field "${fieldPath}" must define values as either a Schema instance or a field definition object.`)
  }

  return { kind: 'definition', definition: values }
}

export function resolveObjectFieldMode (fieldPath, definition) {
  const hasNestedSchema = Object.hasOwn(definition, 'schema')
  const hasValues = Object.hasOwn(definition, 'values')
  const hasAdditionalProperties = Object.hasOwn(definition, 'additionalProperties')

  if (hasNestedSchema && hasValues) {
    throw new Error(`Object field "${fieldPath}" cannot define both schema and values.`)
  }

  if (hasAdditionalProperties && definition.additionalProperties !== true) {
    throw new Error(`Object field "${fieldPath}" only supports additionalProperties: true.`)
  }

  if (hasValues && definition.additionalProperties === true) {
    throw new Error(`Object field "${fieldPath}" cannot define both values and additionalProperties: true.`)
  }

  if (hasNestedSchema) {
    if (!isSchemaLike(definition.schema)) {
      throw new Error(`Object field "${fieldPath}" must define schema as a Schema instance.`)
    }

    return {
      kind: 'nested',
      schema: definition.schema,
      allowAdditionalProperties: definition.additionalProperties === true
    }
  }

  if (hasValues) {
    return {
      kind: 'map',
      valuesConfig: resolveObjectValuesConfig(fieldPath, definition)
    }
  }

  if (definition.additionalProperties === true) {
    return { kind: 'opaque' }
  }

  return { kind: 'plain' }
}

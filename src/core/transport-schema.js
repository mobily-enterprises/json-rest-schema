const JSON_SCHEMA_DRAFT_07 = 'http://json-schema.org/draft-07/schema#'
const JSON_REST_EXTENSION_KEY = 'x-json-rest-schema'
const NON_NULL_JSON_TYPES = ['object', 'array', 'string', 'number', 'boolean']

const BOOLEAN_TRUE_VALUES = ['true', '1', 'yes', 'y', 'on']
const BOOLEAN_FALSE_VALUES = ['false', '0', 'no', 'n', 'off']

function isPlainObject (value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isSchemaInstance (value) {
  return value !== null &&
    typeof value === 'object' &&
    isPlainObject(value.structure) &&
    isPlainObject(value.operations) &&
    typeof value.validateWith === 'function' &&
    typeof value.toJsonSchema === 'function' &&
    typeof value.cleanup === 'function'
}

function extensionMetadataFragment (section, values) {
  return {
    [JSON_REST_EXTENSION_KEY]: {
      [section]: values
    }
  }
}

const BUILTIN_TYPE_EXPORTERS = {
  none: () => ({ type: NON_NULL_JSON_TYPES }),
  blob: () => ({ type: NON_NULL_JSON_TYPES }),
  serialize: () => ({ type: NON_NULL_JSON_TYPES }),
  object: () => ({ type: 'object' }),
  array: () => ({ type: 'array' }),
  file: () => ({ type: 'string' }),
  string: () => ({ type: 'string' }),
  number: () => ({ type: ['number', 'string'] }),
  integer: () => ({ type: ['integer', 'string'] }),
  timestamp: () => ({ type: ['number', 'string'] }),
  dateTime: () => ({ type: 'string' }),
  date: () => ({ type: 'string' }),
  time: () => ({ type: 'string' }),
  boolean: ({ definition }) => {
    if (definition.strictBoolean === true) {
      return { type: 'boolean' }
    }

    const trueValues = new Set([...BOOLEAN_TRUE_VALUES, String(definition.stringTrueWhen || 'true').trim().toLowerCase()])
    const falseValues = new Set([...BOOLEAN_FALSE_VALUES, String(definition.stringFalseWhen || 'false').trim().toLowerCase()])

    return {
      anyOf: [
        { type: 'boolean' },
        { type: 'number', enum: [0, 1] },
        { type: 'string', enum: [...falseValues, ...trueValues] }
      ]
    }
  },
  id: () => ({
    type: ['integer', 'string'],
    minimum: 1,
    pattern: '^[1-9][0-9]*$'
  })
}

const BUILTIN_VALIDATOR_EXPORTERS = {
  minLength: ({ definition, parameterValue }) => definition.type === 'string' ? { minLength: parameterValue } : null,
  maxLength: ({ definition, parameterValue }) => definition.type === 'string' ? { maxLength: parameterValue } : null,
  min: ({ definition, parameterValue }) => (definition.type === 'number' || definition.type === 'integer') ? { minimum: parameterValue } : null,
  max: ({ definition, parameterValue }) => (definition.type === 'number' || definition.type === 'integer') ? { maximum: parameterValue } : null,
  pattern: ({ definition, parameterValue }) => definition.type === 'string'
    ? { pattern: parameterValue instanceof RegExp ? parameterValue.source : parameterValue }
    : null,
  enum: ({ parameterValue }) => ({ enum: parameterValue }),
  notEmpty: ({ parameterValue, definition }) => {
    if (!parameterValue) return null
    if (definition.type === 'array') return null
    return { minLength: 1 }
  },
  uppercase: ({ parameterValue }) => parameterValue ? extensionMetadataFragment('transforms', { uppercase: true }) : null,
  lowercase: ({ parameterValue }) => parameterValue ? extensionMetadataFragment('transforms', { lowercase: true }) : null,
  length: ({ parameterValue }) => extensionMetadataFragment('transforms', { length: parameterValue }),
  unsigned: ({ parameterValue }) => parameterValue ? extensionMetadataFragment('metadata', { unsigned: true }) : null,
  precision: ({ parameterValue }) => extensionMetadataFragment('metadata', { precision: parameterValue }),
  scale: ({ parameterValue }) => extensionMetadataFragment('metadata', { scale: parameterValue }),
  temporalPrecision: ({ parameterValue }) => extensionMetadataFragment('metadata', { temporalPrecision: parameterValue }),
  strictBoolean: () => null,
  required: () => null,
  nullable: () => null,
  nullOnEmpty: () => null,
  defaultTo: () => null
}

function mergePlainObjects (target, source) {
  for (const key of Object.keys(source)) {
    const sourceValue = source[key]
    const targetValue = target[key]

    if (
      sourceValue &&
      targetValue &&
      typeof sourceValue === 'object' &&
      typeof targetValue === 'object' &&
      !Array.isArray(sourceValue) &&
      !Array.isArray(targetValue)
    ) {
      mergePlainObjects(targetValue, sourceValue)
      continue
    }

    target[key] = sourceValue
  }
}

function mergeSchemaFragment (target, fragment) {
  if (!fragment || typeof fragment !== 'object' || Array.isArray(fragment)) {
    throw new Error('JSON Schema export hooks must return an object or null.')
  }

  for (const key of Object.keys(fragment)) {
    if (
      key === JSON_REST_EXTENSION_KEY &&
      target[key] &&
      typeof target[key] === 'object' &&
      typeof fragment[key] === 'object' &&
      !Array.isArray(target[key]) &&
      !Array.isArray(fragment[key])
    ) {
      mergePlainObjects(target[key], fragment[key])
      continue
    }

    target[key] = fragment[key]
  }
}

function buildAnyOfSchema (baseSchema, alternatives) {
  const baseAlternatives = (
    Array.isArray(baseSchema.anyOf) &&
    Object.keys(baseSchema).length === 1
  )
    ? baseSchema.anyOf
    : [baseSchema]

  const finalAlternatives = [...baseAlternatives, ...alternatives]
  if (finalAlternatives.length === 1) {
    return baseSchema
  }

  return { anyOf: finalAlternatives }
}

function getTypeExporter (schema, definition) {
  const handler = schema.types[definition.type]
  if (!handler) {
    throw new Error(`No casting function for type: ${definition.type}`)
  }

  if (typeof handler.toJsonSchema === 'function') {
    return handler.toJsonSchema
  }

  const exporter = BUILTIN_TYPE_EXPORTERS[definition.type]
  if (!exporter) {
    throw new Error(`Type '${definition.type}' cannot be exported to JSON Schema without a toJsonSchema hook.`)
  }

  return exporter
}

function getValidatorExporter (schema, parameterName, fieldName) {
  const handler = schema.validators[parameterName]
  if (!handler) return null

  if (typeof handler.toJsonSchema === 'function') {
    return handler.toJsonSchema
  }

  const exporter = BUILTIN_VALIDATOR_EXPORTERS[parameterName]
  if (exporter) {
    return exporter
  }

  throw new Error(`Validator '${parameterName}' on field '${fieldName}' cannot be exported to JSON Schema without a toJsonSchema hook.`)
}

function normalizeMode (mode) {
  if (mode === undefined) return 'create'
  if (['create', 'replace', 'patch'].includes(mode)) return mode
  throw new Error(`Unsupported JSON Schema export mode '${mode}'. Expected 'create', 'replace', or 'patch'.`)
}

function resolveOperationName (schema, options = {}) {
  if (options.mode !== undefined && options.operation !== undefined) {
    const normalizedMode = normalizeMode(options.mode)
    if (normalizedMode !== options.operation) {
      throw new Error(`Conflicting JSON Schema export options: mode '${normalizedMode}' does not match operation '${options.operation}'.`)
    }
  }

  if (options.operation !== undefined) {
    if (!schema.operations[options.operation]) {
      throw new Error(`Unknown JSON Schema export operation '${options.operation}'.`)
    }
    return options.operation
  }

  return normalizeMode(options.mode)
}

function resolveExportOperation (schema, options = {}) {
  if (options.operationName !== undefined && options.operationDescriptor !== undefined) {
    return {
      operationName: options.operationName,
      operation: options.operationDescriptor
    }
  }

  const operationName = resolveOperationName(schema, options)
  return {
    operationName,
    operation: schema.operations[operationName]
  }
}

function resolveObjectFieldMode (fieldName, definition) {
  const hasNestedSchema = Object.hasOwn(definition, 'schema')
  const hasAdditionalProperties = Object.hasOwn(definition, 'additionalProperties')

  if (hasNestedSchema && definition.additionalProperties === true) {
    throw new Error(`Object field "${fieldName}" cannot define both schema and additionalProperties: true.`)
  }

  if (hasAdditionalProperties && definition.additionalProperties !== true) {
    throw new Error(`Object field "${fieldName}" only supports additionalProperties: true.`)
  }

  if (hasNestedSchema) {
    if (!isSchemaInstance(definition.schema)) {
      throw new Error(`Object field "${fieldName}" must define schema as a Schema instance.`)
    }

    return { kind: 'nested', schema: definition.schema }
  }

  if (definition.additionalProperties === true) {
    return { kind: 'opaque' }
  }

  return { kind: 'plain' }
}

function resolveArrayItemsConfig (fieldName, definition) {
  if (!Object.hasOwn(definition, 'items')) return null

  const { items } = definition

  if (isSchemaInstance(items)) {
    return { kind: 'schema', schema: items }
  }

  if (!isPlainObject(items) || typeof items.type !== 'string') {
    throw new Error(`Array field "${fieldName}" must define items as either a Schema instance or a field definition object.`)
  }

  return { kind: 'definition', definition: items }
}

function buildSchemaObjectFragment (schema, options, operationName, operation, additionalProperties = false) {
  const properties = {}
  const required = []

  for (const [fieldName, definition] of Object.entries(schema.structure)) {
    properties[fieldName] = buildFieldSchema(schema, fieldName, definition, options, operationName, operation)
    if (operation.enforceRequired && definition.required === true) {
      required.push(fieldName)
    }
  }

  const objectSchema = {
    type: 'object',
    properties,
    additionalProperties
  }

  if (required.length > 0) {
    objectSchema.required = required
  }

  return objectSchema
}

function buildArrayItemsSchema (schema, fieldName, definition, options, operationName, operation) {
  const itemsConfig = resolveArrayItemsConfig(fieldName, definition)
  if (!itemsConfig) return null

  if (itemsConfig.kind === 'schema') {
    return {
      ...buildSchemaObjectFragment(
        itemsConfig.schema,
        options,
        'replace',
        itemsConfig.schema.operations.replace
      ),
      [JSON_REST_EXTENSION_KEY]: { castType: 'object' }
    }
  }

  const itemOperationName = (
    definition.items.type === 'object' && Object.hasOwn(definition.items, 'schema')
  )
    ? 'replace'
    : operationName

  const itemOperation = itemOperationName === 'replace'
    ? schema.operations.replace
    : operation

  return buildFieldSchema(schema, `${fieldName}[]`, definition.items, options, itemOperationName, itemOperation)
}

function buildBaseFieldSchema (schema, fieldName, definition, options, operationName, operation) {
  if (definition.type === 'object') {
    const objectMode = resolveObjectFieldMode(fieldName, definition)

    if (objectMode.kind === 'nested') {
      return buildSchemaObjectFragment(objectMode.schema, options, operationName, operation)
    }

    if (objectMode.kind === 'opaque') {
      return {
        type: 'object',
        additionalProperties: true
      }
    }
  }

  const baseSchema = getTypeExporter(schema, definition)({
    schema,
    fieldName,
    definition,
    operation: operationName,
    mode: operationName,
    options
  })

  if (!baseSchema || typeof baseSchema !== 'object' || Array.isArray(baseSchema)) {
    throw new Error(`Type '${definition.type}' on field '${fieldName}' returned an invalid JSON Schema fragment.`)
  }

  if (definition.type === 'array') {
    const itemsSchema = buildArrayItemsSchema(schema, fieldName, definition, options, operationName, operation)
    if (itemsSchema) {
      return {
        ...baseSchema,
        items: itemsSchema
      }
    }
  }

  return baseSchema
}

function buildFieldSchema (schema, fieldName, definition, options, operationName, operation) {
  const exportContext = {
    schema,
    fieldName,
    definition,
    operation: operationName,
    mode: operationName,
    options
  }

  const workingSchema = {
    ...buildBaseFieldSchema(schema, fieldName, definition, options, operationName, operation)
  }
  const extensionMetadata = { castType: definition.type }

  for (const parameterName of Object.keys(definition)) {
    if (parameterName === 'type') continue
    if (!(parameterName in schema.validators)) continue

    const exporter = getValidatorExporter(schema, parameterName, fieldName)
    if (!exporter) continue

    const fragment = exporter({
      ...exportContext,
      parameterName,
      parameterValue: definition[parameterName],
      fieldSchema: { ...workingSchema }
    })

    if (!fragment) continue
    mergeSchemaFragment(workingSchema, fragment)
  }

  if (workingSchema[JSON_REST_EXTENSION_KEY]) {
    mergePlainObjects(extensionMetadata, workingSchema[JSON_REST_EXTENSION_KEY])
    delete workingSchema[JSON_REST_EXTENSION_KEY]
  }

  const alternatives = []

  if (definition.nullable === true) {
    alternatives.push({ type: 'null' })
  }

  if (definition.nullOnEmpty === true) {
    alternatives.push({ const: '' })
  }

  const finalSchema = buildAnyOfSchema(workingSchema, alternatives)

  if (definition.defaultTo !== undefined && operation.applyDefaults) {
    if (typeof definition.defaultTo !== 'function') {
      finalSchema.default = definition.defaultTo
    } else {
      extensionMetadata.defaults = { providedByFunction: true }
    }
  }

  finalSchema[JSON_REST_EXTENSION_KEY] = extensionMetadata
  return finalSchema
}

export function buildJsonSchema (schema, options = {}) {
  const { operationName, operation } = resolveExportOperation(schema, options)
  const additionalProperties = options.additionalProperties === undefined ? false : options.additionalProperties

  return {
    $schema: JSON_SCHEMA_DRAFT_07,
    ...buildSchemaObjectFragment(schema, options, operationName, operation, additionalProperties)
  }
}

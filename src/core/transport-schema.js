import {
  resolveArrayItemsConfig,
  resolveObjectFieldMode,
  resolveObjectValuesConfig
} from './nested-contract.js'

const JSON_SCHEMA_DRAFT_07 = 'http://json-schema.org/draft-07/schema#'
const JSON_REST_EXTENSION_KEY = 'x-json-rest-schema'
const NON_NULL_JSON_TYPES = ['object', 'array', 'string', 'number', 'boolean']
const EXPORT_CONTEXT_KEY = Symbol('json-rest-schema.exportContext')

const BOOLEAN_TRUE_VALUES = ['true', '1', 'yes', 'y', 'on']
const BOOLEAN_FALSE_VALUES = ['false', '0', 'no', 'n', 'off']

function isPlainObject (value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
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

function createExportOptions (options = {}) {
  const exportOptions = { ...options }
  Object.defineProperty(exportOptions, EXPORT_CONTEXT_KEY, {
    value: {
      definitions: {},
      nodes: [],
      nextDefinitionId: 1,
      rootNode: null
    },
    enumerable: false
  })
  return exportOptions
}

function getExportContext (options = {}) {
  if (options[EXPORT_CONTEXT_KEY]) {
    return options[EXPORT_CONTEXT_KEY]
  }

  return {
    definitions: {},
    nodes: [],
    nextDefinitionId: 1,
    rootNode: null
  }
}

function sanitizeDefinitionNamePart (value) {
  const sanitized = String(value)
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

  return sanitized || 'operation'
}

function isReferenceOnlySchema (schema) {
  return isPlainObject(schema) &&
    Object.keys(schema).length === 1 &&
    typeof schema.$ref === 'string'
}

function wrapReferenceSchema (schema) {
  if (!isReferenceOnlySchema(schema)) {
    return schema
  }

  return {
    allOf: [schema]
  }
}

function findExportNode (exportContext, schema, operationName, operation, additionalProperties) {
  return exportContext.nodes.find((node) => (
    node.schema === schema &&
    node.operationName === operationName &&
    node.operation === operation &&
    node.additionalProperties === additionalProperties
  )) || null
}

function createDefinitionName (exportContext, operationName) {
  const suffix = sanitizeDefinitionNamePart(operationName)
  const definitionName = `SchemaNode_${exportContext.nextDefinitionId}_${suffix}`
  exportContext.nextDefinitionId += 1
  return definitionName
}

function getOrCreateExportNode (schema, options, operationName, operation, additionalProperties, { root = false } = {}) {
  const exportContext = getExportContext(options)
  const existingNode = findExportNode(exportContext, schema, operationName, operation, additionalProperties)

  if (existingNode) {
    if (root) {
      existingNode.pointer = '#'
      exportContext.rootNode = existingNode
    }
    return existingNode
  }

  const node = {
    schema,
    operationName,
    operation,
    additionalProperties,
    status: 'new',
    definitionName: root ? null : createDefinitionName(exportContext, operationName),
    pointer: root ? '#' : null
  }

  if (!root) {
    node.pointer = `#/definitions/${node.definitionName}`
  } else {
    exportContext.rootNode = node
  }

  exportContext.nodes.push(node)
  return node
}

function buildExportNodeSchema (node, options) {
  if (node.status === 'built') {
    return {
      $ref: node.pointer
    }
  }

  if (node.status === 'building') {
    return {
      $ref: node.pointer
    }
  }

  const exportContext = getExportContext(options)
  node.status = 'building'
  if (node.pointer !== '#') {
    exportContext.definitions[node.definitionName] = {}
  }

  const objectSchema = buildSchemaObjectFragment(
    node.schema,
    options,
    node.operationName,
    node.operation,
    node.additionalProperties
  )

  node.status = 'built'

  if (node.pointer === '#') {
    return objectSchema
  }

  exportContext.definitions[node.definitionName] = objectSchema

  return {
    $ref: node.pointer
  }
}

function buildSchemaReference (schema, options, operationName, operation, additionalProperties = false) {
  const exportContext = getExportContext(options)
  const node = getOrCreateExportNode(schema, options, operationName, operation, additionalProperties)

  if (exportContext.rootNode === node) {
    return { $ref: '#' }
  }

  return buildExportNodeSchema(node, options)
}

function createFieldSchemaState (schema, { referenceBacked = false } = {}) {
  return {
    schema,
    referenceBacked
  }
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
      ...wrapReferenceSchema(buildSchemaReference(
        itemsConfig.schema,
        options,
        'replace',
        itemsConfig.schema.operations.replace,
        false
      )),
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

function buildObjectValuesSchema (schema, fieldName, definition, options, operationName, operation) {
  const valuesConfig = resolveObjectValuesConfig(fieldName, definition)
  if (!valuesConfig) return null

  if (valuesConfig.kind === 'schema') {
    return {
      ...wrapReferenceSchema(buildSchemaReference(
        valuesConfig.schema,
        options,
        'replace',
        valuesConfig.schema.operations.replace,
        false
      )),
      [JSON_REST_EXTENSION_KEY]: { castType: 'object' }
    }
  }

  const valueOperationName = (
    valuesConfig.definition.type === 'object' && Object.hasOwn(valuesConfig.definition, 'schema')
  )
    ? 'replace'
    : operationName

  const valueOperation = valueOperationName === 'replace'
    ? schema.operations.replace
    : operation

  return buildFieldSchema(schema, `${fieldName}.*`, valuesConfig.definition, options, valueOperationName, valueOperation)
}

function buildBaseFieldSchema (schema, fieldName, definition, options, operationName, operation) {
  if (definition.type === 'object') {
    const objectMode = resolveObjectFieldMode(fieldName, definition)

    if (objectMode.kind === 'nested') {
      return createFieldSchemaState(
        buildSchemaReference(
          objectMode.schema,
          options,
          operationName,
          operation,
          objectMode.allowAdditionalProperties === true
        ),
        { referenceBacked: true }
      )
    }

    if (objectMode.kind === 'opaque') {
      return createFieldSchemaState({
        type: 'object',
        additionalProperties: true
      })
    }

    if (objectMode.kind === 'map') {
      return createFieldSchemaState({
        type: 'object',
        additionalProperties: buildObjectValuesSchema(schema, fieldName, definition, options, operationName, operation)
      })
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
      return createFieldSchemaState({
        ...baseSchema,
        items: itemsSchema
      }, { referenceBacked: isReferenceOnlySchema(baseSchema) })
    }
  }

  return createFieldSchemaState(baseSchema, {
    referenceBacked: isReferenceOnlySchema(baseSchema)
  })
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

  const baseFieldSchemaState = buildBaseFieldSchema(schema, fieldName, definition, options, operationName, operation)
  const workingSchema = baseFieldSchemaState.referenceBacked
    ? wrapReferenceSchema(baseFieldSchemaState.schema)
    : { ...baseFieldSchemaState.schema }
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

  const finalSchema = wrapReferenceSchema(buildAnyOfSchema(workingSchema, alternatives))

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
  const exportOptions = createExportOptions(options)
  const { operationName, operation } = resolveExportOperation(schema, exportOptions)
  const additionalProperties = exportOptions.additionalProperties === undefined ? false : exportOptions.additionalProperties
  const exportContext = getExportContext(exportOptions)
  const rootNode = getOrCreateExportNode(
    schema,
    exportOptions,
    operationName,
    operation,
    additionalProperties,
    { root: true }
  )

  const transportSchema = {
    $schema: JSON_SCHEMA_DRAFT_07,
    ...buildExportNodeSchema(rootNode, exportOptions)
  }

  if (Object.keys(exportContext.definitions).length > 0) {
    transportSchema.definitions = exportContext.definitions
  }

  return transportSchema
}

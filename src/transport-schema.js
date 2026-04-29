const JSON_SCHEMA_DRAFT_07 = 'http://json-schema.org/draft-07/schema#'
const JSON_REST_EXTENSION_KEY = 'x-json-rest-schema'
const NON_NULL_JSON_TYPES = ['object', 'array', 'string', 'number', 'boolean']

const BOOLEAN_TRUE_VALUES = ['true', '1', 'yes', 'y', 'on']
const BOOLEAN_FALSE_VALUES = ['false', '0', 'no', 'n', 'off']

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

function buildFieldSchema (schema, fieldName, definition, options) {
  const mode = normalizeMode(options.mode)
  const exportContext = {
    schema,
    fieldName,
    definition,
    mode,
    options
  }

  const baseSchema = getTypeExporter(schema, definition)(exportContext)
  if (!baseSchema || typeof baseSchema !== 'object' || Array.isArray(baseSchema)) {
    throw new Error(`Type '${definition.type}' on field '${fieldName}' returned an invalid JSON Schema fragment.`)
  }

  const workingSchema = { ...baseSchema }
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

  if (definition.defaultTo !== undefined && mode !== 'patch') {
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
  const mode = normalizeMode(options.mode)
  const additionalProperties = options.additionalProperties === undefined ? false : options.additionalProperties

  const properties = {}
  const required = []

  for (const [fieldName, definition] of Object.entries(schema.structure)) {
    properties[fieldName] = buildFieldSchema(schema, fieldName, definition, { ...options, mode })
    if (mode !== 'patch' && definition.required === true) {
      required.push(fieldName)
    }
  }

  const jsonSchema = {
    $schema: JSON_SCHEMA_DRAFT_07,
    type: 'object',
    properties,
    additionalProperties
  }

  if (required.length > 0) {
    jsonSchema.required = required
  }

  return jsonSchema
}

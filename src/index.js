/**
 * @file Main entry point for the schema library.
 * Assembles and exports the `createSchema` factory function and related utilities.
 */

import { Schema } from './core/Schema.js'
import CorePlugin from './core/CorePlugin.js'
import { flattenErrors, getError, hasError, nestErrors } from './utils/error-helpers.js'
import { setOwnProperty } from './utils/path-helpers.js'

const factoryTypesBySource = new WeakMap()
const factoryValidatorsBySource = new WeakMap()
const registryMetadataSymbol = Symbol.for('json-rest-schema.registry-metadata')

function registerTypeHandler (types, name, handler) {
  if (typeof handler !== 'function') {
    throw new Error(`Type handler for '${name}' must be a function.`)
  }
  setOwnProperty(types, name, handler)
}

function registerValidatorHandler (validators, name, handler) {
  if (typeof handler !== 'function') {
    throw new Error(`Validator handler for '${name}' must be a function.`)
  }
  setOwnProperty(validators, name, handler)
}

function createHandlerRegistry (source = {}) {
  const registry = Object.create(null)

  for (const [name, handler] of Object.entries(source)) {
    setOwnProperty(registry, name, handler)
  }

  return registry
}

function installPlugin (plugin, api) {
  if (typeof plugin.install !== 'function') {
    throw new Error('Plugin must have an install method.')
  }
  plugin.install(api)
}

function attachRegistryMetadata (target, types, validators) {
  factoryTypesBySource.set(target, types)
  factoryValidatorsBySource.set(target, validators)

  Object.defineProperty(target, registryMetadataSymbol, {
    value: Object.freeze({
      getTypes: () => types,
      getValidators: () => validators
    }),
    enumerable: false,
    configurable: false,
    writable: false
  })
}

function extractRegistryMetadata (source) {
  if (!source || (typeof source !== 'object' && typeof source !== 'function')) {
    return null
  }

  const types = factoryTypesBySource.get(source)
  const validators = factoryValidatorsBySource.get(source)
  if (types && validators) {
    return { types, validators }
  }

  const symbolMetadata = source[registryMetadataSymbol]
  if (
    symbolMetadata &&
    typeof symbolMetadata.getTypes === 'function' &&
    typeof symbolMetadata.getValidators === 'function'
  ) {
    return {
      types: symbolMetadata.getTypes(),
      validators: symbolMetadata.getValidators()
    }
  }

  if (
    typeof source === 'object' &&
    source.types &&
    typeof source.types === 'object' &&
    source.validators &&
    typeof source.validators === 'object' &&
    typeof source.create === 'function' &&
    typeof source.replace === 'function' &&
    typeof source.patch === 'function' &&
    typeof source.toJsonSchema === 'function'
  ) {
    return {
      types: source.types,
      validators: source.validators
    }
  }

  return null
}

function normalizeFactorySources (sources) {
  if (sources.length === 1 && Array.isArray(sources[0])) {
    return sources[0]
  }

  return sources
}

function areEquivalentHandlers (left, right) {
  return left === right
}

function mergeRegistryHandlers (target, source, kind) {
  for (const [name, handler] of Object.entries(source)) {
    if (Object.hasOwn(target, name) && !areEquivalentHandlers(target[name], handler)) {
      throw new Error(`Cannot merge schema factories with conflicting ${kind} "${name}".`)
    }
    setOwnProperty(target, name, handler)
  }
}

function resolveMergedRegistries (fallbackTypes, fallbackValidators, sources) {
  const normalizedSources = normalizeFactorySources(sources).filter(Boolean)
  if (normalizedSources.length < 1) {
    return {
      types: createHandlerRegistry(fallbackTypes),
      validators: createHandlerRegistry(fallbackValidators)
    }
  }

  const mergedTypes = Object.create(null)
  const mergedValidators = Object.create(null)
  for (const source of normalizedSources) {
    const metadata = extractRegistryMetadata(source)
    if (!metadata) {
      throw new Error('Factory sources must be schema instances or schema factories created by json-rest-schema.')
    }

    mergeRegistryHandlers(mergedTypes, metadata.types, 'type')
    mergeRegistryHandlers(mergedValidators, metadata.validators, 'validator')
  }

  return {
    types: mergedTypes,
    validators: mergedValidators
  }
}

function createSchemaFactory ({
  types = {},
  validators = {},
  installCore = true
} = {}) {
  const factoryTypes = createHandlerRegistry(types)
  const factoryValidators = createHandlerRegistry(validators)

  const factory = (structure, options = {}) => {
    const schema = new Schema(
      structure,
      factoryTypes,
      factoryValidators,
      options.operations
    )
    attachRegistryMetadata(schema, factoryTypes, factoryValidators)
    return schema
  }

  attachRegistryMetadata(factory, factoryTypes, factoryValidators)

  factory.addType = (name, handler) => {
    registerTypeHandler(factoryTypes, name, handler)
  }

  factory.addValidator = (name, handler) => {
    registerValidatorHandler(factoryValidators, name, handler)
  }

  factory.use = (plugin) => {
    installPlugin(plugin, {
      addType: factory.addType,
      addValidator: factory.addValidator
    })
  }

  factory.createFactory = (...sources) => {
    const mergedRegistries = resolveMergedRegistries(factoryTypes, factoryValidators, sources)
    return createSchemaFactory({
      types: mergedRegistries.types,
      validators: mergedRegistries.validators,
      installCore: false
    })
  }

  if (installCore) {
    factory.use(CorePlugin)
  }

  return factory
}

const createSchema = createSchemaFactory({ installCore: true })

function addType (name, handler) {
  createSchema.addType(name, handler)
}

function addValidator (name, handler) {
  createSchema.addValidator(name, handler)
}

function use (plugin) {
  createSchema.use(plugin)
}

export { createSchema, createSchemaFactory, addType, addValidator, use, getError, hasError, nestErrors, flattenErrors }

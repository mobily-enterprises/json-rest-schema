/**
 * @file Main entry point for the schema library.
 * Assembles and exports the `createSchema` factory function and related utilities.
 */

import { Schema } from './Schema.js';
import CorePlugin from './CorePlugin.js';

/**
 * @type {Object.<string, Function>}
 * Stores all registered type handlers. This is now a directly managed object.
 */
const globalTypes = {};

/**
 * @type {Object.<string, Function>}
 * Stores all registered validator handlers. This is now a directly managed object.
 */
const globalValidators = {};

/**
 * Registers a new type handler.
 * @param {string} name - The name of the type (e.g., 'string', 'email').
 * @param {Function} handler - The function to handle the type casting.
 */
export function addType(name, handler) {
  if (typeof handler !== 'function') {
    throw new Error(`Type handler for '${name}' must be a function.`);
  }
  globalTypes[name] = handler;
}

/**
 * Registers a new validator handler.
 * @param {string} name - The name of the validator (e.g., 'min', 'required').
 * @param {Function} handler - The function to handle the validation logic.
 */
export function addValidator(name, handler) {
  if (typeof handler !== 'function') {
    throw new Error(`Validator handler for '${name}' must be a function.`);
  }
  globalValidators[name] = handler;
}

/**
 * Installs a plugin by calling its `install` method.
 * @param {{install: Function}} plugin - A plugin object with an `install` method.
 * @returns {void}
 */
export function use(plugin) {
  if (typeof plugin.install !== 'function') {
    throw new Error('Plugin must have an install method.');
  }
  // Pass the addType and addValidator functions directly to the plugin
  plugin.install({ addType, addValidator });
}

/**
 * The main factory function for creating new schema instances.
 * Each created schema will use the currently registered global types and validators.
 * @param {object} structure - The schema definition object.
 * @returns {import('./Schema').Schema} A new schema instance.
 */
const createSchema = (structure) => new Schema(structure, globalTypes, globalValidators);

// Attach the registration methods directly to the factory function for convenience.
// This maintains the existing public API from the original code.
createSchema.addType = addType;
createSchema.addValidator = addValidator;
createSchema.use = use;

// Automatically install the core plugin to provide out-of-the-box functionality.
createSchema.use(CorePlugin);

// Export all functions as named exports
export { createSchema };
// export { createKnexTable, generateKnexMigration } from './createKnexTable.js';

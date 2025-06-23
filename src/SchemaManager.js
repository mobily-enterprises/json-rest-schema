/**
 * @file Defines the SchemaManager class, which handles plugins and registries.
 */
import { Schema } from './Schema.js';

/**
 * Manages the registration of type and validator handlers and installs plugins.
 * This class provides the `.use()`, `.addType()`, and `.addValidator()` methods.
 */
export class SchemaManager {
  constructor() {
    /** @type {Object.<string, Function>} */
    this.types = {};
    /** @type {Object.<string, Function>} */
    this.validators = {};
  }

  /**
   * Registers a new type handler.
   * @param {string} name - The name of the type (e.g., 'string', 'email').
   * @param {Function} handler - The function to handle the type casting.
   */
  addType(name, handler) {
    if (typeof handler !== 'function') {
      throw new Error(`Type handler for '${name}' must be a function.`);
    }
    this.types[name] = handler;
  }

  /**
   * Registers a new validator handler.
   * @param {string} name - The name of the validator (e.g., 'min', 'required').
   * @param {Function} handler - The function to handle the validation logic.
   */
  addValidator(name, handler) {
    if (typeof handler !== 'function') {
      throw new Error(`Validator handler for '${name}' must be a function.`);
    }
    this.validators[name] = handler;
  }

  /**
   * Installs a plugin by calling its `install` method.
   * @param {{install: Function}} plugin - A plugin object with an `install` method.
   */
  use(plugin) {
    if (typeof plugin.install !== 'function') {
      throw new Error('Plugin must have an install method.');
    }
    plugin.install(this);
  }

  /**
   * Creates a new Schema instance with the currently registered types and validators.
   * @param {object} structure - The schema definition object.
   * @returns {import('./Schema').Schema} A new instance of Schema.
   */
  create(structure) {
    return new Schema(structure, {
      types: this.types,
      validators: this.validators,
    });
  }
}


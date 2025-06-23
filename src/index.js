/**
 * @file Main entry point for the schema library.
 * Assembles and exports the `createSchema` factory function.
 */

import { SchemaManager } from './SchemaManager.js';
import CorePlugin from './CorePlugin.js';

// Create a single, global manager instance.
const mainManager = new SchemaManager();

/**
 * The main factory function for creating new schema instances.
 * @param {object} structure - The schema definition object.
 * @returns {import('./Schema').Schema} A new schema instance.
 */
const createSchema = (structure) => mainManager.create(structure);

// Attach the plugin API methods directly to the factory function.
createSchema.use = mainManager.use.bind(mainManager);
createSchema.addType = mainManager.addType.bind(mainManager);
createSchema.addValidator = mainManager.addValidator.bind(mainManager);

// Automatically install the core plugin to provide out-of-the-box functionality.
createSchema.use(CorePlugin);

// Export the factory function as the main module export.
export default createSchema;

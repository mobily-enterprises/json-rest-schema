/**
 * Real tests for createKnexTable functionality using actual Knex
 */

import { test, describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'
import knex from 'knex'
import { createSchema, createKnexTable, generateKnexMigration } from './src/index.js'

// Create a test database instance (in-memory SQLite)
let db

describe('createKnexTable with real Knex', () => {
  beforeEach(async () => {
    // Create fresh in-memory database for each test
    db = knex({
      client: 'sqlite3',
      connection: ':memory:',
      useNullAsDefault: true
    })
  })

  afterEach(async () => {
    // Clean up
    await db.destroy()
  })

  it('should create a simple table with string fields', async () => {
    const schema = createSchema({
      name: { type: 'string', required: true, maxLength: 100 },
      email: { type: 'string', unique: true },
      bio: { type: 'string', nullable: true }
    })

    await createKnexTable(db, 'users', schema)

    // Check table exists
    const exists = await db.schema.hasTable('users')
    assert.strictEqual(exists, true)

    // Check columns exist
    const info = await db('users').columnInfo()
    assert.ok(info.id, 'Should have auto-increment id')
    assert.ok(info.name, 'Should have name column')
    assert.ok(info.email, 'Should have email column')
    assert.ok(info.bio, 'Should have bio column')

    // Test inserting data
    await db('users').insert({
      name: 'Test User',
      email: 'test@example.com',
      bio: null
    })

    const users = await db('users').select()
    assert.strictEqual(users.length, 1)
    assert.strictEqual(users[0].name, 'Test User')
  })

  it('should handle number types with precision', async () => {
    const schema = createSchema({
      price: { type: 'number', precision: 10, scale: 2 },
      quantity: { type: 'number', defaultTo: 0 },
      rating: { type: 'number', nullable: true }
    })

    await createKnexTable(db, 'products', schema)

    // Insert test data
    await db('products').insert({
      price: 99.99,
      // quantity uses default
      rating: 4.5
    })

    const products = await db('products').select()
    assert.strictEqual(products[0].price, 99.99)
    assert.strictEqual(products[0].quantity, 0) // Default value
    assert.strictEqual(products[0].rating, 4.5)
  })

  it('should handle boolean and date types', async () => {
    const schema = createSchema({
      isActive: { type: 'boolean', defaultTo: true },
      isVerified: { type: 'boolean', nullable: false },
      createdAt: { type: 'dateTime' },
      birthDate: { type: 'date', nullable: true }
    })

    await createKnexTable(db, 'accounts', schema)

    const now = new Date()
    await db('accounts').insert({
      isVerified: false,
      createdAt: now.toISOString(),
      birthDate: '1990-01-01'
    })

    const accounts = await db('accounts').select()
    assert.strictEqual(accounts[0].isActive, 1) // SQLite stores as 1/0
    assert.strictEqual(accounts[0].isVerified, 0)
    assert.ok(accounts[0].createdAt)
  })

  it('should handle JSON types for arrays and objects', async () => {
    const schema = createSchema({
      tags: { type: 'array', defaultTo: [] },
      metadata: { type: 'object', nullable: true },
      settings: { type: 'serialize' }
    })

    await createKnexTable(db, 'items', schema)

    const testData = {
      tags: JSON.stringify(['tag1', 'tag2']),
      metadata: JSON.stringify({ key: 'value' }),
      settings: JSON.stringify({ theme: 'dark' })
    }

    await db('items').insert(testData)

    const items = await db('items').select()
    assert.strictEqual(items[0].tags, testData.tags)
    assert.strictEqual(items[0].metadata, testData.metadata)
  })

  it('should add timestamps when option is true', async () => {
    const schema = createSchema({
      title: { type: 'string' }
    })

    await createKnexTable(db, 'posts', schema, 'id', { timestamps: true })

    const info = await db('posts').columnInfo()
    assert.ok(info.created_at, 'Should have created_at')
    assert.ok(info.updated_at, 'Should have updated_at')
  })

  it('should handle foreign key references', async () => {
    // Create users table first
    const userSchema = createSchema({
      username: { type: 'string', unique: true }
    })
    await createKnexTable(db, 'users', userSchema)

    // Create posts table with foreign key
    const postSchema = createSchema({
      title: { type: 'string', required: true },
      userId: {
        type: 'id',
        required: true,
        references: { table: 'users', onDelete: 'CASCADE' }
      }
    })

    await createKnexTable(db, 'posts', postSchema)

    // Insert test data
    await db('users').insert({ username: 'testuser' })
    const user = await db('users').where('username', 'testuser').first()
    await db('posts').insert({ title: 'Test Post', userId: user.id })

    // Verify relationship works
    const posts = await db('posts')
      .join('users', 'posts.userId', 'users.id')
      .select('posts.title', 'users.username')

    assert.strictEqual(posts.length, 1)
    assert.strictEqual(posts[0].title, 'Test Post')
    assert.strictEqual(posts[0].username, 'testuser')
  })

  it('should respect primary key in schema', async () => {
    const schema = createSchema({
      isbn: { type: 'string', primary: true, maxLength: 13 },
      title: { type: 'string', required: true }
    })

    await createKnexTable(db, 'books', schema, 'id', { autoIncrement: false })

    const info = await db('books').columnInfo()
    // Should not have auto-increment id
    assert.ok(!info.id, 'Should not have auto id column')
    assert.ok(info.isbn, 'Should have isbn as primary key')

    // Test inserting with custom primary key
    await db('books').insert({
      isbn: '9781234567890',
      title: 'Test Book'
    })

    const books = await db('books').select()
    assert.strictEqual(books[0].isbn, '9781234567890')
  })

  it('should handle unique constraints', async () => {
    const schema = createSchema({
      email: { type: 'string', unique: true },
      username: { type: 'string', unique: true }
    })

    await createKnexTable(db, 'accounts', schema)

    // Insert first record
    await db('accounts').insert({
      email: 'test@example.com',
      username: 'testuser'
    })

    // Try to insert duplicate - should fail
    await assert.rejects(async () => {
      await db('accounts').insert({
        email: 'test@example.com', // Duplicate
        username: 'otheruser'
      })
    })
  })
})

describe('generateKnexMigration with real execution', () => {
  beforeEach(async () => {
    db = knex({
      client: 'sqlite3',
      connection: ':memory:',
      useNullAsDefault: true
    })
  })

  afterEach(async () => {
    await db.destroy()
  })

  it('should generate executable migrations', async () => {
    const schema = createSchema({
      name: { type: 'string', required: true },
      age: { type: 'number', min: 0 },
      email: { type: 'string', unique: true }
    })

    const migration = generateKnexMigration('users', schema)

    // Parse and execute the migration using Function constructor
    const migrationModule = {}
    const migrationCode = migration
      .replace(/exports\.up/g, 'migrationModule.up')
      .replace(/exports\.down/g, 'migrationModule.down')

    // Use Function constructor instead of eval
    new Function('migrationModule', 'knex', migrationCode)(migrationModule, db.constructor)

    // Run up migration
    await migrationModule.up(db)

    // Verify table was created
    const exists = await db.schema.hasTable('users')
    assert.strictEqual(exists, true)

    // Insert test data
    await db('users').insert({
      name: 'Test User',
      age: 25,
      email: 'test@example.com'
    })

    // Run down migration
    await migrationModule.down(db)

    // Verify table was dropped
    const existsAfter = await db.schema.hasTable('users')
    assert.strictEqual(existsAfter, false)
  })

  it('should handle complex schemas in migrations', async () => {
    const schema = createSchema({
      id: { type: 'id', primary: true },
      title: { type: 'string', required: true, maxLength: 200 },
      price: { type: 'number', precision: 10, scale: 2 },
      inStock: { type: 'boolean', defaultTo: true },
      categoryId: {
        type: 'id',
        nullable: true,
        references: { table: 'categories', onDelete: 'SET NULL' }
      },
      tags: { type: 'array', defaultTo: [] }
    })

    const migration = generateKnexMigration('products', schema, { timestamps: true })

    // Should include all the features
    assert.ok(migration.includes('precision: 10, scale: 2') || migration.includes('decimal'))
    assert.ok(migration.includes('defaultTo(true)'))
    assert.ok(migration.includes('references'))
    assert.ok(migration.includes('onDelete'))
    assert.ok(migration.includes('timestamps'))
  })
})

// Run a validation + database integration test
describe('Integration: Validation + Database', () => {
  beforeEach(async () => {
    db = knex({
      client: 'sqlite3',
      connection: ':memory:',
      useNullAsDefault: true
    })
  })

  afterEach(async () => {
    await db.destroy()
  })

  it('should validate data and save to database using same schema', async () => {
    // Define schema once
    const userSchema = createSchema({
      email: { type: 'string', required: true, maxLength: 255 },
      age: { type: 'number', nullable: true, min: 18, max: 100 },
      isActive: { type: 'boolean', defaultTo: true },
      tags: { type: 'array', defaultTo: [] }
    })

    // Create table from schema
    await createKnexTable(db, 'users', userSchema)

    // Validate input data
    const userInput = {
      email: '  user@example.com  ', // Will be trimmed
      age: '25', // Will be cast to number
      // isActive will use default
      tags: 'admin,moderator' // Not an array, will be wrapped
    }

    const { validatedObject, errors } = await userSchema.validate(userInput)
    assert.strictEqual(Object.keys(errors).length, 0)

    // Validated data is clean and properly typed
    assert.strictEqual(validatedObject.email, 'user@example.com')
    assert.strictEqual(validatedObject.age, 25)
    assert.strictEqual(validatedObject.isActive, true)
    assert.deepStrictEqual(validatedObject.tags, ['admin,moderator']) // Wrapped in array

    // Save to database - need to JSON.stringify array
    const dataToSave = {
      ...validatedObject,
      tags: JSON.stringify(validatedObject.tags)
    }

    await db('users').insert(dataToSave)

    // Retrieve and verify
    const saved = await db('users').select().first()
    assert.strictEqual(saved.email, 'user@example.com')
    assert.strictEqual(saved.age, 25)
    assert.strictEqual(saved.isActive, 1) // SQLite boolean
    assert.strictEqual(saved.tags, '["admin,moderator"]')
  })
})

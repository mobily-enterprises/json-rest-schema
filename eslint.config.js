import neostandard from 'neostandard'

export default [
  ...neostandard({
    ignores: ['node_modules/**', 'example.js']
  }),
  {
    files: ['tests.js', 'test-knex-table-real.js'],
    rules: {
      'no-unused-vars': 'off',
      'no-new-func': 'off',
      'promise/param-names': 'off'
    }
  }
]

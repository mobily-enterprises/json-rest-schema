import neostandard from 'neostandard'

export default [
  ...neostandard({
    ignores: [
      'node_modules/**',
      'demos/**',
      'docs/.vitepress/dist/**',
      'docs/.vitepress/generated-readme-nav.mjs',
      'docs/generated/**',
      'playwright-report/**',
      'test-results/**',
      'example.js'
    ]
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

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import vuetify from 'vite-plugin-vuetify'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const repositoryName = process.env.GITHUB_REPOSITORY?.split('/')[1] ?? 'json-rest-schema'
const base = process.env.DEMO_PUBLISH === 'true'
  ? `/${repositoryName}/demos/vue-vuetify/`
  : '/'

export default defineConfig({
  base,
  plugins: [
    vue(),
    vuetify({ autoImport: true })
  ],
  resolve: {
    alias: [
      {
        find: 'json-rest-schema/vue',
        replacement: path.resolve(repoRoot, 'src/adapters/vue.js')
      },
      {
        find: 'json-rest-schema/vuetify',
        replacement: path.resolve(repoRoot, 'src/adapters/vuetify.js')
      },
      {
        find: 'json-rest-schema',
        replacement: path.resolve(repoRoot, 'src/index.js')
      }
    ]
  }
})

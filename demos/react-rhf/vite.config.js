import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const repositoryName = process.env.GITHUB_REPOSITORY?.split('/')[1] ?? 'json-rest-schema'
const base = process.env.DEMO_PUBLISH === 'true'
  ? `/${repositoryName}/demos/react-rhf/`
  : '/'

export default defineConfig({
  base,
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: 'json-rest-schema/react-hook-form',
        replacement: path.resolve(repoRoot, 'src/adapters/react-hook-form.js')
      },
      {
        find: 'json-rest-schema',
        replacement: path.resolve(repoRoot, 'src/index.js')
      }
    ]
  }
})

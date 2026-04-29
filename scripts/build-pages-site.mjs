import fs from 'node:fs/promises'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const rootDir = process.cwd()
const repositoryName = process.env.GITHUB_REPOSITORY ?? 'mobily-enterprises/json-rest-schema'
const docsDistDir = path.join(rootDir, 'docs', '.vitepress', 'dist')

function npmCommand () {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm'
}

function runNpm (args, extraEnv = {}) {
  execFileSync(npmCommand(), args, {
    cwd: rootDir,
    env: {
      ...process.env,
      ...extraEnv
    },
    stdio: 'inherit'
  })
}

async function copyDemoDist (demoName) {
  const sourceDir = path.join(rootDir, 'demos', demoName, 'dist')
  const targetDir = path.join(docsDistDir, 'demos', demoName)

  await fs.rm(targetDir, { recursive: true, force: true })
  await fs.mkdir(path.dirname(targetDir), { recursive: true })
  await fs.cp(sourceDir, targetDir, { recursive: true })
}

async function main () {
  const buildEnv = {
    GITHUB_ACTIONS: 'true',
    GITHUB_REPOSITORY: repositoryName,
    DEMO_PUBLISH: 'true'
  }

  runNpm(['run', 'docs:build:vitepress'], buildEnv)
  runNpm(['--prefix', 'demos/react-rhf', 'run', 'build'], buildEnv)
  runNpm(['--prefix', 'demos/vue-vuetify', 'run', 'build'], buildEnv)

  await copyDemoDist('react-rhf')
  await copyDemoDist('vue-vuetify')
}

await main()

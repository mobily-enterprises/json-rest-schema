import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './demos/tests',
  timeout: 30000,
  workers: 1,
  reporter: 'list',
  use: {
    headless: true,
    trace: 'retain-on-failure'
  },
  projects: [
    {
      name: 'react-rhf',
      testMatch: /react\.spec\.js/,
      use: {
        baseURL: 'http://127.0.0.1:4173'
      }
    },
    {
      name: 'vue-vuetify',
      testMatch: /vue\.spec\.js/,
      use: {
        baseURL: 'http://127.0.0.1:4174'
      }
    }
  ],
  webServer: [
    {
      command: 'npm --prefix demos/react-rhf run dev -- --host 127.0.0.1 --port 4173',
      url: 'http://127.0.0.1:4173',
      timeout: 120000,
      reuseExistingServer: !process.env.CI
    },
    {
      command: 'npm --prefix demos/vue-vuetify run dev -- --host 127.0.0.1 --port 4174',
      url: 'http://127.0.0.1:4174',
      timeout: 120000,
      reuseExistingServer: !process.env.CI
    }
  ]
})

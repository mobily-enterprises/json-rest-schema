import { readmeSidebar } from './generated-readme-nav.mjs'

const repositoryName = process.env.GITHUB_REPOSITORY?.split('/')[1] ?? 'json-rest-schema'
const docsBase = process.env.DOCS_BASE ?? (process.env.GITHUB_ACTIONS === 'true' ? `/${repositoryName}/` : '/')

/** @type {import('vitepress').UserConfig} */
export default {
  title: 'json-rest-schema',
  description: 'Synchronous REST contract schemas with normalization, operation-aware validation, and framework adapters.',
  base: docsBase,
  cleanUrls: true,
  ignoreDeadLinks: [
    /^\/demos\/react-rhf(?:\/index)?$/,
    /^\/demos\/vue-vuetify(?:\/index)?$/
  ],
  lastUpdated: true,
  themeConfig: {
    nav: [
      { text: 'Manual', link: '/' },
      { text: 'Demo Apps', link: '/demos' },
      { text: 'Contributor Notes', link: '/onboarding' },
      { text: 'GitHub', link: 'https://github.com/mobily-enterprises/json-rest-schema' }
    ],
    sidebar: [
      ...readmeSidebar,
      {
        text: 'Other Docs',
        items: [
          { text: 'Manual', link: '/' },
          { text: 'Demo Apps', link: '/demos' },
          { text: 'Contributor Notes', link: '/onboarding' }
        ]
      }
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/mobily-enterprises/json-rest-schema' }
    ],
    search: {
      provider: 'local'
    },
    footer: {
      message: 'GPL-3.0-only',
      copyright: 'Copyright © Tony Mobily and contributors'
    }
  }
}

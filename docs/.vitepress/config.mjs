const repositoryName = process.env.GITHUB_REPOSITORY?.split('/')[1] ?? 'jsonrestapi-schema'
const docsBase = process.env.DOCS_BASE ?? (process.env.GITHUB_ACTIONS === 'true' ? `/${repositoryName}/` : '/')

/** @type {import('vitepress').UserConfig} */
export default {
  title: 'json-rest-schema',
  description: 'Synchronous REST contract schemas with normalization, operation-aware validation, and framework adapters.',
  base: docsBase,
  cleanUrls: true,
  lastUpdated: true,
  themeConfig: {
    nav: [
      { text: 'README', link: '/' },
      { text: 'Demo Apps', link: '/demos' },
      { text: 'Contributor Notes', link: '/onboarding' },
      { text: 'GitHub', link: 'https://github.com/mobily-enterprises/jsonrestapi-schema' }
    ],
    sidebar: [
      {
        text: 'Documentation',
        items: [
          { text: 'README', link: '/' },
          { text: 'Demo Apps', link: '/demos' },
          { text: 'Contributor Notes', link: '/onboarding' }
        ]
      }
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/mobily-enterprises/jsonrestapi-schema' }
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

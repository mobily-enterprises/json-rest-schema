import fs from 'node:fs/promises'
import path from 'node:path'

const rootDir = process.cwd()
const readmePath = path.join(rootDir, 'README.md')
const docsDir = path.join(rootDir, 'docs')
const generatedDir = path.join(docsDir, 'generated')
const generatedNavPath = path.join(docsDir, '.vitepress', 'generated-readme-nav.mjs')
const docsIndexPath = path.join(docsDir, 'index.md')

const MANUAL_GROUPS = [
  {
    text: 'Basics',
    slugs: [
      'installation',
      'getting-started-your-first-schema',
      'validation-results-and-error-helpers'
    ]
  },
  {
    text: 'Contracts',
    slugs: [
      'operation-contracts',
      'custom-operations',
      'field-introspection',
      'nested-object-array-and-object-bag-contracts',
      'typed-object-maps',
      'known-fields-plus-passthrough-extras',
      'recursive-schemas',
      'path-scoped-validation-for-forms-and-interactive-uis',
      'transport-json-schema-export'
    ]
  },
  {
    text: 'Adapters and Demos',
    slugs: [
      'react-hook-form-resolver',
      'vue-form-adapter',
      'vuetify-bridge',
      'veevalidate-v5-bridge',
      'demo-apps-and-browser-smoke-tests'
    ]
  },
  {
    text: 'Recipes and Reference',
    slugs: [
      'common-rest-recipes',
      'built-in-rules-reference',
      'extending-the-library-custom-rules',
      'advanced-creating-a-plugin',
      'design-scope'
    ]
  }
]

function slugifyHeading (heading) {
  return heading
    .toLowerCase()
    .replace(/[`]/g, '')
    .replace(/^[0-9]+\.\s*/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function normalizeSidebarText (heading) {
  return heading.replace(/^[0-9]+\.\s*/, '').trim()
}

function splitReadmeIntoSections (markdown) {
  const lines = markdown.split('\n')
  const titleLine = lines.find(line => line.startsWith('# '))

  if (!titleLine) {
    throw new Error('README.md must start with a top-level heading.')
  }

  const title = titleLine.slice(2).trim()
  const sectionStartIndexes = []

  for (let index = 0; index < lines.length; index++) {
    if (lines[index].startsWith('## ')) {
      sectionStartIndexes.push(index)
    }
  }

  if (sectionStartIndexes.length === 0) {
    throw new Error('README.md must contain at least one "##" section for docs generation.')
  }

  const introStartIndex = lines.indexOf(titleLine) + 1
  const introLines = lines.slice(introStartIndex, sectionStartIndexes[0]).join('\n').trim()
  const sections = []

  for (let index = 0; index < sectionStartIndexes.length; index++) {
    const startIndex = sectionStartIndexes[index]
    const endIndex = sectionStartIndexes[index + 1] ?? lines.length
    const heading = lines[startIndex].slice(3).trim()
    const body = lines.slice(startIndex + 1, endIndex).join('\n').trim()

    sections.push({
      heading,
      body,
      slug: slugifyHeading(heading),
      sidebarText: normalizeSidebarText(heading)
    })
  }

  return { title, introLines, sections }
}

function buildManualGroups (sections) {
  const sectionBySlug = new Map(sections.map(section => [section.slug, section]))
  const assignedSlugs = new Set()

  const groupedSections = MANUAL_GROUPS.map(group => {
    const items = group.slugs.map(slug => {
      const section = sectionBySlug.get(slug)

      if (!section) {
        throw new Error(`README section '${slug}' is referenced in MANUAL_GROUPS but no matching "##" heading was found.`)
      }

      if (assignedSlugs.has(slug)) {
        throw new Error(`README section '${slug}' is assigned to multiple manual groups.`)
      }

      assignedSlugs.add(slug)

      return {
        text: section.sidebarText,
        link: `/generated/${section.slug}`
      }
    })

    return {
      text: group.text,
      items
    }
  })

  const ungroupedSections = sections.filter(section => !assignedSlugs.has(section.slug))
  if (ungroupedSections.length > 0) {
    const missing = ungroupedSections.map(section => `"${section.heading}" (${section.slug})`).join(', ')
    throw new Error(`Every top-level README chapter must be assigned in MANUAL_GROUPS. Missing: ${missing}`)
  }

  return groupedSections
}

function buildIndexMarkdown (title, introLines, groupedSections) {
  const groupsMarkdown = groupedSections.map(group => {
    const links = group.items
      .map(item => `- [${item.text}](${item.link})`)
      .join('\n')

    return `### ${group.text}

${links}`
  }).join('\n\n')

  return `# ${title}

${introLines}

## Manual Chapters

${groupsMarkdown}
`
}

function buildSectionMarkdown (section) {
  return `# ${section.heading}

${section.body}
`
}

function buildGeneratedNavFile (groupedSections) {
  return `export const readmeSidebar = ${JSON.stringify(groupedSections, null, 2)}\n`
}

async function removeGeneratedMarkdownFiles () {
  await fs.mkdir(generatedDir, { recursive: true })
  const entries = await fs.readdir(generatedDir, { withFileTypes: true })

  await Promise.all(entries.map(async entry => {
    if (entry.isFile() && entry.name.endsWith('.md')) {
      await fs.unlink(path.join(generatedDir, entry.name))
    }
  }))
}

async function main () {
  const readme = await fs.readFile(readmePath, 'utf8')
  const { title, introLines, sections } = splitReadmeIntoSections(readme)
  const groupedSections = buildManualGroups(sections)

  await removeGeneratedMarkdownFiles()

  await fs.writeFile(docsIndexPath, buildIndexMarkdown(title, introLines, groupedSections))
  await fs.writeFile(generatedNavPath, buildGeneratedNavFile(groupedSections))

  await Promise.all(sections.map(section => {
    const outputPath = path.join(generatedDir, `${section.slug}.md`)
    return fs.writeFile(outputPath, buildSectionMarkdown(section))
  }))
}

await main()

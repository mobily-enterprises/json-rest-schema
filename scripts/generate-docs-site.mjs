import fs from 'node:fs/promises'
import path from 'node:path'

const rootDir = process.cwd()
const readmePath = path.join(rootDir, 'README.md')
const docsDir = path.join(rootDir, 'docs')
const generatedDir = path.join(docsDir, 'generated')
const generatedNavPath = path.join(docsDir, '.vitepress', 'generated-readme-nav.mjs')
const docsIndexPath = path.join(docsDir, 'index.md')

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

function buildIndexMarkdown (title, introLines, sections) {
  const sectionLinks = sections
    .map(section => `- [${section.sidebarText}](/generated/${section.slug})`)
    .join('\n')

  return `# ${title}

${introLines}

## Read The README By Section

${sectionLinks}
`
}

function buildSectionMarkdown (section) {
  return `# ${section.heading}

${section.body}
`
}

function buildGeneratedNavFile (sections) {
  const readmeItems = sections.map(section => ({
    text: section.sidebarText,
    link: `/generated/${section.slug}`
  }))

  const source = `export const readmeSidebar = ${JSON.stringify(readmeItems, null, 2)}\n`
  return source
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

  await removeGeneratedMarkdownFiles()

  await fs.writeFile(docsIndexPath, buildIndexMarkdown(title, introLines, sections))
  await fs.writeFile(generatedNavPath, buildGeneratedNavFile(sections))

  await Promise.all(sections.map(section => {
    const outputPath = path.join(generatedDir, `${section.slug}.md`)
    return fs.writeFile(outputPath, buildSectionMarkdown(section))
  }))
}

await main()

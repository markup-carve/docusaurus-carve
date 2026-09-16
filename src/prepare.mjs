import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

export async function convertCarve(source, options = {}) {
  const [carve, { fileSystemResolver }, { parse: parseToml }, { parse: parseYaml, stringify: stringifyYaml }] = await Promise.all([
    import('@markup-carve/carve'), import('@markup-carve/carve/node'), import('smol-toml'), import('yaml'),
  ])
  const carveOptions = options.carveOptions ?? {}
  const document = carve.parse(source, carveOptions)
  const expanded = options.sourcePath && (options.includes ?? true)
    ? carve.expandIncludes(document, source, {
        resolve: fileSystemResolver(path.resolve(options.includeRoot ?? path.dirname(options.sourcePath))),
        sourcePath: path.resolve(options.sourcePath),
        extensions: carveOptions.extensions,
      })
    : null
  const body = expanded
    ? carve.renderDocument(expanded.doc, { ...carveOptions, target: 'markdown' })
    : carve.carveToMarkdown(source, carveOptions)
  options.onWarnings?.(expanded?.warnings ?? [])
  if (!document.frontmatter) return body

  const { format, content } = document.frontmatter
  let data
  if (format === 'yaml') data = parseYaml(content)
  else if (format === 'toml') data = parseToml(content)
  else if (format === 'json') data = content.trim() === '' ? {} : JSON.parse(content)
  else throw new Error(`Docusaurus Carve does not support frontmatter format ${JSON.stringify(format)}`)
  return `---\n${stringifyYaml(data).trimEnd()}\n---\n\n${body}`
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  return (await Promise.all(entries.map(async (entry) => {
    const file = path.join(directory, entry.name)
    return entry.isDirectory() ? walk(file) : [file]
  }))).flat()
}

/** Create a private Markdown mirror consumed by Docusaurus' official docs plugin. */
export async function prepareDocs(sourceDir, outputDir, options = {}) {
  const source = path.resolve(sourceDir)
  const output = path.resolve(outputDir)
  if (!(await stat(source)).isDirectory()) throw new Error(`Carve docs path is not a directory: ${source}`)
  await rm(output, { recursive: true, force: true })
  await mkdir(path.dirname(output), { recursive: true })
  await cp(source, output, { recursive: true })

  const files = await walk(output)
  const carveFiles = files.filter((file) => file.endsWith('.crv'))
  const warnings = []
  for (const file of carveFiles) {
    const markdownFile = file.slice(0, -4) + '.md'
    if (files.includes(markdownFile)) {
      throw new Error(`Both ${path.relative(output, file)} and ${path.relative(output, markdownFile)} map to the same Docusaurus document`)
    }
    const relative = path.relative(output, file)
    const sourceFile = path.join(source, relative)
    const converted = await convertCarve(await readFile(sourceFile, 'utf8'), {
      ...options,
      sourcePath: sourceFile,
      includeRoot: options.includeRoot ?? source,
      onWarnings(items) { warnings.push(...items) },
    })
    await writeFile(markdownFile, converted)
    await rm(file)
  }
  return { source, output, converted: carveFiles.length, warnings }
}

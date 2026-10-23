import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

export async function convertCarve(source, options = {}) {
  const [carve, { fileSystemResolver }, { parse: parseToml }, { parse: parseYaml, stringify: stringifyYaml }] = await Promise.all([
    import('@markup-carve/carve'), import('@markup-carve/carve/node'), import('smol-toml'), import('yaml'),
  ])
  const carveOptions = options.carveOptions ?? {}
  const sourcePath = options.sourcePath ? path.resolve(options.sourcePath) : undefined
  const includes = sourcePath && (options.includes ?? true)
    ? {
        // A configured root reaches the resolver unchanged, so its absolute-path
        // refusal (PART 9 section 19, I10) still fires. Resolving it here would
        // root containment at the process working directory instead.
        resolve: fileSystemResolver(options.includeRoot ?? path.dirname(sourcePath)),
        sourcePath,
      }
    : undefined
  const document = carve.parse(source, { ...carveOptions, positions: true })
  const warnings = []
  let report
  if (includes) {
    const expanded = carve.expandIncludes(document, source, { ...includes, extensions: carveOptions.extensions })
    warnings.push(...expanded.warnings)
    report = carve.renderDocumentWithReport(expanded.doc, { ...carveOptions, target: 'markdown' })
  } else {
    report = carve.carveToMarkdownWithReport(source, carveOptions)
  }
  const body = report.value
  // A loss is something the Markdown the docs plugin reads no longer says.
  for (const loss of report.losses) {
    warnings.push({ message: loss.message, rule: loss.code, line: loss.pos?.startLine, column: loss.pos?.startColumn, file: loss.pos?.file })
  }
  if (report.truncated) warnings.push({ message: `${report.totalLosses} Markdown export losses in total; the rest were not reported` })
  if (options.lint) {
    const reported = new Set(warnings.map((warning) => `${warning.rule}\0${warning.message}`))
    for (const finding of carve.lintCarve(source, { includes, extensions: carveOptions.extensions })) {
      if (!reported.has(`${finding.rule}\0${finding.message}`)) warnings.push(finding)
    }
  }
  options.onWarnings?.(warnings.map((warning) => ({ ...warning, file: warning.file ?? sourcePath })))
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
/** One line per warning: message, rule, then where, relative to `base` when given. */
export function formatWarning(warning, base) {
  const rule = warning.rule ? ` [${warning.rule}]` : ''
  const file = warning.file ? (base ? path.relative(base, warning.file) : warning.file) : ''
  const at = warning.line ? `${file ? `${file}, ` : ''}line ${warning.line}, column ${warning.column}` : file
  return `${warning.message}${rule}${at ? ` (${at})` : ''}`
}

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

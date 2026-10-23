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
  let tree = document
  if (includes) {
    const expanded = carve.expandIncludes(document, source, { ...includes, extensions: carveOptions.extensions })
    warnings.push(...expanded.warnings)
    tree = expanded.doc
  }
  const reports = []
  let body
  if (options.htmlBlocks) {
    body = mixedBody(carve, tree, carveOptions, options.markdownFormat ?? 'mdx', reports, warnings)
  } else {
    const report = includes
      ? carve.renderDocumentWithReport(tree, { ...carveOptions, target: 'markdown' })
      : carve.carveToMarkdownWithReport(source, carveOptions)
    reports.push(report)
    body = report.value
  }
  // A loss is something the Markdown the docs plugin reads no longer says.
  for (const report of reports) {
    for (const loss of report.losses) {
      warnings.push({ message: loss.message, rule: loss.code, line: loss.pos?.startLine, column: loss.pos?.startColumn, file: loss.pos?.file })
    }
    if (report.truncated) warnings.push({ message: `${report.totalLosses} Markdown export losses in total; the rest were not reported` })
  }
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

const KEEP_MARKDOWN = new Set(['heading', 'link_reference_definition'])
const squash = (html) => html.replace(/\s+/g, ' ').trim()

/**
 * Markdown for every top-level block Markdown can carry, HTML for the rest.
 * A block can be carried when its Markdown, read back by Carve, renders the
 * same HTML. Headings always stay Markdown so Docusaurus keeps the TOC, and
 * so does a block with a footnote reference or a site-relative link or image.
 */
function mixedBody(carve, tree, carveOptions, format, reports, warnings) {
  // The caller writes the frontmatter itself.
  const { frontmatter, ...resolved } = carve.resolve(tree, carveOptions)
  const htmlOptions = { ...carveOptions, sections: false }
  const nonce = `carvehtml${Math.random().toString(36).slice(2)}x`
  const blocks = []
  const children = resolved.children.map((child) => {
    if (KEEP_MARKDOWN.has(child.type)) return child
    const one = { ...resolved, children: [child], footnoteDefs: {} }
    const html = carve.renderDocument(one, { ...htmlOptions, target: 'html' })
    const markdown = carve.renderDocument(one, { ...carveOptions, target: 'markdown' })
    if (squash(carve.carveToHtml(carve.markdownToCarve(markdown), htmlOptions)) === squash(html)) return child
    // Docusaurus numbers the footnotes and rewrites site-relative links and
    // images; inside HTML it does neither, so those blocks stay Markdown.
    const kept = keepReason(child)
    if (kept) {
      warnings.push({
        message: `Block holds ${kept.what}, so it stays Markdown and loses what Markdown cannot say`,
        rule: kept.rule,
        line: child.pos?.startLine,
        column: child.pos?.startColumn,
        file: child.pos?.file,
      })
      return child
    }
    const report = carve.renderDocumentWithReport(one, { ...htmlOptions, target: 'html' })
    reports.push(report)
    blocks.push(report.value.trim())
    return { type: 'paragraph', children: [{ type: 'text', value: `${nonce}${blocks.length - 1}` }] }
  })
  const report = carve.renderDocumentWithReport({ ...resolved, children }, { ...carveOptions, target: 'markdown' })
  reports.push(report)
  return report.value.replace(new RegExp(`^${nonce}(\\d+)$`, 'gm'), (_, index) => embedHtml(blocks[Number(index)], format))
}

const ABSOLUTE = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i

function keepReason(block) {
  let reason = null
  const visit = (node) => {
    if (reason || !node || typeof node !== 'object') return
    if (node.type === 'footnote_ref') reason = { rule: 'html-block-footnote', what: 'a footnote reference' }
    else if ((node.type === 'link' && !ABSOLUTE.test(node.href ?? '')) || (node.type === 'image' && !ABSOLUTE.test(node.src ?? ''))) {
      reason = { rule: 'html-block-relative-link', what: `a site-relative ${node.type}` }
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit)
      else if (value && typeof value === 'object' && value !== node.pos) visit(value)
    }
  }
  visit(block)
  return reason
}

/** An HTML block the docs plugin passes through unchanged. */
export function embedHtml(html, format) {
  // MDX reads raw HTML as JSX, which most real HTML is not.
  if (format === 'mdx') return `<div className="carve-html" dangerouslySetInnerHTML={{ __html: ${JSON.stringify(html)} }} />`
  // A blank line ends a CommonMark HTML block, so the block stays on one line.
  return `<div class="carve-html">${html.replace(/\n/g, '&#10;')}</div>`
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

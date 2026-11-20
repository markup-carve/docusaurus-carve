import { readFileSync } from 'node:fs'
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

/** Options a Carve 0.2 parse reads; every other carveOptions key goes to the writers. */
const PARSE_OPTIONS = new Set(['extensions', 'headingIds'])

/** Thrown while the engine has no Markdown writer, which the Docusaurus mirror is written with. */
export class MarkdownWriterUnavailableError extends Error {
  constructor() {
    super('docusaurus-carve: the Carve 0.2 Markdown writer is not available yet in this @markup-carve/carve build (markup-carve/carve-js#5076); the Docusaurus mirror is written in Markdown, so pages cannot be converted until it lands')
    this.name = 'MarkdownWriterUnavailableError'
    this.code = 'writer-unavailable'
  }
}

/**
 * The engine's writer registry with the Markdown writer, or null while the engine has none.
 * The Markdown writer comes from the engine's export entry, which registers it on a registry.
 */
export async function markdownRegistry() {
  const carve = await import('@markup-carve/carve')
  const registry = carve.createWriterRegistry()
  if (!registry.has('markdown')) {
    let exportsModule
    try {
      exportsModule = await import('@markup-carve/carve/export')
    } catch {
      return null
    }
    exportsModule.registerExports?.(registry)
  }
  return registry.has('markdown') ? registry : null
}

function splitOptions(carveOptions) {
  const parseOptions = {}
  const writeOptions = {}
  for (const [key, value] of Object.entries(carveOptions)) (PARSE_OPTIONS.has(key) ? parseOptions : writeOptions)[key] = value
  return { parseOptions, writeOptions }
}

/** Line and column of a diagnostic's byte range, counted in the file it names, or in `source`. */
function locate(carve, source, diagnostic, file) {
  if (!diagnostic.range) return {}
  let text = source
  if (diagnostic.file !== undefined) {
    try {
      text = readFileSync(file, 'utf8')
    } catch {
      return {}
    }
  }
  const offset = carve.stringOffsetOfByte(text, diagnostic.range.startOffset)
  source = text
  const before = source.slice(0, offset)
  const line = before.split(/\r\n|\r|\n/).length
  const column = offset - Math.max(before.lastIndexOf('\n'), before.lastIndexOf('\r')) 
  return { line, column }
}

function warningOf(carve, source, diagnostic, includeRoot) {
  const file = diagnostic.file === undefined ? undefined : includeRoot ? path.resolve(includeRoot, diagnostic.file) : diagnostic.file
  const at = locate(carve, source, diagnostic, file)
  return { message: diagnostic.message, rule: diagnostic.code, severity: diagnostic.severity, ...at, ...(file ? { file } : {}) }
}

function rangeKey(diagnostic) {
  return `${diagnostic.file ?? ''}\0${diagnostic.range?.startOffset}\0${diagnostic.range?.endOffset}`
}

export async function convertCarve(source, options = {}) {
  const [carve, { fileSystemResolver }, { parse: parseToml }, { parse: parseYaml, parseDocument: parseYamlDocument, stringify: stringifyYaml }] = await Promise.all([
    import('@markup-carve/carve'), import('@markup-carve/carve/node'), import('smol-toml'), import('yaml'),
  ])
  const { parseOptions, writeOptions } = splitOptions(options.carveOptions ?? {})
  const sourcePath = options.sourcePath ? path.resolve(options.sourcePath) : undefined
  let includes
  let includeRoot
  if (sourcePath && (options.includes ?? true)) {
    // A configured root reaches the resolver unchanged, so a relative one is refused
    // instead of being rooted at the process working directory.
    if (options.includeRoot !== undefined && !path.isAbsolute(options.includeRoot)) {
      throw new Error(`docusaurus-carve: includeRoot must be an absolute path, got ${JSON.stringify(options.includeRoot)}`)
    }
    includeRoot = options.includeRoot ?? path.dirname(sourcePath)
    includes = { resolver: fileSystemResolver(includeRoot), file: path.relative(includeRoot, sourcePath).split(path.sep).join('/') }
  }
  const parsed = carve.parseWithDiagnostics(source, { ...parseOptions, ...(includes ? { includes } : {}), positions: true })
  const tree = parsed.document
  const warnings = parsed.diagnostics.map((diagnostic) => warningOf(carve, source, diagnostic, includeRoot))
  const frontmatter = tree.children.find((child) => child.type === 'frontmatter')

  if (options.lint) {
    const lint = options.lint === true ? {} : options.lint
    const reported = new Set(warnings.map((warning) => `${warning.rule}\0${warning.message}`))
    const rules = Object.fromEntries((lint.enabledRules ?? []).map((rule) => [rule, 'on']))
    const findings = carve.lint(source, { ...(includes ? { includes } : {}), extensions: parseOptions.extensions, rules })
    for (const finding of findings) {
      if (finding.severity === 'hint' && !lint.hints) continue
      const warning = warningOf(carve, source, finding, includeRoot)
      if (!reported.has(`${warning.rule}\0${warning.message}`)) warnings.push(warning)
    }
  }

  let data
  if (frontmatter) {
    const { format: frontmatterFormat, value: content } = frontmatter
    // YAML with no content (blank or comments only) parses as null; that is an empty mapping.
    if (frontmatterFormat === 'yaml') data = parseYamlDocument(content).contents === null ? {} : parseYaml(content)
    else if (frontmatterFormat === 'toml') data = parseToml(content)
    else if (frontmatterFormat === 'json') data = content.trim() === '' ? {} : JSON.parse(content)
    else throw new Error(`Docusaurus Carve does not support frontmatter format ${JSON.stringify(frontmatterFormat)}`)
    if (data === null || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error(`Frontmatter${sourcePath ? ` in ${sourcePath}` : ''} must be a mapping of keys to values`)
    }
  }

  const registry = await markdownRegistry()
  if (!registry) {
    options.onWarnings?.(warnings.map((warning) => ({ ...warning, file: warning.file ?? sourcePath })))
    throw new MarkdownWriterUnavailableError()
  }
  // The frontmatter is written once, normalized, below.
  const bodyTree = { ...tree, children: tree.children.filter((child) => child.type !== 'frontmatter') }
  const results = []
  const format = options.markdownFormat ?? 'mdx'
  const mdx = format === 'mdx' ? await mdxSerializer() : undefined
  let body
  if (options.htmlBlocks) {
    body = await mixedBody(carve, registry, bodyTree, writeOptions, format, mdx, results, warnings)
  } else {
    const result = registry.write('markdown', bodyTree, writeOptions)
    results.push(result)
    body = mdx ? mdx(result.output) : result.output
  }
  // A loss is something the Markdown the docs plugin reads no longer says. An include the
  // parse already reported is not reported again as the writer's include-unresolved loss.
  const includeFailures = new Set(parsed.diagnostics.filter((d) => d.code.startsWith('include-')).map(rangeKey))
  for (const result of results) {
    for (const diagnostic of result.diagnostics) {
      if (diagnostic.code === 'include-unresolved' && includeFailures.has(rangeKey(diagnostic))) continue
      warnings.push(warningOf(carve, source, diagnostic, includeRoot))
    }
  }
  if (parsed.suppressedDiagnostics) warnings.push({ message: `${parsed.suppressedDiagnostics} more include diagnostics were not reported` })
  options.onWarnings?.(warnings.map((warning) => ({ ...warning, file: warning.file ?? sourcePath })))
  if (!frontmatter) return body
  return `---\n${stringifyYaml(data).trimEnd()}\n---\n\n${body}`
}

/**
 * The writer targets CommonMark, where `<` and `{` are text; MDX reads them
 * as JSX and expressions. Rewriting through mdast escapes both wherever MDX
 * would parse them, and writes autolinks as `[url](url)`.
 */
async function mdxSerializer() {
  const [{ fromMarkdown }, { toMarkdown }, { gfm }, { gfmFromMarkdown, gfmToMarkdown }, { mdxToMarkdown }] = await Promise.all([
    import('mdast-util-from-markdown'), import('mdast-util-to-markdown'), import('micromark-extension-gfm'), import('mdast-util-gfm'), import('mdast-util-mdx'),
  ])
  return (markdown) => toMarkdown(fromMarkdown(markdown, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] }), {
    extensions: [gfmToMarkdown(), mdxToMarkdown()],
    resourceLink: true,
    bullet: '-',
    emphasis: '*',
    fences: true,
    listItemIndent: 'one',
    rule: '-',
  })
}

const KEEP_MARKDOWN = new Set(['heading', 'link_reference_definition'])
/** Definitions a block's references resolve against; they stay with the Markdown. */
const NOTE_TYPES = new Set(['footnote', 'abbreviation_def', 'citation_definition'])
const squash = (html) => html.replace(/\s+/g, ' ').trim()

/**
 * Markdown for every top-level block Markdown can carry, HTML for the rest.
 * A block can be carried when its Markdown, read back by Carve, renders the
 * same HTML. Headings always stay Markdown so Docusaurus keeps the TOC, and
 * so does a block with a footnote reference or a site-relative link or image.
 */
async function mixedBody(carve, registry, tree, writeOptions, format, mdx, results, warnings) {
  const { importDocument } = await import('@markup-carve/carve/import')
  const htmlOptions = { ...writeOptions, sections: false }
  const notes = tree.children.filter((child) => NOTE_TYPES.has(child.type))
  const nonce = `carvehtml${Math.random().toString(36).slice(2)}x`
  const blocks = []
  const children = tree.children.map((child) => {
    if (KEEP_MARKDOWN.has(child.type) || NOTE_TYPES.has(child.type)) return child
    const one = { ...tree, children: [child, ...notes] }
    const html = registry.write('html', one, htmlOptions).output
    const markdown = registry.write('markdown', { ...tree, children: [child] }, writeOptions).output
    let reread
    try {
      reread = carve.render(importDocument(markdown, { from: 'gfm' }).document, htmlOptions)
    } catch {
      reread = undefined
    }
    if (reread !== undefined && squash(reread) === squash(html)) return child
    // Docusaurus numbers the footnotes and rewrites site-relative links and
    // images; inside HTML it does neither, so those blocks stay Markdown.
    const kept = keepReason(child)
    if (kept) {
      warnings.push({
        message: `Block holds ${kept.what}, so it stays Markdown and loses what Markdown cannot say`,
        rule: kept.rule,
        line: child.pos?.startLine,
        column: child.pos?.startColumn,
        ...(child.pos?.file ? { file: child.pos.file } : {}),
      })
      return child
    }
    const result = registry.write('html', { ...tree, children: [child] }, htmlOptions)
    results.push(result)
    blocks.push(result.output.trim())
    return { type: 'paragraph', children: [{ type: 'text', value: `${nonce}${blocks.length - 1}` }] }
  })
  const result = registry.write('markdown', { ...tree, children }, writeOptions)
  results.push(result)
  return (mdx ? mdx(result.output) : result.output).replace(new RegExp(`^${nonce}(\\d+)$`, 'gm'), (_, index) => embedHtml(blocks[Number(index)], format))
}

const ABSOLUTE = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i

function keepReason(block) {
  let reason = null
  const visit = (node) => {
    if (reason || !node || typeof node !== 'object') return
    if (node.type === 'footnote_ref' || node.type === 'inline_footnote') reason = { rule: 'html-block-footnote', what: 'a footnote reference' }
    else if ((node.type === 'link' && !ABSOLUTE.test(node.href ?? '')) || (node.type === 'image' && !ABSOLUTE.test(node.src ?? ''))) {
      reason = { rule: 'html-block-relative-link', what: `a site-relative ${node.type}` }
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit)
      else if (value && typeof value === 'object' && value !== node.pos && value !== node.attrs) visit(value)
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

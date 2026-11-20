import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { convertCarve, formatWarning, prepareDocs } from '../src/index.mjs'
import { markdownRegistry } from '../src/prepare.mjs'


test('converts Carve semantics to Docusaurus-readable Markdown', async () => {
  const markdown = await convertCarve('---\ntitle: Test\n---\n\n# Hello\n\nA *strong* and /careful/ page.\n')
  assert.match(markdown, /^---\ntitle: Test\n---/)
  assert.match(markdown, /# Hello/)
  assert.match(markdown, /\*\*strong\*\*/)
  assert.match(markdown, /\*careful\*/)
})

test('writes the frontmatter once, on every render path', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'docusaurus-carve-frontmatter-'))
  const sourcePath = path.join(root, 'page.crv')
  const source = '---\ntitle: Test\n---\n\n# Hello\n'
  for (const options of [{}, { sourcePath }, { htmlBlocks: true }, { sourcePath, includes: false }]) {
    assert.equal(await convertCarve(source, options), '---\ntitle: Test\n---\n\n# Hello\n', JSON.stringify(options))
  }
})

test('writes empty frontmatter as an empty mapping', async () => {
  assert.equal(await convertCarve('---\n---\n\n# Hello\n'), '---\n{}\n---\n\n# Hello\n')
  assert.equal(await convertCarve('---\n# a comment\n---\n\n# Hello\n'), '---\n{}\n---\n\n# Hello\n')
})

test('refuses frontmatter that is not a mapping', async () => {
  for (const source of ['---\n- a\n- b\n---\n\n# Hello\n', '---\nnull\n---\n\n# Hello\n', '--- json\nnull\n---\n\n# Hello\n']) {
    await assert.rejects(() => convertCarve(source, { sourcePath: '/docs/page.crv', includes: false }), /Frontmatter in \/docs\/page\.crv must be a mapping/, source)
  }
})

test('mirrors ordinary docs and replaces .crv with .md', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'docusaurus-carve-'))
  const input = path.join(root, 'docs')
  const output = path.join(root, 'generated')
  await mkdir(path.join(input, 'guide'), { recursive: true })
  await writeFile(path.join(input, 'guide', 'intro.crv'), '# Intro\n')
  await writeFile(path.join(input, 'keep.md'), '# Keep\n')
  const result = await prepareDocs(input, output)
  assert.equal(result.converted, 1)
  assert.match(await readFile(path.join(output, 'guide', 'intro.md'), 'utf8'), /# Intro/)
  assert.equal(await readFile(path.join(output, 'keep.md'), 'utf8'), '# Keep\n')
})

test('refuses ambiguous same-stem Carve and Markdown docs', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'docusaurus-carve-'))
  const input = path.join(root, 'docs')
  await mkdir(input)
  await writeFile(path.join(input, 'same.crv'), '# Carve\n')
  await writeFile(path.join(input, 'same.md'), '# Markdown\n')
  await assert.rejects(() => prepareDocs(input, path.join(root, 'out')), /map to the same/)
})

test('expands includes from the source tree before writing the mirror', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'docusaurus-carve-include-'))
  const input = path.join(root, 'docs')
  const output = path.join(root, 'generated')
  await mkdir(path.join(input, 'guide'), { recursive: true })
  await writeFile(path.join(input, 'shared.crv'), 'Included text.\n')
  await writeFile(path.join(input, 'guide', 'intro.crv'), '{{ ../shared.crv }}\n')
  await prepareDocs(input, output)
  assert.match(await readFile(path.join(output, 'guide', 'intro.md'), 'utf8'), /Included text\./)
})

test('refuses a relative include root instead of rooting it at the cwd', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'docusaurus-carve-relroot-'))
  const input = path.join(root, 'docs')
  const output = path.join(root, 'generated')
  await mkdir(input, { recursive: true })
  await writeFile(path.join(input, 'intro.crv'), '{{ shared.crv }}\n')
  await assert.rejects(() => prepareDocs(input, output, { includeRoot: '..' }), /absolute path/)
})

test('includes only the named region of a file', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'docusaurus-carve-region-'))
  const input = path.join(root, 'docs')
  await mkdir(input, { recursive: true })
  await writeFile(path.join(input, 'shared.crv'), 'Before.\n\n%% #region intro\nInside the region.\n%% #endregion\n\nAfter.\n')
  await writeFile(path.join(input, 'example.ts'), 'import x from "y"\n// #region demo\nconst a = 1\n// #endregion\n')
  await writeFile(path.join(input, 'page.crv'), '{{ shared.crv @region:intro }}\n\n{{ example.ts @region:demo @code:ts }}\n')
  const result = await prepareDocs(input, path.join(root, 'generated'))
  const markdown = await readFile(path.join(root, 'generated', 'page.md'), 'utf8')
  assert.match(markdown, /Inside the region\./)
  assert.doesNotMatch(markdown, /Before\.|After\.|import x/)
  assert.match(markdown, /```ts\nconst a = 1\n```/)
  assert.deepEqual(result.warnings, [])
})

test('reports what the Markdown export lost, with its position', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'docusaurus-carve-loss-'))
  const input = path.join(root, 'docs')
  await mkdir(input, { recursive: true })
  await writeFile(path.join(input, 'shared.crv'), 'Text.\n\n[x](javascript:y)\n')
  await writeFile(path.join(input, 'page.crv'), 'Top [a](javascript:b).\n\n{{ shared.crv }}\n')
  const result = await prepareDocs(input, path.join(root, 'generated'))
  // shared.crv is a page of its own as well, so its loss is reported twice.
  assert.deepEqual(result.warnings.map((warning) => formatWarning(warning, input)).sort(), [
    'Blanked a denied destination scheme [destination-denied] (page.crv, line 1, column 5)',
    'Blanked a denied destination scheme [destination-denied] (shared.crv, line 3, column 1)',
    'Blanked a denied destination scheme [destination-denied] (shared.crv, line 3, column 1)',
  ])
})

test('reports losses on the path without includes too', async () => {
  const warnings = []
  await convertCarve('[x](javascript:y)\n', { onWarnings: (items) => warnings.push(...items) })
  assert.deepEqual(warnings.map((warning) => warning.rule), ['destination-denied'])
})

test('lints during prepare only when asked, and reports an include failure once', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'docusaurus-carve-lint-'))
  const input = path.join(root, 'docs')
  await mkdir(input, { recursive: true })
  await writeFile(path.join(input, 'shared.crv'), 'Bad [l](#zzz).\n')
  await writeFile(path.join(input, 'page.crv'), 'See [x](#nope).\n\n{{ shared.crv }}\n\n{{ missing.crv }}\n')
  const quiet = await prepareDocs(input, path.join(root, 'quiet'))
  // C2-N-061: a missing file is include-not-found at parse, include-unresolved only as a render loss.
  assert.deepEqual(quiet.warnings.map((warning) => warning.rule), ['include-not-found'])
  const linted = await prepareDocs(input, path.join(root, 'linted'), { lint: true })
  assert.deepEqual(linted.warnings.map((warning) => formatWarning(warning, input)).sort(), [
    // C2-N-061: the 0.2 parse diagnostic of a missing include.
    'Include "missing.crv" was not expanded: the file does not exist. [include-not-found] (page.crv, line 5, column 1)',
    'Link to "#nope" matches no id in this document, so the link goes nowhere. [broken-fragment-link] (page.crv, line 1, column 5)',
    'Link to "#zzz" matches no id in this document, so the link goes nowhere. [broken-fragment-link] (shared.crv, line 1, column 5)',
    'Link to "#zzz" matches no id in this document, so the link goes nowhere. [broken-fragment-link] (shared.crv, line 1, column 5)',
  ])
})

test('htmlBlocks is off by default', async () => {
  const markdown = await convertCarve('{.note}\n:::\nInside.\n:::\n')
  assert.equal(markdown, 'Inside.\n')
})

test('htmlBlocks keeps what Markdown can carry and renders the rest as HTML', async () => {
  const source = '---\ntitle: Mixed\n---\n\n# Title\n\nA *strong* paragraph.\n\n{.note}\n:::\nInside a div.\n:::\n\n![Alt](https://example.com/a.png)\n^ A caption\n'
  const markdown = await convertCarve(source, { htmlBlocks: true })
  assert.equal(markdown, [
    '---\ntitle: Mixed\n---\n',
    '# Title\n',
    'A **strong** paragraph.\n',
    '<div className="carve-html" dangerouslySetInnerHTML={{ __html: "<div class=\\"note\\">\\n  <p>Inside a div.</p>\\n</div>" }} />\n',
    '<div className="carve-html" dangerouslySetInnerHTML={{ __html: "<figure>\\n  <img src=\\"https://example.com/a.png\\" alt=\\"Alt\\">\\n  <figcaption>A caption</figcaption>\\n</figure>" }} />\n',
  ].join('\n'))
})

test('htmlBlocks writes one-line raw HTML for the CommonMark format', async () => {
  const markdown = await convertCarve('{.note}\n:::\nA\n\n```\nx\n\ny\n```\n:::\n', { htmlBlocks: true, markdownFormat: 'md' })
  const [line, ...rest] = markdown.trimEnd().split('\n')
  assert.deepEqual(rest, [])
  assert.match(line, /^<div class="carve-html"><div class="note">&#10;/)
  assert.match(line, /x&#10;&#10;y/)
})

test('htmlBlocks keeps a block with a footnote reference as Markdown, and says so', async () => {
  const warnings = []
  const markdown = await convertCarve('{.note}\n:::\nIn a div[^1].\n:::\n\n[^1]: The note.\n', {
    htmlBlocks: true,
    onWarnings: (items) => warnings.push(...items),
  })
  assert.equal(markdown, 'In a div[^1].\n\n[^1]: The note.\n')
  // C2-A-148: a block that took an attribute line starts at that line. The 0.2 Markdown
  // writer reports a flattened container once, its attributes included.
  assert.deepEqual(warnings.map((warning) => [warning.rule, warning.line]), [['html-block-footnote', 1], ['markdown-container-flattened', 1]])
})

test('htmlBlocks keeps a block with a site-relative link or image as Markdown', async () => {
  const warnings = []
  const markdown = await convertCarve(
    '{.a}\n:::\nSee [other](other.md).\n:::\n\n{.b}\n:::\n![Logo](./logo.png)\n:::\n\n{.c}\n:::\nSee [site](https://example.com) and [top](#top).\n:::\n',
    { htmlBlocks: true, onWarnings: (items) => warnings.push(...items) },
  )
  assert.match(markdown, /^See \[other\]\(other\.md\)\.\n\n!\[Logo\]\(\.\/logo\.png\)\n\n<div className="carve-html"/)
  // C2-A-148: each block starts at its attribute line. The 0.2 Markdown writer reports a
  // flattened container once, its attributes included.
  assert.deepEqual(warnings.map((warning) => [warning.rule, warning.line]), [
    ['html-block-relative-link', 1],
    ['html-block-relative-link', 6],
    ['markdown-container-flattened', 1],
    ['markdown-container-flattened', 6],
  ])
})

test('htmlBlocks applies to included content and still reports losses', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'docusaurus-carve-mixed-'))
  const input = path.join(root, 'docs')
  await mkdir(input, { recursive: true })
  await writeFile(path.join(input, '_part.crv'), '{.note}\n:::\nShared [x](javascript:y).\n:::\n')
  await writeFile(path.join(input, 'page.crv'), '# Page\n\n{{ _part.crv }}\n')
  const result = await prepareDocs(input, path.join(root, 'generated'), { htmlBlocks: true })
  const markdown = await readFile(path.join(root, 'generated', 'page.md'), 'utf8')
  assert.match(markdown, /^# Page\n\n<div className="carve-html" dangerouslySetInnerHTML=\{\{ __html: "<div class=\\"note\\">/)
  const own = result.warnings.filter((warning) => warning.file === path.join(input, '_part.crv') && warning.rule === 'destination-denied')
  assert.equal(own.length, 2, 'the included block and the partial itself each report the blanked link')
})

test('warns when frontmatter runs to the end of the file', async () => {
  const warnings = []
  const markdown = await convertCarve('---\ntitle: x\n\n# Lost\n', { onWarnings: (items) => warnings.push(...items) })
  assert.doesNotMatch(markdown, /# Lost/)
  // C2-B-163: the 0.2 engine reports unclosed frontmatter itself.
  assert.deepEqual(warnings.map((warning) => [warning.rule, warning.line]), [['unclosed-frontmatter', 1]])
})

test('closed frontmatter draws no warning', async () => {
  for (const source of ['---\ntitle: x\n---\n\n# H\n', '---\ntitle: x\n---', '---\r\ntitle: x\r\n---  \r\nbody\r\n', '---\n---\n']) {
    const warnings = []
    await convertCarve(source, { onWarnings: (items) => warnings.push(...items) })
    assert.deepEqual(warnings, [], JSON.stringify(source))
  }
})

test('lint skips hints unless asked', async () => {
  const rules = async (lint) => {
    const warnings = []
    await convertCarve('# A\n\npara\n\n---\n\nb\n', { lint, onWarnings: (items) => warnings.push(...items) })
    return warnings.map((warning) => warning.rule)
  }
  assert.deepEqual(await rules(true), [])
  assert.deepEqual(await rules({ hints: true }), ['thematic-break-spelling'])
})

test('lint runs the opt-in rules it is given', async () => {
  const rules = async (lint) => {
    const warnings = []
    await convertCarve('See [here](https://example.com).\n', { lint, onWarnings: (items) => warnings.push(...items) })
    return warnings.map((warning) => warning.rule)
  }
  assert.deepEqual(await rules(true), [])
  assert.deepEqual(await rules({ enabledRules: ['non-descriptive-link-text'] }), ['non-descriptive-link-text'])
})

test('the mdx mirror writes autolinks as links and escapes what MDX would parse', async () => {
  assert.equal(await convertCarve('See <https://example.com> and <hello@example.com>.\n'), 'See [https://example.com](https://example.com) and [hello@example.com](mailto:hello@example.com).\n')
  assert.equal(await convertCarve('A literal \\{brace\\} and \\<b> tag.\n'), 'A literal \\{brace} and \\<b> tag.\n')
  assert.equal(await convertCarve('Inline $`x^{2}`.\n'), 'Inline $x^\\{2}$.\n')
  assert.equal(await convertCarve('``` js\nx = {a: 1}\n```\n\nCode `{a}`.\n'), '```js\nx = {a: 1}\n```\n\nCode `{a}`.\n')
})

test('the mdx mirror escapes table cells, footnotes and htmlBlocks pages too', async () => {
  const markdown = await convertCarve('|= A |\n| {x} |\n\nN[^n].\n\n[^n]: See <https://example.com>.\n\n{.note}\n:::\nIn {a} div.\n:::\n', { htmlBlocks: true })
  assert.match(markdown, /\| \\\{x\} \|/)
  assert.match(markdown, /\[\^n\]: See \[https:\/\/example\.com\]\(https:\/\/example\.com\)\./)
  assert.match(markdown, /dangerouslySetInnerHTML=\{\{ __html: "<div class=\\"note\\">\\n  <p>In \{a\} div\.<\/p>/)
})

test('the md mirror keeps the CommonMark the writer wrote', async () => {
  assert.equal(await convertCarve('See <https://example.com> and \\{brace\\}.\n', { markdownFormat: 'md' }), 'See <https://example.com> and {brace}.\n')
})

test('the pinned engine exposes the Markdown writer', async () => {
  assert.ok(await markdownRegistry())
})

test('counts include diagnostics past the engine cap instead of dropping them', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'docusaurus-carve-cap-'))
  const source = Array.from({ length: 103 }, (_, i) => `{{ missing${i}.crv }}`).join('\n\n') + '\n'
  let warnings = []
  await convertCarve(source, { sourcePath: path.join(root, 'page.crv'), onWarnings: (list) => { warnings = list } })
  assert.equal(warnings.filter((warning) => warning.rule === 'include-not-found').length, 100)
  assert.ok(warnings.some((warning) => warning.message === '3 more include diagnostics were not reported'))
})

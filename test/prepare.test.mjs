import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { convertCarve, formatWarning, prepareDocs } from '../src/index.mjs'

test('converts Carve semantics to Docusaurus-readable Markdown', async () => {
  const markdown = await convertCarve('---\ntitle: Test\n---\n\n# Hello\n\nA *strong* and /careful/ page.\n')
  assert.match(markdown, /^---\ntitle: Test\n---/)
  assert.match(markdown, /# Hello/)
  assert.match(markdown, /\*\*strong\*\*/)
  assert.match(markdown, /\*careful\*/)
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
  assert.deepEqual(quiet.warnings.map((warning) => warning.rule), ['include-unresolved'])
  const linted = await prepareDocs(input, path.join(root, 'linted'), { lint: true })
  assert.deepEqual(linted.warnings.map((warning) => formatWarning(warning, input)).sort(), [
    'Include "missing.crv" could not be resolved. [include-unresolved] (page.crv, line 5, column 1)',
    'Link to "#nope" matches no id in this document, so the link goes nowhere. [broken-fragment-link] (page.crv, line 1, column 5)',
    'Link to "#zzz" matches no id in this document, so the link goes nowhere. [broken-fragment-link] (shared.crv, line 1, column 5)',
    'Link to "#zzz" matches no id in this document, so the link goes nowhere. [broken-fragment-link] (shared.crv, line 1, column 5)',
  ])
})

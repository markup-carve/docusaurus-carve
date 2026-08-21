import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { convertCarve, prepareDocs } from '../src/index.mjs'

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

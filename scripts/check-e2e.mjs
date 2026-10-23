// Run after `docusaurus build example`: the carve fence on the home page must
// come out tokenized, which only happens when the grammar was registered.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const html = await readFile(new URL('../example/build/index.html', import.meta.url), 'utf8')
const block = html.match(/language-carve[\s\S]*?<\/pre>/)?.[0]
assert.ok(block, 'no carve code block on the example home page')
assert.match(block, /class="token title important/, 'the carve fence was not highlighted')
console.log('e2e: carve fence highlighted')

// htmlBlocks: the div and the figure arrive as HTML, the headings stay in the TOC.
const mixed = await readFile(new URL('../example/build/mixed/index.html', import.meta.url), 'utf8')
assert.match(mixed, /<div class="carve-html"><div class="carve-note">/, 'the div was not rendered as HTML')
assert.match(mixed, /<figcaption>A figure caption<\/figcaption>/, 'the figure lost its caption')
const toc = mixed.match(/table-of-contents[\s\S]*?<\/ul>/)?.[0] ?? ''
assert.match(toc, /Kept as Markdown/)
assert.match(toc, /Rendered as HTML/)
console.log('e2e: mixed page keeps its TOC and renders lossy blocks as HTML')

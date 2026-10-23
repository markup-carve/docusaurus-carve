// Run after `docusaurus build example`: the carve fence on the home page must
// come out tokenized, which only happens when the grammar was registered.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const html = await readFile(new URL('../example/build/index.html', import.meta.url), 'utf8')
const block = html.match(/language-carve[\s\S]*?<\/pre>/)?.[0]
assert.ok(block, 'no carve code block on the example home page')
assert.match(block, /class="token title important/, 'the carve fence was not highlighted')
console.log('e2e: carve fence highlighted')

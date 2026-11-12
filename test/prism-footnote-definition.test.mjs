import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { prismClientModule } from '../src/index.mjs'

const require = createRequire(import.meta.url)

test('the client grammar scopes footnote descriptions at the footnote body column', () => {
  const { Prism } = require('prism-react-renderer')
  require(prismClientModule)

  // The description line must sit inside the definition-list token, as the
  // engine renders all three shapes as a <dl> in the footnote.
  const describes = (source) => Prism.tokenize(source, Prism.languages.carve)
    .some((token) => typeof token !== 'string' && token.type === 'definition-list'
      && Array.isArray(token.content) && token.content.includes('definition\n'))

  for (const indent of ['   ', '  \t']) {
    assert.ok(describes(`[^f]: note\n${indent}:: term\n  : definition\n`))
  }
  assert.ok(describes('[^f]: note\n  \t:: term\n    : definition\n'))
})

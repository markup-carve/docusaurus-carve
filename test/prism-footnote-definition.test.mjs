import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { prismClientModule } from '../src/index.mjs'

const require = createRequire(import.meta.url)

test('the client grammar scopes footnote descriptions at the footnote body column', () => {
  const { Prism } = require('prism-react-renderer')
  require(prismClientModule)

  const types = (source) => Prism.tokenize(source, Prism.languages.carve)
    .filter((token) => typeof token !== 'string')
    .map((token) => token.type)

  for (const indent of ['   ', '  \t']) {
    assert.ok(types(`[^f]: note\n${indent}:: term\n  : definition\n`).includes('footnote-description'))
  }
  assert.ok(types('[^f]: note\n  \t:: term\n    : definition\n').includes('refused-description'))
})

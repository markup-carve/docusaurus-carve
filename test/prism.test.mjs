import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import { prismClientModule } from '../src/index.mjs'

const require = createRequire(import.meta.url)

test('the client module registers the Carve grammar on the Prism Docusaurus uses', () => {
  assert.ok(existsSync(prismClientModule), prismClientModule)
  const { Prism } = require('prism-react-renderer')
  require(prismClientModule)
  assert.ok(Prism.languages.carve, 'carve is not registered')
  assert.equal(Prism.languages.crv, Prism.languages.carve)
  const tokens = Prism.tokenize('# Title\n', Prism.languages.carve)
  assert.equal(tokens[0].type, 'title')
  assert.equal(globalThis.Prism, undefined, 'the global Prism was left behind')
})

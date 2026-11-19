import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

// A `github:` or `git+` specifier installs fine here and breaks a consumer:
// npm hands them a spec that needs git and a build step, and nothing else in
// the suite reads the declared form. It was reintroduced by #8.
// The next2 line pins the unreleased carve-js 0.2 engine by commit until it is
// published; the registry form returns with the 0.2 release.
const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

const unreleased = { skip: 'the next2 line pins carve-js next2 by commit until Carve 0.2 is published' }

test('the declared engine is a registry version, not a git specifier', unreleased, () => {
  const spec =
    manifest.dependencies?.['@markup-carve/carve'] ??
    manifest.devDependencies?.['@markup-carve/carve']

  assert.ok(spec, '@markup-carve/carve is not declared')
  assert.match(spec, /^[\^~]?\d+\.\d+\.\d+/)
})

test('the unreleased engine is pinned to one commit, never a moving branch', () => {
  const spec = manifest.dependencies?.['@markup-carve/carve']
  assert.match(spec, /^github:markup-carve\/carve-js#[0-9a-f]{40}$/)
})

# docusaurus-carve

A Docusaurus 3 docs plugin that makes `.crv` files first-class documentation
pages. It renders Carve through `@markup-carve/carve`, then delegates routing,
sidebars, frontmatter, search metadata, and theming to Docusaurus'
official content-docs plugin.

## Install

```bash
npm install @markup-carve/docusaurus-carve
```

## Configure

Disable the classic preset's docs instance and add this plugin in its place:

```js
import carveDocs from '@markup-carve/docusaurus-carve'

export default {
  plugins: [[carveDocs, {
    path: 'docs',
    routeBasePath: 'docs',
    sidebarPath: './sidebars.js',
  }]],
  presets: [['classic', { docs: false }]],
}
```

Both `.crv` and existing `.md`/`.mdx` documents can live in `docs/`. Carve
YAML, TOML, or JSON frontmatter is normalized to YAML so metadata such as
`title`, `slug`, `sidebar_position`, `tags`, and `draft` reaches the official
docs plugin.

The plugin creates a private Markdown mirror under Docusaurus' generated-files
directory. It never rewrites source documents. A `.crv` and `.md` with the same
relative stem are rejected because Docusaurus would assign both the same ID.

Carve parser/render options can be supplied as `carveOptions`. Other options
are passed to `@docusaurus/plugin-content-docs`.

```js
[carveDocs, {
  path: 'docs',
  carveOptions: { allowRawHtml: false },
  includes: true,
}]
```

The plugin expands `{{ path }}` directives by default. Paths resolve relative
to each document and cannot escape the configured docs directory. Set
`includes: false` to leave directives literal, or set `includeRoot` to another
absolute containment root.

A directive can take one named region of a file instead of the whole file. In
a Carve file the region sits between `%% #region intro` and `%% #endregion`. A
source file can be included as a code block, with region markers in its own
comment syntax (`// #region demo` ... `// #endregion`):

```text
{{ shared.crv @region:intro }}
{{ src/example.ts @region:demo @code:ts }}
```

## Warnings

Include problems and Markdown export losses are printed during the build, one
line each, with the rule id and the file, line and column. A loss is something
the generated Markdown no longer says, such as a link whose `javascript:`
destination was blanked. Set `lint: true` to also print the engine's lint
findings, such as a link to a fragment no heading defines:

```js
[carveDocs, { path: 'docs', lint: true }]
```

## Highlighting Carve samples

The plugin registers the Carve Prism grammar from
`@markup-carve/carve-grammars`, so a fenced block marked `carve` or `crv` is
highlighted by Docusaurus' code blocks with no theme changes. Set
`prism: false` to leave those fences plain, for example when the site
registers its own grammar. The site's own `prism-react-renderer` (a
Docusaurus 3 dependency) is used.

The plugin needs `@markup-carve/carve` 0.1.13 or later.

## Scope

This integration covers the current Docusaurus docs directory. It does not yet
convert versioned-doc snapshots, `.crv` blog posts, or standalone pages; those
use separate paths or content plugins with different metadata contracts. Carve
content is converted to Markdown before Docusaurus compiles it, so Docusaurus
owns heading extraction, table of contents, link handling, and React rendering.

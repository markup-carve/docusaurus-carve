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
}]
```

## Scope

This integration covers the current Docusaurus docs directory. It does not yet
convert versioned-doc snapshots, `.crv` blog posts, or standalone pages; those
use separate paths or content plugins with different metadata contracts. Carve
content is converted to Markdown before Docusaurus compiles it, so Docusaurus
owns heading extraction, table of contents, link handling, and React rendering.

## License

MIT

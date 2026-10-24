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

## HTML for what Markdown cannot say

Carve goes to Docusaurus as Markdown, and some constructs have no Markdown
form: a div or a paragraph with a class, a figure with a caption, an
admonition. By default they are flattened. Set `htmlBlocks: true` to render
those blocks as HTML instead and keep the rest as Markdown:

```js
[carveDocs, { path: 'docs', htmlBlocks: true }]
```

A top-level block stays Markdown when its Markdown, read back by Carve, renders
the same HTML; otherwise it is written as HTML inside a `div.carve-html`.
Headings always stay Markdown, so the table of contents, heading anchors and
links keep working. Two limits:

- A heading inside a block that becomes HTML (a heading in a div, say) is not
  in the table of contents.
- A block holding a footnote reference stays Markdown, because Docusaurus
  numbers the footnotes itself; the build reports it as `html-block-footnote`.
- A block holding a site-relative link or image (`other.md`, `./logo.png`,
  `/docs/x`) stays Markdown, because Docusaurus resolves those only in
  Markdown; reported as `html-block-relative-link`. Absolute URLs and `#`
  fragments are fine, so a captioned figure keeps its caption when its image
  is a full URL.

With the default `mdx` format the HTML is embedded through
`dangerouslySetInnerHTML`; with `markdown.format: 'md'` or `'detect'` it is a
raw HTML block. Either way it is Carve's own HTML, with the same `carveOptions`
(keep `allowRawHtml: false` for untrusted content). Docusaurus does not style
Carve's classes, so add CSS for the ones you use, such as
`.carve-html aside.admonition`.

## Highlighting Carve samples

The plugin registers the Carve Prism grammar from
`@markup-carve/carve-grammars`, so a fenced block marked `carve` or `crv` is
highlighted by Docusaurus' code blocks with no theme changes. Set
`prism: false` to leave those fences plain, for example when the site
registers its own grammar. The site's own `prism-react-renderer` (a
Docusaurus 3 dependency) is used.

The plugin needs `@markup-carve/carve` 0.1.14 or later.

## Scope

This integration covers the current Docusaurus docs directory. It does not yet
convert versioned-doc snapshots, `.crv` blog posts, or standalone pages; those
use separate paths or content plugins with different metadata contracts. Carve
content is converted to Markdown before Docusaurus compiles it, so Docusaurus
owns heading extraction, table of contents, link handling, and React rendering;
`htmlBlocks` only changes how the blocks Markdown cannot carry are written.

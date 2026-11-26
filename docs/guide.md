# docusaurus-carve guide

## Background

A Docusaurus 3 docs plugin that makes `.crv` files first-class documentation
pages. It renders Carve through `@markup-carve/carve`, then delegates routing,
sidebars, frontmatter, search metadata, and theming to Docusaurus'
official content-docs plugin.

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

The mirror follows the site's `markdown.format`. With the default `mdx`,
Docusaurus compiles every page as MDX, where `<` opens JSX and `{` opens an
expression, so the plugin escapes both in text and writes autolinks such as
`<https://example.com>` as `[https://example.com](https://example.com)`. With
`'md'` or `'detect'` the mirror is the plain CommonMark Carve writes.

Carve 0.2 options can be supplied as `carveOptions`. `extensions` and
`headingIds` go to the parse; every other key goes to the writers (the
Markdown writer and, with `htmlBlocks`, the HTML renderer), for example
`rawHtml`, `urlPolicy` or `smartTypography`. Other options are passed to
`@docusaurus/plugin-content-docs`.

```js
[carveDocs, {
  path: 'docs',
  carveOptions: { rawHtml: false },
  includes: true,
}]
```

0.1 option names are refused by the engine; `allowRawHtml` is now `rawHtml`,
and raw HTML is off unless it is set.

The plugin expands `{{ path }}` directives by default. Paths resolve relative
to each document and cannot escape the configured docs directory. Set
`includes: false` to leave directives literal, or set `includeRoot` to another
absolute containment root; a relative `includeRoot` is refused.

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
line each, with the rule id and the file, line and column. Include problems
carry the Carve 0.2 codes `include-not-found`, `include-outside-root` and
`include-unreadable`. A loss is something
the generated Markdown no longer says, such as a link whose `javascript:`
destination was blanked. Set `lint: true` to also print the engine's lint
findings, such as a link to a fragment no heading defines:

```js
[carveDocs, { path: 'docs', lint: true }]
```

Hints, advisory findings such as a thematic break not written `***`, are
skipped. Pass an object instead of `true` to print them, or to turn on lint
rules that are off by default:

```js
[carveDocs, { path: 'docs', lint: { hints: true, enabledRules: ['non-descriptive-link-text'] } }]
```

A loss or lint finding in an included file names that file, not the page that
includes it.

A first line of `---` with no closing `---` line opens frontmatter that runs to
the end of the file, so the page has no body. The engine reports it as
`unclosed-frontmatter`; to start a page with a thematic break, write `***`.

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
(leave `rawHtml` off for untrusted content). Docusaurus does not style
Carve's classes, so add CSS for the ones you use, such as
`.carve-html aside.admonition`.

## Highlighting Carve samples

The plugin registers the Carve Prism grammar from
`@markup-carve/carve-grammars`, so a fenced block marked `carve` or `crv` is
highlighted by Docusaurus' code blocks with no theme changes. Set
`prism: false` to leave those fences plain, for example when the site
registers its own grammar. The site's own `prism-react-renderer` (a
Docusaurus 3 dependency) is used.

## Carve 0.2

The `main` branch runs on the Carve 0.2 engine, pinned to a carve-js `main`
commit until 0.2 is published. The mirror is written with the
engine's Markdown writer from its `export` entry. An engine without that writer
makes conversion fail with a `MarkdownWriterUnavailableError`
(`code: 'writer-unavailable'`); the warnings found up to then are still
reported.

## Scope

This integration covers the current Docusaurus docs directory. It does not yet
convert versioned-doc snapshots, `.crv` blog posts, or standalone pages; those
use separate paths or content plugins with different metadata contracts. Carve
content is converted to Markdown before Docusaurus compiles it, so Docusaurus
owns heading extraction, table of contents, link handling, and React rendering;
`htmlBlocks` only changes how the blocks Markdown cannot carry are written.

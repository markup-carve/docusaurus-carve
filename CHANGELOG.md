# Changelog

## [0.1.2] - 2026-10-08

### Fixed

- The published bundle resolves its dependencies instead of inlining them. Only
  `@docusaurus/plugin-content-docs` was external, so the whole Carve engine,
  `smol-toml` and `yaml` were bundled into `dist/index.cjs` and frozen at
  publish time: a site rendered through that copy rather than the engine in its
  own `node_modules`, while npm installed a second, unused one alongside it. The
  published 0.1.1 bundle predates the render-loss work entirely, so no engine
  release since could reach a consumer without a release here. The tarball goes
  from 2.4 MB to 7.5 KB, and a packaging test reads the built artifact.

### Changed

- Tested against `@markup-carve/carve` 0.1.10. The declared range `^0.1.7`
  already resolved it, but the committed lockfile held 0.1.7, so CI had never
  run the engine a consumer installs.

## 0.1.1

- `{{ path }}` include directives now expand, resolved relative to each document
  and contained to the docs directory. `includes: false` leaves them literal,
  and `includeRoot` sets another absolute containment root (#8, #10).
- Requires `@markup-carve/carve` 0.1.7 (`^0.1.7`), the first release carrying
  contained include expansion (#12).

## 0.1.0

- Initial Docusaurus 3 docs integration with mixed Carve/Markdown support.
- `exports` names `./package.json`, so
  `require('@markup-carve/docusaurus-carve/package.json')` reads the installed
  version back (markup-carve/carve#1484).

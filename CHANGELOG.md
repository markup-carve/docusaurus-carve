# Changelog

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

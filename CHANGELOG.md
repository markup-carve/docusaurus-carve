# Changelog

## Unreleased

- `exports` now names `./package.json`, so
  `require('@markup-carve/docusaurus-carve/package.json')` reads the installed
  version back instead of throwing `ERR_PACKAGE_PATH_NOT_EXPORTED`
  (markup-carve/carve#1484).

## 0.1.0

- Initial Docusaurus 3 docs integration with mixed Carve/Markdown support.

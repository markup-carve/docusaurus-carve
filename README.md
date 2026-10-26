# docusaurus-carve

Docusaurus 3 docs plugin for `.crv` pages, using @markup-carve/carve 0.1.14 or later. It passes routing and metadata to the official docs plugin. Read the [Carve documentation](https://markup-carve.github.io/carve/) for the language syntax.

## Install

```sh
npm install @markup-carve/docusaurus-carve
```

## Usage

```js
import carveDocs from '@markup-carve/docusaurus-carve'

export default {
  plugins: [[carveDocs, { path: 'docs' }]],
  presets: [['classic', { docs: false }]],
}
```

## Documentation

- [Carve documentation](https://markup-carve.github.io/carve/)
- [Documentation index](docs/README.md)

## License

[MIT](LICENSE)

# docusaurus-carve

Docusaurus 3 docs plugin for `.crv` pages. The `next2` line targets the Carve 0.2 engine, pinned by commit until 0.2 is published; see [Carve 0.2](docs/guide.md#carve-02). It needs Node.js 20 or newer. It passes routing and metadata to the official docs plugin. Read the [Carve documentation](https://markup-carve.github.io/carve/) for the language syntax.

## Install

```sh
npm install @markup-carve/docusaurus-carve
```

## Usage

```js
import carveDocs from '@markup-carve/docusaurus-carve'

export default {
  plugins: [[carveDocs, { path: 'docs', sidebarPath: './sidebars.js' }]],
  presets: [['classic', { docs: false }]],
}
```

## Documentation

- [Carve documentation](https://markup-carve.github.io/carve/)
- [Documentation index](docs/README.md)

## License

[MIT](LICENSE)

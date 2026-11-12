import carveDocs from '../dist/index.cjs'

export default {
  title: 'Carve Docusaurus example',
  url: 'https://example.com',
  baseUrl: '/',
  onBrokenLinks: 'throw',
  plugins: [[carveDocs, { path: 'docs', routeBasePath: '/', sidebarPath: './sidebars.js', htmlBlocks: true }],
    // The README configuration: default options, default MDX format.
    [carveDocs, { id: 'plain', path: 'plain', routeBasePath: 'plain' }],
  ],
  presets: [['@docusaurus/preset-classic', { docs: false, blog: false }]],
}

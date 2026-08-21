import carveDocs from '../dist/index.cjs'

export default {
  title: 'Carve Docusaurus example',
  url: 'https://example.com',
  baseUrl: '/',
  onBrokenLinks: 'throw',
  plugins: [[carveDocs, { path: 'docs', routeBasePath: '/', sidebarPath: './sidebars.js' }]],
  presets: [['@docusaurus/preset-classic', { docs: false, blog: false }]],
}

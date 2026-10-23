// Registers the Carve grammar on the Prism instance Docusaurus highlights with,
// so `carve` and `crv` fences are colored. The grammar reads a global Prism.
const { Prism } = require('prism-react-renderer')

const previous = globalThis.Prism
globalThis.Prism = Prism
require('@markup-carve/carve-grammars/prism/carve.js')
globalThis.Prism = previous

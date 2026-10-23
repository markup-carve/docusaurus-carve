import * as contentDocsModule from '@docusaurus/plugin-content-docs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { formatWarning, prepareDocs } from './prepare.mjs'

// src/ and the bundled dist/ both sit one level below the package root.
const packageRoot = path.resolve(typeof __dirname === 'string' ? __dirname : path.dirname(fileURLToPath(import.meta.url)), '..')
export const prismClientModule = path.join(packageRoot, 'client', 'prism-carve.js')

export function validateOptions(args) {
  const { carveOptions, includes, includeRoot, lint, prism, ...docsOptions } = args.options
  const validated = contentDocsModule.validateOptions({ ...args, options: docsOptions })
  return { ...validated, carveOptions, includes, includeRoot, lint, prism }
}

/**
 * A thin wrapper around Docusaurus' official docs plugin. Carve sources are
 * converted to Markdown in generatedFilesDir before the official plugin loads
 * them, retaining its routes, sidebars, versioning, search metadata and theme.
 */
export default async function docusaurusCarve(context, options = {}) {
  const sourcePath = path.resolve(context.siteDir, options.path ?? 'docs')
  const mirrorPath = path.join(context.generatedFilesDir, 'docusaurus-carve', options.id ?? 'default')
  const carveOptions = options.carveOptions ?? {}
  const includeOptions = {
    lint: options.lint,
    includes: options.includes,
    includeRoot: options.includeRoot ? path.resolve(context.siteDir, options.includeRoot) : undefined,
  }
  const docsOptions = { ...options, path: mirrorPath }
  delete docsOptions.carveOptions
  delete docsOptions.includes
  delete docsOptions.includeRoot
  delete docsOptions.lint
  delete docsOptions.prism

  const prepare = async () => {
    const result = await prepareDocs(sourcePath, mirrorPath, { carveOptions, ...includeOptions })
    for (const warning of result.warnings) console.warn(`docusaurus-carve: ${formatWarning(warning, context.siteDir)}`)
    return result
  }
  await prepare()
  const contentDocs = typeof contentDocsModule.default === 'function'
    ? contentDocsModule.default
    : contentDocsModule.default.default
  const docsPlugin = await contentDocs(context, docsOptions)
  const originalLoadContent = docsPlugin.loadContent?.bind(docsPlugin)
  const originalWatchPaths = docsPlugin.getPathsToWatch?.bind(docsPlugin)

  return {
    ...docsPlugin,
    async loadContent() {
      await prepare()
      return originalLoadContent?.()
    },
    getClientModules() {
      const own = options.prism === false ? [] : [prismClientModule]
      return [...(docsPlugin.getClientModules?.() ?? []), ...own]
    },
    getPathsToWatch() {
      const own = path.join(sourcePath, '**', '*.{crv,md,mdx,json,yml,yaml}')
      return [own, ...(originalWatchPaths?.() ?? [])]
    },
  }
}

export { convertCarve, formatWarning, prepareDocs } from './prepare.mjs'

import * as contentDocsModule from '@docusaurus/plugin-content-docs'
import path from 'node:path'
import { prepareDocs } from './prepare.mjs'

export function validateOptions(args) {
  const { carveOptions, includes, includeRoot, ...docsOptions } = args.options
  const validated = contentDocsModule.validateOptions({ ...args, options: docsOptions })
  return { ...validated, carveOptions, includes, includeRoot }
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
    includes: options.includes,
    includeRoot: options.includeRoot ? path.resolve(context.siteDir, options.includeRoot) : undefined,
  }
  const docsOptions = { ...options, path: mirrorPath }
  delete docsOptions.carveOptions
  delete docsOptions.includes
  delete docsOptions.includeRoot

  const prepare = async () => {
    const result = await prepareDocs(sourcePath, mirrorPath, { carveOptions, ...includeOptions })
    for (const warning of result.warnings) console.warn(`docusaurus-carve: ${warning.message}`)
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
    getPathsToWatch() {
      const own = path.join(sourcePath, '**', '*.{crv,md,mdx,json,yml,yaml}')
      return [own, ...(originalWatchPaths?.() ?? [])]
    },
  }
}

export { convertCarve, prepareDocs } from './prepare.mjs'

import { getMemoryBaseDir, deriveProjectKey, resolveProjectDir } from './paths.js'
import { openDatabase, closeDatabase } from './db.js'
import { createHandlers } from './handlers.js'
import { exportToJsonl, appendToMarkdown, getMarkdownPath } from './export.js'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type {
  InitMemoryOptions,
  MemoryClient,
  WriteMemoryParams,
  ExportMemoryParams,
  ExportResult,
} from './types.js'

// Re-export everything consumers need
export * from './types.js'
export * from './tools.js'
export { deriveProjectKey, getMemoryBaseDir } from './paths.js'

export async function initMemory(options: InitMemoryOptions): Promise<MemoryClient> {
  const {
    projectKey,
    pluginId,
    baseDir: baseDirOverride,
    markdownExport = false,
    maxContentBytes = 8192,
  } = options

  const baseDir = getMemoryBaseDir(baseDirOverride)
  const projectDir = resolveProjectDir(projectKey, baseDir)
  const exportsDir = join(projectDir, 'exports')

  mkdirSync(exportsDir, { recursive: true, mode: 0o700 })

  const { db } = openDatabase(projectDir)
  const handlers = createHandlers(db, { projectKey, pluginId, maxContentBytes })

  const client: MemoryClient = {
    readMemory: handlers.readMemory,
    searchMemory: handlers.searchMemory,
    updateMemory: handlers.updateMemory,
    forgetMemory: handlers.forgetMemory,
    listMemoryScopes: handlers.listMemoryScopes,
    rebuildIndex: handlers.rebuildIndex,

    writeMemory(params: WriteMemoryParams) {
      const result = handlers.writeMemory(params)

      if (markdownExport) {
        const mdPath = getMarkdownPath(exportsDir, params.type)
        // Non-fatal: Markdown export failure must never break the write
        appendToMarkdown({
          filePath: mdPath,
          type: params.type,
          content: params.content,
          tags: params.tags ?? [],
          timestamp: result.timestamp,
        }).catch(err => {
          console.error('[remambrance] Markdown export failed:', err)
        })
      }

      return result
    },

    async exportMemory(params?: ExportMemoryParams): Promise<ExportResult> {
      const outputPath = params?.outputPath ?? join(exportsDir, 'memory-export.jsonl')
      return exportToJsonl(db, {
        outputPath,
        scope: params?.scope as string | undefined,
        projectKey,
      })
    },

    close() {
      closeDatabase(db)
    },
  }

  return client
}

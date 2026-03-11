import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { initMemory, deriveProjectKey, MEMORY_TOOLS } from './index.js'
import { cwd } from 'node:process'

async function main() {
  const projectKey =
    process.env.PLUGIN_MEMORY_PROJECT_KEY ?? deriveProjectKey(cwd())
  const pluginId = process.env.PLUGIN_MEMORY_PLUGIN_ID ?? 'core'
  const baseDir = process.env.PLUGIN_MEMORY_BASE_DIR

  const memory = await initMemory({ projectKey, pluginId, baseDir, markdownExport: true })

  const server = new Server(
    { name: 'plugin-memory', version: '1.0.0' },
    { capabilities: { tools: {} } }
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [...MEMORY_TOOLS],
  }))

  server.setRequestHandler(CallToolRequestSchema, async request => {
    const { name, arguments: args = {} } = request.params
    try {
      let result: unknown

      switch (name) {
        case 'read_memory':
          result = memory.readMemory(args as unknown as Parameters<typeof memory.readMemory>[0])
          break
        case 'write_memory':
          result = memory.writeMemory(args as unknown as Parameters<typeof memory.writeMemory>[0])
          break
        case 'search_memory':
          result = memory.searchMemory(args as unknown as Parameters<typeof memory.searchMemory>[0])
          break
        case 'update_memory':
          result = memory.updateMemory(args as unknown as Parameters<typeof memory.updateMemory>[0])
          break
        case 'forget_memory':
          result = memory.forgetMemory(args as unknown as Parameters<typeof memory.forgetMemory>[0])
          break
        case 'list_memory_scopes':
          result = memory.listMemoryScopes(args as unknown as Parameters<typeof memory.listMemoryScopes>[0])
          break
        case 'rebuild_index':
          result = memory.rebuildIndex()
          break
        case 'export_memory':
          result = await memory.exportMemory(args as unknown as Parameters<typeof memory.exportMemory>[0])
          break
        default:
          throw new Error(`Unknown tool: ${name}`)
      }

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      }
    } catch (error) {
      return {
        content: [{ type: 'text' as const, text: `Error: ${(error as Error).message}` }],
        isError: true,
      }
    }
  })

  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch(console.error)

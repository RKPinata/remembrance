// Scope hierarchy: user → project → plugin:X
export type Scope = 'user' | 'project' | `plugin:${string}`

export type EntryType =
  | 'decision'
  | 'adr'
  | 'pattern'
  | 'convention'
  | 'preference'
  | 'summary'
  | 'glossary'
  | 'state'
  | 'constraint'

export interface MemoryEntry {
  id: string
  scope: Scope
  pluginId: string | null
  projectKey: string
  type: EntryType
  content: string
  tags: string[]           // stored as JSON in SQLite
  source: string | null
  confidence: number       // 0.0–1.0
  verified: boolean
  deleted: boolean
  history: string[]        // prior content versions (JSON array)
  data: Record<string, unknown>  // plugin-specific payload
  createdAt: string        // ISO 8601
  updatedAt: string        // ISO 8601
}

export interface WriteMemoryParams {
  scope: Scope
  type: EntryType
  content: string
  tags?: string[]
  source?: string
  confidence?: number
  verified?: boolean
  data?: Record<string, unknown>
}

export interface ReadMemoryParams {
  scope: Scope
  type?: EntryType
  tags?: string[]
  limit?: number
  projectKey?: string
}

export interface SearchMemoryParams {
  query: string
  scope?: Scope
  type?: EntryType
  limit?: number
}

export interface UpdateMemoryParams {
  id: string
  content?: string
  tags?: string[]
  confidence?: number
  verified?: boolean
}

export interface ForgetMemoryParams {
  id: string
}

export interface ListMemoryScopesParams {
  projectKey?: string
}

export interface ExportMemoryParams {
  outputPath?: string
  scope?: Scope
}

export interface ScopeInfo {
  scope: Scope
  entryCount: number
  lastUpdated: string
}

export interface WriteResult {
  id: string
  timestamp: string
}

export interface UpdateResult {
  id: string
  updatedAt: string
}

export interface ForgetResult {
  deleted: true
}

export interface RebuildResult {
  entriesIndexed: number
}

export interface ExportResult {
  exportedPath: string
  entryCount: number
}

// Raw SQLite row shape (all integers, no booleans, JSON as strings)
export interface RawEntry {
  id: string
  scope: string
  plugin_id: string | null
  project_key: string
  type: string
  content: string
  tags: string
  source: string | null
  confidence: number
  verified: number
  deleted: number
  history: string
  data: string
  created_at: string
  updated_at: string
}

export interface InitMemoryOptions {
  projectKey: string
  pluginId: string
  baseDir?: string        // override platform default
  markdownExport?: boolean
  maxContentBytes?: number
}

export interface MemoryClient {
  readMemory(params: ReadMemoryParams): MemoryEntry[]
  writeMemory(params: WriteMemoryParams): WriteResult
  searchMemory(params: SearchMemoryParams): (MemoryEntry & { snippet: string })[]
  updateMemory(params: UpdateMemoryParams): UpdateResult
  forgetMemory(params: ForgetMemoryParams): ForgetResult
  listMemoryScopes(params?: ListMemoryScopesParams): ScopeInfo[]
  rebuildIndex(): RebuildResult
  exportMemory(params?: ExportMemoryParams): Promise<ExportResult>
  close(): void
}

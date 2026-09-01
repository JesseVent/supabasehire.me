import { create } from 'zustand'
import type { StateStorage } from 'zustand/middleware'
import { createJSONStorage, persist } from 'zustand/middleware'
import type {
  ActivePanel,
  EdgeFunction,
  LogEntry,
  LogService,
  RLSTestResult,
  SQLQueryResult,
  SupabaseConnection,
  TableRLSInfo,
  TableSchema,
  UserSession,
} from '@/lib/supabase-types'

// ─── Schema Snapshot Types ───

export interface SchemaSnapshot {
  id: string
  name: string
  timestamp: string
  tables: TableSchema[]
  rlsStatuses: TableRLSInfo[]
  connectionId: string
  connectionName: string
}

// ─── Activity Log Types ───

export type ActivityType = 'connection' | 'schema' | 'rls' | 'sql' | 'function'

export interface ActivityLogEntry {
  id: string
  type: ActivityType
  action: string
  timestamp: string
  details?: string
}

// ─── Migration Types ───

export interface MigrationRecord {
  id: string
  name: string
  sql: string
  status: 'success' | 'failed' | 'pending'
  appliedAt: string
  connectionId: string
  error?: string
}

// ─── Latency Types ───

export interface LatencyRecord {
  id: string
  timestamp: string
  duration: number
  status: 'good' | 'warning' | 'critical'
}

interface SupabaseStore {
  // Connection state
  connections: SupabaseConnection[]
  activeConnectionId: string | null

  // Schema state
  tables: TableSchema[]
  rlsStatuses: TableRLSInfo[]
  edgeFunctions: EdgeFunction[]

  // UI state
  activePanel: ActivePanel
  selectedTable: string | null
  isLoading: boolean
  error: string | null

  // Test results
  rlsTestResults: RLSTestResult[]
  sqlResults: SQLQueryResult[]

  // SQL Editor content (shared between panels)
  sqlEditorContent: string

  // SQL Query History
  sqlHistory: string[]

  // Keyboard shortcuts dialog
  showShortcutsDialog: boolean

  // Activity log
  activityLog: ActivityLogEntry[]

  // Schema snapshots
  schemaSnapshots: SchemaSnapshot[]

  // Migration history
  migrationHistory: MigrationRecord[]

  // Latency history
  latencyHistory: LatencyRecord[]

  // Edge function notes (local schema annotations), keyed by "connectionId:functionName"
  functionNotes: Record<string, string>

  // Auth sessions — keyed by connectionId; transient (not persisted)
  sessions: Record<string, UserSession | null>

  // Logs — transient (not persisted)
  logs: LogEntry[]
  logsLoading: boolean
  logsError: string | null
  logsService: LogService
  logsStartTime: string
  logsEndTime: string
  logsSearch: string

  // Actions
  setConnections: (connections: SupabaseConnection[]) => void
  addConnection: (connection: SupabaseConnection) => void
  updateConnection: (id: string, updates: Partial<SupabaseConnection>) => void
  removeConnection: (id: string) => void
  setActiveConnectionId: (id: string | null) => void
  /** True once the user has opened any connection. Gates the extension's silent auto-connect. */
  hasOnboarded: boolean
  setTables: (tables: TableSchema[]) => void
  setRlsStatuses: (statuses: TableRLSInfo[]) => void
  setEdgeFunctions: (functions: EdgeFunction[]) => void
  setActivePanel: (panel: ActivePanel) => void
  setSelectedTable: (table: string | null) => void
  setIsLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  addRlsTestResult: (result: RLSTestResult) => void
  clearRlsTestResults: () => void
  addSqlResult: (result: SQLQueryResult) => void
  clearSqlResults: () => void
  setSqlEditorContent: (content: string) => void
  addSqlToHistory: (query: string) => void
  clearSqlHistory: () => void
  setShowShortcutsDialog: (show: boolean) => void
  addActivityLog: (entry: Omit<ActivityLogEntry, 'id' | 'timestamp'>) => void
  addSnapshot: (snapshot: Omit<SchemaSnapshot, 'id' | 'timestamp'>) => void
  deleteSnapshot: (id: string) => void
  addMigration: (migration: Omit<MigrationRecord, 'id' | 'appliedAt'>) => void
  clearMigrationHistory: () => void
  addLatencyRecord: (record: Omit<LatencyRecord, 'id'>) => void
  clearLatencyHistory: () => void
  setFunctionNotes: (key: string, notes: string) => void
  setSession: (connectionId: string, session: UserSession | null) => void
  setLogs: (logs: LogEntry[]) => void
  setLogsLoading: (loading: boolean) => void
  setLogsError: (error: string | null) => void
  setLogsFilter: (
    filter: Partial<
      Pick<SupabaseStore, 'logsService' | 'logsStartTime' | 'logsEndTime' | 'logsSearch'>
    >
  ) => void
  clearLogs: () => void
  reset: () => void
}

const initialState = {
  connections: [] as SupabaseConnection[],
  activeConnectionId: null as string | null,
  tables: [] as TableSchema[],
  rlsStatuses: [] as TableRLSInfo[],
  edgeFunctions: [] as EdgeFunction[],
  activePanel: 'dashboard' as ActivePanel,
  selectedTable: null as string | null,
  isLoading: false,
  error: null as string | null,
  rlsTestResults: [] as RLSTestResult[],
  sqlResults: [] as SQLQueryResult[],
  sqlEditorContent: '' as string,
  sqlHistory: [] as string[],
  showShortcutsDialog: false as boolean,
  activityLog: [] as ActivityLogEntry[],
  schemaSnapshots: [] as SchemaSnapshot[],
  migrationHistory: [] as MigrationRecord[],
  latencyHistory: [] as LatencyRecord[],
  functionNotes: {} as Record<string, string>,
  sessions: {} as Record<string, UserSession | null>,
  logs: [] as LogEntry[],
  logsLoading: false,
  logsError: null as string | null,
  hasOnboarded: false,
  logsService: 'all' as LogService,
  logsStartTime: '',
  logsEndTime: '',
  logsSearch: '',
}

// Credentials (connections) live in sessionStorage — cleared on tab close.
// Non-sensitive UI state (active panel, SQL history, snapshots, etc.) lives in localStorage.
// The extension vault path further prevents credentials from hitting any storage at all.
const splitStorage: StateStorage = {
  getItem: (name) => {
    if (typeof window === 'undefined') return null
    const localRaw = localStorage.getItem(name)
    const sessionRaw = sessionStorage.getItem(`${name}-credentials`)
    if (!localRaw && !sessionRaw) return null
    const local = localRaw ? JSON.parse(localRaw) : { state: {}, version: 0 }
    const session = sessionRaw ? JSON.parse(sessionRaw) : null
    return JSON.stringify({
      ...local,
      state: {
        ...local.state,
        ...(session?.state ?? {}),
      },
    })
  },
  setItem: (name, value) => {
    if (typeof window === 'undefined') return
    const parsed = JSON.parse(value) as { state: Record<string, unknown>; version: number }
    const { connections, activeConnectionId, ...uiState } = parsed.state
    sessionStorage.setItem(
      `${name}-credentials`,
      JSON.stringify({ state: { connections, activeConnectionId }, version: parsed.version })
    )
    localStorage.setItem(name, JSON.stringify({ ...parsed, state: uiState }))
  },
  removeItem: (name) => {
    if (typeof window === 'undefined') return
    localStorage.removeItem(name)
    sessionStorage.removeItem(`${name}-credentials`)
  },
}

export const useSupabaseStore = create<SupabaseStore>()(
  persist(
    (set) => ({
      ...initialState,

      // Connection actions
      setConnections: (connections) => set({ connections }),

      addConnection: (connection) =>
        set((state) => ({
          connections: [...state.connections, connection],
        })),

      updateConnection: (id, updates) =>
        set((state) => ({
          connections: state.connections.map((c) =>
            c.id === id ? { ...c, ...updates, updatedAt: new Date().toISOString() } : c
          ),
        })),

      removeConnection: (id) =>
        set((state) => ({
          connections: state.connections.filter((c) => c.id !== id),
          activeConnectionId: state.activeConnectionId === id ? null : state.activeConnectionId,
        })),

      setActiveConnectionId: (id) =>
        set(id ? { activeConnectionId: id, hasOnboarded: true } : { activeConnectionId: id }),

      // Schema actions
      setTables: (tables) => set({ tables }),
      setRlsStatuses: (statuses) => set({ rlsStatuses: statuses }),
      setEdgeFunctions: (functions) => set({ edgeFunctions: functions }),

      // UI actions
      setActivePanel: (panel) => set({ activePanel: panel }),
      setSelectedTable: (table) => set({ selectedTable: table }),
      setIsLoading: (loading) => set({ isLoading: loading }),
      setError: (error) => set({ error }),

      // Test result actions
      addRlsTestResult: (result) =>
        set((state) => ({
          rlsTestResults: [...state.rlsTestResults, result],
        })),

      clearRlsTestResults: () => set({ rlsTestResults: [] }),

      addSqlResult: (result) =>
        set((state) => ({
          sqlResults: [...state.sqlResults, result],
        })),

      clearSqlResults: () => set({ sqlResults: [] }),

      setSqlEditorContent: (content) => set({ sqlEditorContent: content }),

      addSqlToHistory: (query) =>
        set((state) => ({
          sqlHistory: [query, ...state.sqlHistory.filter((q) => q !== query)].slice(0, 10),
        })),

      clearSqlHistory: () => set({ sqlHistory: [] }),

      // Shortcuts dialog
      setShowShortcutsDialog: (show) => set({ showShortcutsDialog: show }),

      // Activity log
      addActivityLog: (entry) =>
        set((state) => ({
          activityLog: [
            {
              ...entry,
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
              timestamp: new Date().toISOString(),
            },
            ...state.activityLog,
          ].slice(0, 50),
        })),

      // Schema snapshots
      addSnapshot: (snapshot) =>
        set((state) => ({
          schemaSnapshots: [
            {
              ...snapshot,
              id: `snap-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
              timestamp: new Date().toISOString(),
            },
            ...state.schemaSnapshots,
          ],
        })),

      deleteSnapshot: (id) =>
        set((state) => ({
          schemaSnapshots: state.schemaSnapshots.filter((s) => s.id !== id),
        })),

      // Migration history
      addMigration: (migration) =>
        set((state) => ({
          migrationHistory: [
            {
              ...migration,
              id: `mig-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
              appliedAt: new Date().toISOString(),
            },
            ...state.migrationHistory,
          ],
        })),

      clearMigrationHistory: () => set({ migrationHistory: [] }),

      // Latency history
      addLatencyRecord: (record) =>
        set((state) => ({
          latencyHistory: [
            {
              ...record,
              id: `lat-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            },
            ...state.latencyHistory,
          ].slice(0, 50),
        })),

      clearLatencyHistory: () => set({ latencyHistory: [] }),

      // Function notes
      setFunctionNotes: (key, notes) =>
        set((state) => ({
          functionNotes: { ...state.functionNotes, [key]: notes },
        })),

      // Auth sessions (transient)
      setSession: (connectionId, session) =>
        set((state) => ({
          sessions: { ...state.sessions, [connectionId]: session },
        })),

      // Logs (transient)
      setLogs: (logs) => set({ logs }),
      setLogsLoading: (logsLoading) => set({ logsLoading }),
      setLogsError: (logsError) => set({ logsError }),
      setLogsFilter: (filter) => set(filter),
      clearLogs: () =>
        set({
          logs: [],
          logsError: null,
          logsSearch: '',
        }),

      // Reset
      reset: () => set(initialState),
    }),
    {
      name: 'supabase-debug-storage',
      storage: createJSONStorage(() => splitStorage),
      partialize: (state) => ({
        // Extension-sourced connections are never persisted — they live in memory only.
        connections: state.connections.filter((c) => c.source !== 'extension'),
        activeConnectionId: state.activeConnectionId,
        hasOnboarded: state.hasOnboarded,
        activePanel: state.activePanel,
        sqlEditorContent: state.sqlEditorContent,
        sqlHistory: state.sqlHistory,
        activityLog: state.activityLog,
        schemaSnapshots: state.schemaSnapshots,
        migrationHistory: state.migrationHistory,
        latencyHistory: state.latencyHistory,
        functionNotes: state.functionNotes,
      }),
    }
  )
)

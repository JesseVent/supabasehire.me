import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  ActivePanel,
  EdgeFunction,
  RLSTestResult,
  SQLQueryResult,
  SupabaseConnection,
  TableRLSInfo,
  TableSchema,
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

  // Actions
  setConnections: (connections: SupabaseConnection[]) => void
  addConnection: (connection: SupabaseConnection) => void
  updateConnection: (id: string, updates: Partial<SupabaseConnection>) => void
  removeConnection: (id: string) => void
  setActiveConnectionId: (id: string | null) => void
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

      setActiveConnectionId: (id) => set({ activeConnectionId: id }),

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

      // Reset
      reset: () => set(initialState),
    }),
    {
      name: 'supabase-debug-storage',
      partialize: (state) => ({
        connections: state.connections,
        activeConnectionId: state.activeConnectionId,
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

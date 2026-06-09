'use client'

import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertTriangle,
  ArrowRight,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Columns3,
  Database,
  FileText,
  GitCompare,
  Link2,
  MinusCircle,
  Plus,
  PlusCircle,
  Shield,
  ShieldAlert,
  ShieldCheck,
  TableIcon,
  Trash2,
} from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { DEMO_CONNECTION_ID } from '@/lib/demo-data'
import type { ColumnInfo, ForeignKeyInfo, TableRLSInfo, TableSchema } from '@/lib/supabase-types'
import { type SchemaSnapshot, useSupabaseStore } from '@/store/supabase-store'

// ─── Diff Types ───

type DiffStatus = 'added' | 'removed' | 'modified' | 'unchanged'

interface ColumnDiff {
  columnName: string
  status: DiffStatus
  oldColumn?: ColumnInfo
  newColumn?: ColumnInfo
  changes?: string[]
}

interface TableDiff {
  tableName: string
  status: DiffStatus
  oldTable?: TableSchema
  newTable?: TableSchema
  oldRLS?: TableRLSInfo
  newRLS?: TableRLSInfo
  columnDiffs: ColumnDiff[]
  rlsChanged: boolean
  fkChanges: string[]
}

interface DiffResult {
  tables: TableDiff[]
  addedCount: number
  removedCount: number
  modifiedCount: number
  unchangedCount: number
}

// ─── Diff Logic ───

function computeDiff(left: SchemaSnapshot, right: SchemaSnapshot): DiffResult {
  const leftTableMap = new Map(left.tables.map((t) => [t.tableName, t]))
  const rightTableMap = new Map(right.tables.map((t) => [t.tableName, t]))
  const leftRLSMap = new Map(left.rlsStatuses.map((r) => [r.tableName, r]))
  const rightRLSMap = new Map(right.rlsStatuses.map((r) => [r.tableName, r]))

  const allTableNames = new Set([...leftTableMap.keys(), ...rightTableMap.keys()])
  const tables: TableDiff[] = []

  for (const tableName of allTableNames) {
    const inLeft = leftTableMap.has(tableName)
    const inRight = rightTableMap.has(tableName)

    if (inLeft && !inRight) {
      // Removed table
      tables.push({
        tableName,
        status: 'removed',
        oldTable: leftTableMap.get(tableName),
        oldRLS: leftRLSMap.get(tableName),
        columnDiffs: (leftTableMap.get(tableName)?.columns ?? []).map((col) => ({
          columnName: col.column_name,
          status: 'removed',
          oldColumn: col,
        })),
        rlsChanged: false,
        fkChanges: [],
      })
    } else if (!inLeft && inRight) {
      // Added table
      tables.push({
        tableName,
        status: 'added',
        newTable: rightTableMap.get(tableName),
        newRLS: rightRLSMap.get(tableName),
        columnDiffs: (rightTableMap.get(tableName)?.columns ?? []).map((col) => ({
          columnName: col.column_name,
          status: 'added',
          newColumn: col,
        })),
        rlsChanged: false,
        fkChanges: [],
      })
    } else {
      // Table exists in both - check for modifications
      const oldTable = leftTableMap.get(tableName)!
      const newTable = rightTableMap.get(tableName)!
      const oldRLS = leftRLSMap.get(tableName)
      const newRLS = rightRLSMap.get(tableName)

      const columnDiffs = computeColumnDiffs(oldTable.columns, newTable.columns)
      const rlsChanged = (oldRLS?.rlsEnabled ?? false) !== (newRLS?.rlsEnabled ?? false)
      const fkChanges = computeFKChanges(oldTable.foreignKeys, newTable.foreignKeys)

      const hasChanges =
        columnDiffs.some((d) => d.status !== 'unchanged') || rlsChanged || fkChanges.length > 0

      tables.push({
        tableName,
        status: hasChanges ? 'modified' : 'unchanged',
        oldTable,
        newTable,
        oldRLS,
        newRLS,
        columnDiffs,
        rlsChanged,
        fkChanges,
      })
    }
  }

  // Sort: added first, then removed, then modified, then unchanged
  const statusOrder: Record<DiffStatus, number> = {
    added: 0,
    removed: 1,
    modified: 2,
    unchanged: 3,
  }
  tables.sort((a, b) => statusOrder[a.status] - statusOrder[b.status])

  return {
    tables,
    addedCount: tables.filter((t) => t.status === 'added').length,
    removedCount: tables.filter((t) => t.status === 'removed').length,
    modifiedCount: tables.filter((t) => t.status === 'modified').length,
    unchangedCount: tables.filter((t) => t.status === 'unchanged').length,
  }
}

function computeColumnDiffs(oldCols: ColumnInfo[], newCols: ColumnInfo[]): ColumnDiff[] {
  const oldMap = new Map(oldCols.map((c) => [c.column_name, c]))
  const newMap = new Map(newCols.map((c) => [c.column_name, c]))
  const allNames = new Set([...oldMap.keys(), ...newMap.keys()])
  const diffs: ColumnDiff[] = []

  for (const name of allNames) {
    const inOld = oldMap.has(name)
    const inNew = newMap.has(name)

    if (inOld && !inNew) {
      diffs.push({ columnName: name, status: 'removed', oldColumn: oldMap.get(name) })
    } else if (!inOld && inNew) {
      diffs.push({ columnName: name, status: 'added', newColumn: newMap.get(name) })
    } else {
      const oldCol = oldMap.get(name)!
      const newCol = newMap.get(name)!
      const changes: string[] = []

      if (oldCol.data_type !== newCol.data_type)
        changes.push(`type: ${oldCol.data_type} → ${newCol.data_type}`)
      if (oldCol.is_nullable !== newCol.is_nullable)
        changes.push(`nullable: ${oldCol.is_nullable} → ${newCol.is_nullable}`)
      if (oldCol.column_default !== newCol.column_default)
        changes.push(
          `default: ${oldCol.column_default ?? 'none'} → ${newCol.column_default ?? 'none'}`
        )

      diffs.push({
        columnName: name,
        status: changes.length > 0 ? 'modified' : 'unchanged',
        oldColumn: oldCol,
        newColumn: newCol,
        changes,
      })
    }
  }

  return diffs
}

function computeFKChanges(oldFKs: ForeignKeyInfo[], newFKs: ForeignKeyInfo[]): string[] {
  const changes: string[] = []
  const oldSet = new Set(
    oldFKs.map((fk) => `${fk.column_name}->${fk.foreign_table_name}.${fk.foreign_column_name}`)
  )
  const newSet = new Set(
    newFKs.map((fk) => `${fk.column_name}->${fk.foreign_table_name}.${fk.foreign_column_name}`)
  )

  for (const fk of newSet) {
    if (!oldSet.has(fk)) changes.push(`FK added: ${fk}`)
  }
  for (const fk of oldSet) {
    if (!newSet.has(fk)) changes.push(`FK removed: ${fk}`)
  }

  return changes
}

// ─── Format Helpers ───

function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function getColumnTypeColor(type: string): string {
  switch (type) {
    case 'uuid':
      return 'bg-primary/15 text-primary dark:bg-primary/40 dark:text-primary'
    case 'text':
    case 'character varying':
    case 'varchar':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400'
    case 'timestamptz':
    case 'timestamp':
    case 'date':
    case 'time':
    case 'timetz':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400'
    case 'boolean':
    case 'bool':
      return 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400'
    case 'integer':
    case 'bigint':
    case 'numeric':
    case 'smallint':
    case 'real':
    case 'double precision':
      return 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-400'
    case 'jsonb':
    case 'json':
      return 'bg-pink-100 text-pink-700 dark:bg-pink-950/40 dark:text-pink-400'
    default:
      return 'bg-muted text-muted-foreground'
  }
}

// ─── Main Component ───

export function SchemaSnapshotPanel() {
  const {
    tables,
    rlsStatuses,
    activeConnectionId,
    connections,
    schemaSnapshots,
    addSnapshot,
    deleteSnapshot,
    addActivityLog,
  } = useSupabaseStore()

  const activeConnection = connections.find((c) => c.id === activeConnectionId)
  const isDemoMode = activeConnectionId === DEMO_CONNECTION_ID

  // Filter snapshots for current connection
  const connectionSnapshots = useMemo(
    () => schemaSnapshots.filter((s) => s.connectionId === activeConnectionId),
    [schemaSnapshots, activeConnectionId]
  )

  // Tabs
  const [activeTab, setActiveTab] = useState<'snapshots' | 'compare'>('snapshots')

  // Take snapshot dialog
  const [showSnapshotDialog, setShowSnapshotDialog] = useState(false)
  const [snapshotName, setSnapshotName] = useState('')

  // Delete dialog
  const [deleteTarget, setDeleteTarget] = useState<SchemaSnapshot | null>(null)

  // Compare
  const [leftSnapshotId, setLeftSnapshotId] = useState<string>('')
  const [rightSnapshotId, setRightSnapshotId] = useState<string>('')

  // Expanded rows
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set())

  const toggleTable = useCallback((tableName: string) => {
    setExpandedTables((prev) => {
      const next = new Set(prev)
      if (next.has(tableName)) next.delete(tableName)
      else next.add(tableName)
      return next
    })
  }, [])

  // Take snapshot
  const handleTakeSnapshot = useCallback(() => {
    if (!activeConnectionId || !activeConnection) return

    const now = new Date()
    const pad = (n: number) => n.toString().padStart(2, '0')
    const autoName = `Snapshot ${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`

    addSnapshot({
      name: snapshotName.trim() || autoName,
      tables: JSON.parse(JSON.stringify(tables)),
      rlsStatuses: JSON.parse(JSON.stringify(rlsStatuses)),
      connectionId: activeConnectionId,
      connectionName: activeConnection.name,
    })

    addActivityLog({
      type: 'schema',
      action: 'Snapshot taken',
      details: snapshotName.trim() || autoName,
    })

    toast.success('Snapshot saved', { description: snapshotName.trim() || autoName })
    setSnapshotName('')
    setShowSnapshotDialog(false)
  }, [
    activeConnectionId,
    activeConnection,
    tables,
    rlsStatuses,
    snapshotName,
    addSnapshot,
    addActivityLog,
  ])

  // Delete snapshot
  const handleDeleteSnapshot = useCallback(() => {
    if (!deleteTarget) return
    deleteSnapshot(deleteTarget.id)
    addActivityLog({ type: 'schema', action: 'Snapshot deleted', details: deleteTarget.name })
    toast.info('Snapshot deleted', { description: deleteTarget.name })
    setDeleteTarget(null)
  }, [deleteTarget, deleteSnapshot, addActivityLog])

  // Diff result
  const diffResult = useMemo(() => {
    if (!leftSnapshotId || !rightSnapshotId) return null
    const left = schemaSnapshots.find((s) => s.id === leftSnapshotId)
    const right = schemaSnapshots.find((s) => s.id === rightSnapshotId)
    if (!left || !right) return null
    return computeDiff(left, right)
  }, [leftSnapshotId, rightSnapshotId, schemaSnapshots])

  // Expand all modified/added/removed tables when diff changes
  const expandChangedTables = useCallback(() => {
    if (!diffResult) return
    setExpandedTables(
      new Set(diffResult.tables.filter((t) => t.status !== 'unchanged').map((t) => t.tableName))
    )
  }, [diffResult])

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Camera className="size-4 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold leading-none">Schema Snapshots</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Capture & compare schema states over time
            </p>
          </div>
        </div>
        <Button
          size="sm"
          className="gap-1.5"
          onClick={() => setShowSnapshotDialog(true)}
          disabled={!activeConnectionId || tables.length === 0}
        >
          <Camera className="size-3.5" />
          Take Snapshot
        </Button>
      </div>

      {connectionSnapshots.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center text-center gap-4">
              <div className="size-16 rounded-xl bg-primary/5 flex items-center justify-center ring-4 ring-primary/5">
                <Camera className="size-8 text-primary/30" />
              </div>
              <div className="space-y-1.5 max-w-sm">
                <p className="text-sm font-medium">No snapshots yet</p>
                <p className="text-xs text-muted-foreground">
                  Take a snapshot to save the current schema state. You can then compare snapshots
                  to detect changes over time.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => setShowSnapshotDialog(true)}
                disabled={!activeConnectionId || tables.length === 0}
              >
                <Plus className="size-3.5" />
                Take your first snapshot
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as 'snapshots' | 'compare')}
          className="w-full"
        >
          <TabsList className="grid grid-cols-2 w-full max-w-xs">
            <TabsTrigger value="snapshots" className="gap-1.5">
              <Clock className="size-3.5" />
              Snapshots
              <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">
                {connectionSnapshots.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="compare" className="gap-1.5">
              <GitCompare className="size-3.5" />
              Compare
            </TabsTrigger>
          </TabsList>

          {/* Snapshots List */}
          <TabsContent value="snapshots" className="mt-4 space-y-3">
            <ScrollArea className="max-h-[500px]">
              <div className="space-y-2 pr-4">
                <AnimatePresence mode="popLayout">
                  {connectionSnapshots.map((snapshot, idx) => (
                    <motion.div
                      key={snapshot.id}
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ delay: idx * 0.03 }}
                    >
                      <Card className="group hover:border-primary/30 transition-colors">
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <FileText className="size-4 text-primary shrink-0" />
                                <span className="font-medium text-sm truncate">
                                  {snapshot.name}
                                </span>
                              </div>
                              <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <Clock className="size-3" />
                                  {formatTimestamp(snapshot.timestamp)}
                                </span>
                                <span className="size-1 rounded-full bg-muted-foreground/30" />
                                <span className="flex items-center gap-1">
                                  <Database className="size-3" />
                                  {snapshot.tables.length} table
                                  {snapshot.tables.length !== 1 ? 's' : ''}
                                </span>
                                <span className="size-1 rounded-full bg-muted-foreground/30" />
                                <span className="flex items-center gap-1">
                                  {snapshot.rlsStatuses.filter((r) => r.rlsEnabled).length} RLS
                                  enabled
                                </span>
                              </div>
                              {isDemoMode && snapshot.connectionId === DEMO_CONNECTION_ID && (
                                <Badge variant="outline" className="mt-2 text-[9px] gap-1">
                                  <EyeIcon className="size-2.5" />
                                  Demo
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                                      onClick={() => setDeleteTarget(snapshot)}
                                    >
                                      <Trash2 className="size-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Delete snapshot</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </ScrollArea>
          </TabsContent>

          {/* Compare Tab */}
          <TabsContent value="compare" className="mt-4 space-y-4">
            {connectionSnapshots.length < 2 ? (
              <Card>
                <CardContent className="py-8">
                  <div className="flex flex-col items-center justify-center text-center gap-3">
                    <GitCompare className="size-8 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">
                      You need at least 2 snapshots to compare.
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      onClick={() => {
                        setActiveTab('snapshots')
                      }}
                    >
                      <Plus className="size-3.5" />
                      Take another snapshot
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Snapshot selectors */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  <div className="flex-1">
                    <Label className="text-xs text-muted-foreground mb-1 block">
                      Earlier snapshot (left)
                    </Label>
                    <Select value={leftSnapshotId} onValueChange={setLeftSnapshotId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select snapshot..." />
                      </SelectTrigger>
                      <SelectContent>
                        {connectionSnapshots.map((s) => (
                          <SelectItem key={s.id} value={s.id} disabled={s.id === rightSnapshotId}>
                            {s.name} ({formatTimestamp(s.timestamp)})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="hidden sm:flex items-end pb-2">
                    <ArrowRight className="size-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1">
                    <Label className="text-xs text-muted-foreground mb-1 block">
                      Later snapshot (right)
                    </Label>
                    <Select value={rightSnapshotId} onValueChange={setRightSnapshotId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select snapshot..." />
                      </SelectTrigger>
                      <SelectContent>
                        {connectionSnapshots.map((s) => (
                          <SelectItem key={s.id} value={s.id} disabled={s.id === leftSnapshotId}>
                            {s.name} ({formatTimestamp(s.timestamp)})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Diff Results */}
                {diffResult && (
                  <div className="space-y-4">
                    {/* Summary */}
                    <div className="flex flex-wrap items-center gap-3">
                      {diffResult.addedCount > 0 && (
                        <Badge className="gap-1 bg-primary hover:bg-primary">
                          <PlusCircle className="size-3" />
                          {diffResult.addedCount} added
                        </Badge>
                      )}
                      {diffResult.removedCount > 0 && (
                        <Badge variant="destructive" className="gap-1">
                          <MinusCircle className="size-3" />
                          {diffResult.removedCount} removed
                        </Badge>
                      )}
                      {diffResult.modifiedCount > 0 && (
                        <Badge className="gap-1 bg-amber-500 hover:bg-amber-600">
                          <AlertTriangle className="size-3" />
                          {diffResult.modifiedCount} modified
                        </Badge>
                      )}
                      {diffResult.unchangedCount > 0 && (
                        <Badge variant="outline" className="gap-1">
                          <CheckCircle2 className="size-3" />
                          {diffResult.unchangedCount} unchanged
                        </Badge>
                      )}
                      {diffResult.tables.some((t) => t.status !== 'unchanged') && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs gap-1 ml-auto"
                          onClick={expandChangedTables}
                        >
                          Expand changes
                        </Button>
                      )}
                    </div>

                    {diffResult.tables.every((t) => t.status === 'unchanged') ? (
                      <Card className="border-primary/30 dark:border-primary/30">
                        <CardContent className="py-8">
                          <div className="flex flex-col items-center justify-center text-center gap-3">
                            <CheckCircle2 className="size-10 text-primary" />
                            <p className="text-sm font-medium">No schema changes detected</p>
                            <p className="text-xs text-muted-foreground">
                              Both snapshots have identical schemas.
                            </p>
                          </div>
                        </CardContent>
                      </Card>
                    ) : (
                      /* Diff table */
                      <Card>
                        <CardContent className="p-0">
                          <ScrollArea className="max-h-[500px]">
                            <div className="divide-y">
                              {diffResult.tables.map((tableDiff) => (
                                <DiffTableRow
                                  key={tableDiff.tableName}
                                  diff={tableDiff}
                                  isExpanded={expandedTables.has(tableDiff.tableName)}
                                  onToggle={() => toggleTable(tableDiff.tableName)}
                                />
                              ))}
                            </div>
                          </ScrollArea>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>
      )}

      {/* Take Snapshot Dialog */}
      <Dialog open={showSnapshotDialog} onOpenChange={setShowSnapshotDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Camera className="size-5 text-primary" />
              Take Schema Snapshot
            </DialogTitle>
            <DialogDescription>
              Save a snapshot of the current schema with {tables.length} table
              {tables.length !== 1 ? 's' : ''}. You can compare snapshots later to detect changes.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <div className="flex flex-col gap-1.5">
              <Label>Snapshot Name</Label>
              <Input
                value={snapshotName}
                onChange={(e) => setSnapshotName(e.target.value)}
                placeholder={`Snapshot ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`}
              />
              <p className="text-xs text-muted-foreground">
                Leave empty for auto-generated name with timestamp.
              </p>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Snapshot will include:</p>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="gap-1 text-xs">
                  <Database className="size-3" />
                  {tables.length} table{tables.length !== 1 ? 's' : ''}
                </Badge>
                <Badge variant="outline" className="gap-1 text-xs">
                  <Columns3 className="size-3" />
                  {tables.reduce((acc, t) => acc + t.columns.length, 0)} columns
                </Badge>
                <Badge variant="outline" className="gap-1 text-xs">
                  <Shield className="size-3" />
                  {rlsStatuses.filter((r) => r.rlsEnabled).length} RLS enabled
                </Badge>
                <Badge variant="outline" className="gap-1 text-xs">
                  <Link2 className="size-3" />
                  {tables.reduce((acc, t) => acc + t.foreignKeys.length, 0)} foreign keys
                </Badge>
              </div>
            </div>
            <Button onClick={handleTakeSnapshot} className="gap-1.5">
              <Camera className="size-4" />
              Save Snapshot
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Snapshot</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;{deleteTarget?.name}&rdquo;? This action cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteSnapshot}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ─── Eye icon inline (for demo badge) ───

function EyeIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

// ─── Diff Table Row ───

function DiffTableRow({
  diff,
  isExpanded,
  onToggle,
}: {
  diff: TableDiff
  isExpanded: boolean
  onToggle: () => void
}) {
  const statusConfig: Record<
    DiffStatus,
    { bg: string; border: string; icon: React.ReactNode; label: string }
  > = {
    added: {
      bg: 'bg-primary/10 dark:bg-primary/20',
      border: 'border-l-primary',
      icon: <PlusCircle className="size-4 text-primary" />,
      label: 'Added',
    },
    removed: {
      bg: 'bg-red-50 dark:bg-red-950/20',
      border: 'border-l-red-500',
      icon: <MinusCircle className="size-4 text-red-500" />,
      label: 'Removed',
    },
    modified: {
      bg: 'bg-amber-50 dark:bg-amber-950/20',
      border: 'border-l-amber-500',
      icon: <AlertTriangle className="size-4 text-amber-500" />,
      label: 'Modified',
    },
    unchanged: {
      bg: '',
      border: '',
      icon: <CheckCircle2 className="size-4 text-muted-foreground/40" />,
      label: 'Unchanged',
    },
  }

  const config = statusConfig[diff.status]
  const hasDetails = diff.status !== 'unchanged'

  return (
    <div className={`border-l-4 ${config.border}`}>
      <button
        onClick={hasDetails ? onToggle : undefined}
        className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/50 ${config.bg} ${hasDetails ? 'cursor-pointer' : 'cursor-default'}`}
      >
        {hasDetails ? (
          isExpanded ? (
            <ChevronDown className="size-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="size-4 text-muted-foreground shrink-0" />
          )
        ) : (
          <span className="w-4 shrink-0" />
        )}
        {config.icon}
        <span className="font-mono text-sm font-medium">{diff.tableName}</span>
        <Badge
          variant={
            diff.status === 'unchanged'
              ? 'outline'
              : diff.status === 'added'
                ? 'default'
                : diff.status === 'removed'
                  ? 'destructive'
                  : 'secondary'
          }
          className={`text-[9px] px-1.5 py-0 ${
            diff.status === 'added'
              ? 'bg-primary hover:bg-primary'
              : diff.status === 'modified'
                ? 'bg-amber-500 hover:bg-amber-600 text-white'
                : ''
          }`}
        >
          {config.label}
        </Badge>
        {diff.status === 'modified' && (
          <div className="flex items-center gap-1.5 ml-auto">
            {diff.columnDiffs.filter((c) => c.status === 'added').length > 0 && (
              <span className="text-[10px] text-primary dark:text-primary flex items-center gap-0.5">
                +{diff.columnDiffs.filter((c) => c.status === 'added').length} col
              </span>
            )}
            {diff.columnDiffs.filter((c) => c.status === 'removed').length > 0 && (
              <span className="text-[10px] text-red-600 dark:text-red-400 flex items-center gap-0.5">
                -{diff.columnDiffs.filter((c) => c.status === 'removed').length} col
              </span>
            )}
            {diff.rlsChanged && (
              <span className="text-[10px] text-amber-600 dark:text-amber-400">RLS changed</span>
            )}
            {diff.fkChanges.length > 0 && (
              <span className="text-[10px] text-amber-600 dark:text-amber-400">FK changed</span>
            )}
          </div>
        )}
        {diff.status === 'removed' && (
          <span className="text-[10px] text-muted-foreground ml-auto">
            {diff.columnDiffs.length} column{diff.columnDiffs.length !== 1 ? 's' : ''}
          </span>
        )}
        {diff.status === 'added' && (
          <span className="text-[10px] text-muted-foreground ml-auto">
            {diff.columnDiffs.length} column{diff.columnDiffs.length !== 1 ? 's' : ''}
          </span>
        )}
      </button>

      {/* Expanded details */}
      <AnimatePresence>
        {isExpanded && hasDetails && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-3 pl-14 space-y-3">
              {/* RLS Change */}
              {diff.rlsChanged && (
                <div className="flex items-center gap-2 text-xs">
                  <Shield className="size-3.5 text-amber-500" />
                  <span className="text-amber-700 dark:text-amber-400 font-medium">
                    RLS status changed:
                  </span>
                  <Badge
                    variant={diff.oldRLS?.rlsEnabled ? 'default' : 'destructive'}
                    className="text-[9px] px-1.5 py-0"
                  >
                    {diff.oldRLS?.rlsEnabled ? 'ON' : 'OFF'}
                  </Badge>
                  <ArrowRight className="size-3 text-muted-foreground" />
                  <Badge
                    variant={diff.newRLS?.rlsEnabled ? 'default' : 'destructive'}
                    className="text-[9px] px-1.5 py-0"
                  >
                    {diff.newRLS?.rlsEnabled ? 'ON' : 'OFF'}
                  </Badge>
                </div>
              )}

              {/* FK Changes */}
              {diff.fkChanges.length > 0 && (
                <div className="space-y-1">
                  {diff.fkChanges.map((fk, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-xs">
                      <Link2 className="size-3.5 text-amber-500" />
                      <span
                        className={
                          fk.startsWith('FK added')
                            ? 'text-primary dark:text-primary'
                            : 'text-red-700 dark:text-red-400'
                        }
                      >
                        {fk}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Column Diffs */}
              {diff.columnDiffs.filter((c) => c.status !== 'unchanged').length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    Column changes
                  </p>
                  {diff.columnDiffs
                    .filter((c) => c.status !== 'unchanged')
                    .map((colDiff) => (
                      <ColumnDiffRow key={colDiff.columnName} diff={colDiff} />
                    ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Column Diff Row ───

function ColumnDiffRow({ diff }: { diff: ColumnDiff }) {
  const statusIcon: Record<DiffStatus, React.ReactNode> = {
    added: <PlusCircle className="size-3.5 text-primary" />,
    removed: <MinusCircle className="size-3.5 text-red-500" />,
    modified: <AlertTriangle className="size-3.5 text-amber-500" />,
    unchanged: null,
  }

  return (
    <div
      className={`flex items-start gap-2 text-xs py-1 px-2 rounded ${
        diff.status === 'added'
          ? 'bg-primary/10 dark:bg-primary/20'
          : diff.status === 'removed'
            ? 'bg-red-50 dark:bg-red-950/20'
            : diff.status === 'modified'
              ? 'bg-amber-50 dark:bg-amber-950/20'
              : ''
      }`}
    >
      {statusIcon[diff.status]}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono font-medium">{diff.columnName}</span>
          {diff.status === 'added' && diff.newColumn && (
            <span
              className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${getColumnTypeColor(diff.newColumn.data_type)}`}
            >
              {diff.newColumn.data_type}
            </span>
          )}
          {diff.status === 'removed' && diff.oldColumn && (
            <span
              className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${getColumnTypeColor(diff.oldColumn.data_type)}`}
            >
              {diff.oldColumn.data_type}
            </span>
          )}
          <Badge
            variant={
              diff.status === 'added'
                ? 'default'
                : diff.status === 'removed'
                  ? 'destructive'
                  : 'secondary'
            }
            className={`text-[8px] px-1 py-0 ${
              diff.status === 'added'
                ? 'bg-primary hover:bg-primary'
                : diff.status === 'modified'
                  ? 'bg-amber-500 hover:bg-amber-600 text-white'
                  : ''
            }`}
          >
            {diff.status === 'added' ? 'NEW' : diff.status === 'removed' ? 'DEL' : 'MOD'}
          </Badge>
        </div>
        {diff.status === 'modified' && diff.changes && diff.changes.length > 0 && (
          <div className="mt-1 space-y-0.5">
            {diff.changes.map((change, idx) => (
              <p key={idx} className="text-[10px] text-amber-600 dark:text-amber-400 font-mono">
                {change}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

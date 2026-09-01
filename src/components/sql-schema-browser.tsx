'use client'

import { ChevronDown, ChevronRight, Database, KeyRound, Search, Table2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { apiFetch } from '@/lib/api-auth'
import { DEMO_CONNECTION_ID } from '@/lib/demo-data'
import { cn } from '@/lib/utils'
import { useSupabaseStore } from '@/store/supabase-store'

const MAX_TABLES = 30
const MAX_COLUMNS = 6

interface DbFunction {
  name: string
  arguments?: string
  return_type?: string
}

// The ai-sql extension's surface, used when the live catalogue can't be read
// (demo mode, or a connection without Management API access).
const DEMO_AI_FUNCTIONS: DbFunction[] = [
  { name: 'ai_summary', arguments: 'text', return_type: 'text' },
  { name: 'ai_classify', arguments: 'text, text[]', return_type: 'text' },
  { name: 'ai_sentiment', arguments: 'text', return_type: 'jsonb' },
  { name: 'ai_extract', arguments: 'text, text', return_type: 'jsonb' },
  { name: 'ai_embed', arguments: 'text', return_type: 'real[]' },
]

const TYPE_ALIASES: Record<string, string> = {
  'character varying': 'varchar',
  'timestamp with time zone': 'timestamptz',
  'timestamp without time zone': 'timestamp',
  'time with time zone': 'timetz',
  'double precision': 'float8',
  bigint: 'int8',
  integer: 'int4',
  smallint: 'int2',
  boolean: 'bool',
  real: 'float4',
  numeric: 'numeric',
}

/** information_schema type names → the short forms Postgres tooling shows. */
function shortType(dataType: string): string {
  return TYPE_ALIASES[dataType.toLowerCase()] ?? dataType
}

/**
 * Compact a pg_get_function_arguments signature down to types: "text, text[] → jsonb".
 * Everything from the first DEFAULT on is dropped (those expressions contain commas
 * and array literals that never fit the rail) and replaced with an ellipsis.
 */
function signature(fn: DbFunction): string {
  const raw = (fn.arguments || '').trim()
  const cut = raw.search(/\bDEFAULT\b/i)
  const kept = cut === -1 ? raw : raw.slice(0, cut).replace(/,\s*$/, '')
  const types = kept
    .split(',')
    .map((arg) => arg.trim().split(/\s+/).slice(1).join(' '))
    .filter(Boolean)
    .join(', ')
  const args = types && cut !== -1 ? `${types}…` : types
  const ret = fn.return_type?.trim()
  if (args && ret) return `${args} → ${ret}`
  return args || (ret ? `→ ${ret}` : '')
}

/** A row that can be dropped into a textarea — the browser inserts text natively. */
function InsertableRow({
  text,
  onInsert,
  className,
  children,
}: {
  text: string
  onInsert: (text: string) => void
  className?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      draggable
      onDragStart={(e) => e.dataTransfer.setData('text/plain', text)}
      onClick={() => onInsert(text)}
      className={cn(
        'flex w-full items-center gap-2 rounded-[5px] text-left transition-colors hover:bg-secondary',
        className
      )}
    >
      {children}
    </button>
  )
}

export function SqlSchemaBrowser({ onInsert }: { onInsert: (text: string) => void }) {
  const { activeConnectionId, connections, tables } = useSupabaseStore()
  const activeConnection = connections.find((c) => c.id === activeConnectionId) || null
  const isDemoMode = activeConnectionId === DEMO_CONNECTION_ID

  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [aiFunctions, setAiFunctions] = useState<DbFunction[]>([])
  const searchRef = useRef<HTMLInputElement>(null)

  const toggle = (name: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })

  // "/" focuses search, unless the caret is already in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/') return
      const el = document.activeElement
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return
      e.preventDefault()
      searchRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const fetchFunctions = useCallback(async () => {
    if (isDemoMode) {
      setAiFunctions(DEMO_AI_FUNCTIONS)
      return
    }
    if (!activeConnection) {
      setAiFunctions([])
      return
    }
    try {
      const res = await apiFetch('/api/database/views-functions', activeConnection)
      const data = await res.json()
      const all: DbFunction[] = Array.isArray(data.functions) ? data.functions : []
      setAiFunctions(all.filter((f) => f.name?.startsWith('ai_')))
    } catch {
      setAiFunctions([])
    }
  }, [activeConnection, isDemoMode])

  useEffect(() => {
    fetchFunctions()
  }, [fetchFunctions])

  const term = search.trim().toLowerCase()
  const matches = useMemo(() => {
    if (!term) return tables
    return tables.filter(
      (t) =>
        t.tableName.toLowerCase().includes(term) ||
        t.columns.some((c) => c.column_name.toLowerCase().includes(term))
    )
  }, [tables, term])

  const visible = matches.slice(0, MAX_TABLES)
  const hiddenCount = matches.length - visible.length
  const visibleFunctions = term
    ? aiFunctions.filter((f) => f.name.toLowerCase().includes(term))
    : aiFunctions

  return (
    <div className="flex w-[272px] shrink-0 flex-col border-r border-border bg-card">
      <div className="flex flex-col gap-2 px-3 pt-3 pb-2">
        <div className="flex items-center gap-2 rounded-md border border-border bg-secondary px-2.5 py-1.5">
          <Search className="size-3.5 shrink-0 text-muted-foreground" />
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tables and columns"
            className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="text-[10px] text-muted-foreground hover:text-foreground"
            >
              clear
            </button>
          ) : (
            <span className="rounded border border-border px-1 font-mono text-[10px] text-muted-foreground/70">
              /
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5">
          <Database className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="text-xs">public</span>
          <span className="text-[11px] text-muted-foreground">
            · {tables.length} table{tables.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-1.5">
        {tables.length === 0 && (
          <p className="px-2 py-3 text-[11px] text-muted-foreground">
            No schema loaded. Fetch the schema to browse tables here.
          </p>
        )}

        {visible.map((table) => {
          const isOpen = expanded.has(table.tableName)
          const fkColumns = new Set(table.foreignKeys.map((fk) => fk.column_name))
          const columns = isOpen ? table.columns.slice(0, MAX_COLUMNS) : []
          const moreColumns = table.columns.length - columns.length

          return (
            <div key={table.tableName}>
              <div
                className={cn(
                  'flex items-center gap-1.5 rounded-[5px] px-2 py-1.5',
                  isOpen ? 'bg-secondary' : 'hover:bg-secondary'
                )}
              >
                <button
                  type="button"
                  onClick={() => toggle(table.tableName)}
                  aria-label={isOpen ? `Collapse ${table.tableName}` : `Expand ${table.tableName}`}
                  className="shrink-0 text-muted-foreground"
                >
                  {isOpen ? (
                    <ChevronDown className="size-3" />
                  ) : (
                    <ChevronRight className="size-3" />
                  )}
                </button>
                <Table2
                  className={cn(
                    'size-3.5 shrink-0',
                    isOpen ? 'text-primary' : 'text-muted-foreground'
                  )}
                />
                <InsertableRow
                  text={table.tableName}
                  onInsert={onInsert}
                  className="min-w-0 hover:bg-transparent"
                >
                  <span
                    className={cn(
                      'truncate font-mono text-xs',
                      isOpen ? 'font-medium text-foreground' : 'text-foreground/70'
                    )}
                  >
                    {table.tableName}
                  </span>
                </InsertableRow>
                <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                  {isOpen ? `${table.columns.length} cols` : table.columns.length}
                </span>
              </div>

              {isOpen && (
                <div className="ml-3.5 flex flex-col border-l border-border py-0.5 pb-1">
                  {columns.map((col) => (
                    <InsertableRow
                      key={col.column_name}
                      text={col.column_name}
                      onInsert={onInsert}
                      className="px-2.5 py-[3px]"
                    >
                      <span className="truncate font-mono text-[11.5px] text-foreground/70">
                        {col.column_name}
                      </span>
                      {fkColumns.has(col.column_name) && (
                        <KeyRound className="size-2.5 shrink-0 text-amber-500" />
                      )}
                      <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground/70">
                        {shortType(col.data_type)}
                      </span>
                    </InsertableRow>
                  ))}
                  {moreColumns > 0 && (
                    <span className="px-2.5 py-[3px] text-[11px] text-muted-foreground/70">
                      {moreColumns} more column{moreColumns !== 1 ? 's' : ''}…
                    </span>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {hiddenCount > 0 && (
          <p className="px-2 py-1.5 text-[11px] text-muted-foreground/70">
            {hiddenCount} more table{hiddenCount !== 1 ? 's' : ''}…
          </p>
        )}

        {visibleFunctions.length > 0 && (
          <>
            <div className="flex items-center gap-2 px-2 pt-2.5 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground/70">
              <span>AI functions</span>
              {isDemoMode && (
                <span className="rounded bg-primary/15 px-1.5 text-[9px] normal-case tracking-normal text-primary">
                  demo
                </span>
              )}
            </div>
            {visibleFunctions.map((fn) => (
              <InsertableRow
                key={fn.name}
                text={`${fn.name}()`}
                onInsert={onInsert}
                className="px-2 py-1"
              >
                <span className="shrink-0 font-mono text-[11px] font-semibold italic text-[hsl(var(--code-block-1))]">
                  ƒ
                </span>
                <span className="truncate font-mono text-[11.5px] text-foreground/70">
                  {fn.name}
                </span>
                <span className="ml-auto shrink-0 truncate font-mono text-[10px] text-muted-foreground/70">
                  {signature(fn)}
                </span>
              </InsertableRow>
            ))}
          </>
        )}

        <div className="h-3" />
      </div>

      <div className="border-t border-border px-3 py-2.5 text-[11px] text-muted-foreground">
        Drag or click a table, column, or function to insert it
      </div>
    </div>
  )
}

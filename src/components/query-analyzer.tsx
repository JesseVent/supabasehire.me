'use client'

import { AnimatePresence, motion } from 'framer-motion'
import {
  Activity,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Clock,
  Database,
  Eye,
  Gauge,
  Loader2,
  MemoryStick,
  Search,
  Timer,
  TreePine,
  Zap,
} from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { apiFetch } from '@/lib/api-auth'
import { DEMO_CONNECTION_ID } from '@/lib/demo-data'
import { useSupabaseStore } from '@/store/supabase-store'

// ─── Types ───

interface PlanNode {
  'Node Type': string
  'Parent Relationship'?: string
  'Relation Name'?: string
  Alias?: string
  'Index Name'?: string
  'Index Cond'?: string
  Filter?: string
  'Recheck Cond'?: string
  'Hash Cond'?: string
  'Join Type'?: string
  'Sort Key'?: string[]
  'Sort Method'?: string
  'Sort Space Used'?: number
  'Sort Space Type'?: string
  'Startup Cost'?: number
  'Total Cost'?: number
  'Plan Rows'?: number
  'Plan Width'?: number
  'Actual Startup Time'?: number
  'Actual Total Time'?: number
  'Actual Rows'?: number
  'Actual Loops'?: number
  'Rows Removed by Filter'?: number
  'Rows Removed by Index Recheck'?: number
  'Rows Removed by Join Filter'?: number
  'Peak Memory Usage'?: number
  'Shared Hit Blocks'?: number
  'Shared Read Blocks'?: number
  'Shared Dirtied Blocks'?: number
  'Shared Written Blocks'?: number
  'Local Hit Blocks'?: number
  'Local Read Blocks'?: number
  'Temp Read Blocks'?: number
  'Temp Written Blocks'?: number
  Plans?: PlanNode[]
}

interface ExplainResult {
  Plan: PlanNode
  'Planning Time'?: number
  Triggers?: unknown[]
  'Execution Time'?: number
}

interface Warning {
  type: 'seq_scan' | 'high_cost' | 'nested_loop' | 'sort_memory' | 'low_hit_ratio'
  severity: 'warning' | 'critical'
  message: string
  nodeType: string
  relationName?: string
  detail: string
}

// ─── Demo Data ───

const DEMO_EXPLAIN_RESULT: ExplainResult[] = [
  {
    Plan: {
      'Node Type': 'Limit',
      'Startup Cost': 0.29,
      'Total Cost': 12.47,
      'Plan Rows': 10,
      'Plan Width': 156,
      'Actual Startup Time': 0.045,
      'Actual Total Time': 0.062,
      'Actual Rows': 10,
      'Actual Loops': 1,
      'Shared Hit Blocks': 6,
      'Shared Read Blocks': 0,
      Plans: [
        {
          'Node Type': 'Incremental Sort',
          'Parent Relationship': 'Outer',
          'Sort Key': ['created_at DESC'],
          'Sort Method': 'top-N heapsort',
          'Sort Space Used': 25,
          'Sort Space Type': 'Memory',
          'Startup Cost': 0.29,
          'Total Cost': 12.47,
          'Plan Rows': 10,
          'Plan Width': 156,
          'Actual Startup Time': 0.043,
          'Actual Total Time': 0.058,
          'Actual Rows': 10,
          'Actual Loops': 1,
          'Shared Hit Blocks': 6,
          'Shared Read Blocks': 0,
          Plans: [
            {
              'Node Type': 'Index Scan',
              'Parent Relationship': 'Outer',
              'Index Name': 'idx_posts_user_id',
              'Relation Name': 'posts',
              Alias: 'posts',
              'Index Cond': '(user_id = 1)',
              'Startup Cost': 0.29,
              'Total Cost': 8.31,
              'Plan Rows': 10,
              'Plan Width': 156,
              'Actual Startup Time': 0.02,
              'Actual Total Time': 0.028,
              'Actual Rows': 10,
              'Actual Loops': 1,
              'Rows Removed by Index Recheck': 0,
              'Shared Hit Blocks': 4,
              'Shared Read Blocks': 0,
            },
          ],
        },
      ],
    },
    'Planning Time': 0.087,
    'Execution Time': 0.095,
  },
]

const DEMO_EXPLAIN_RESULT_COMPLEX: ExplainResult[] = [
  {
    Plan: {
      'Node Type': 'Limit',
      'Startup Cost': 156.72,
      'Total Cost': 156.75,
      'Plan Rows': 10,
      'Plan Width': 220,
      'Actual Startup Time': 12.345,
      'Actual Total Time': 12.458,
      'Actual Rows': 10,
      'Actual Loops': 1,
      'Shared Hit Blocks': 142,
      'Shared Read Blocks': 8,
      Plans: [
        {
          'Node Type': 'Sort',
          'Parent Relationship': 'Outer',
          'Sort Key': ['p.created_at DESC'],
          'Sort Method': 'top-N heapsort',
          'Sort Space Used': 26,
          'Sort Space Type': 'Memory',
          'Startup Cost': 156.72,
          'Total Cost': 156.75,
          'Plan Rows': 10,
          'Plan Width': 220,
          'Actual Startup Time': 12.342,
          'Actual Total Time': 12.452,
          'Actual Rows': 10,
          'Actual Loops': 1,
          'Shared Hit Blocks': 142,
          'Shared Read Blocks': 8,
          Plans: [
            {
              'Node Type': 'Nested Loop',
              'Startup Cost': 0.42,
              'Total Cost': 155.89,
              'Plan Rows': 15,
              'Plan Width': 220,
              'Actual Startup Time': 0.052,
              'Actual Total Time': 12.301,
              'Actual Rows': 45,
              'Actual Loops': 1,
              'Shared Hit Blocks': 138,
              'Shared Read Blocks': 8,
              Plans: [
                {
                  'Node Type': 'Index Scan',
                  'Parent Relationship': 'Outer',
                  'Index Name': 'idx_posts_user_id',
                  'Relation Name': 'posts',
                  Alias: 'p',
                  'Index Cond': '(user_id = 1)',
                  'Startup Cost': 0.29,
                  'Total Cost': 8.31,
                  'Plan Rows': 10,
                  'Plan Width': 156,
                  'Actual Startup Time': 0.018,
                  'Actual Total Time': 0.045,
                  'Actual Rows': 15,
                  'Actual Loops': 1,
                  'Shared Hit Blocks': 4,
                  'Shared Read Blocks': 0,
                },
                {
                  'Node Type': 'Index Scan',
                  'Parent Relationship': 'Inner',
                  'Index Name': 'idx_comments_post_id',
                  'Relation Name': 'comments',
                  Alias: 'c',
                  'Index Cond': '(post_id = p.id)',
                  'Startup Cost': 0.13,
                  'Total Cost': 14.72,
                  'Plan Rows': 3,
                  'Plan Width': 64,
                  'Actual Startup Time': 0.008,
                  'Actual Total Time': 0.814,
                  'Actual Rows': 3,
                  'Actual Loops': 15,
                  'Shared Hit Blocks': 134,
                  'Shared Read Blocks': 8,
                },
              ],
            },
          ],
        },
      ],
    },
    'Planning Time': 0.134,
    'Execution Time': 12.523,
  },
]

const DEMO_EXPLAIN_RESULT_SEQSCAN: ExplainResult[] = [
  {
    Plan: {
      'Node Type': 'Limit',
      'Startup Cost': 2847.62,
      'Total Cost': 2847.65,
      'Plan Rows': 10,
      'Plan Width': 156,
      'Actual Startup Time': 145.234,
      'Actual Total Time': 145.287,
      'Actual Rows': 10,
      'Actual Loops': 1,
      'Shared Hit Blocks': 248,
      'Shared Read Blocks': 3124,
      Plans: [
        {
          'Node Type': 'Sort',
          'Parent Relationship': 'Outer',
          'Sort Key': ['created_at DESC'],
          'Sort Method': 'external merge',
          'Sort Space Used': 2048,
          'Sort Space Type': 'Disk',
          'Startup Cost': 2847.62,
          'Total Cost': 2847.65,
          'Plan Rows': 10,
          'Plan Width': 156,
          'Actual Startup Time': 145.231,
          'Actual Total Time': 145.28,
          'Actual Rows': 10,
          'Actual Loops': 1,
          'Shared Hit Blocks': 248,
          'Shared Read Blocks': 3124,
          Plans: [
            {
              'Node Type': 'Seq Scan',
              'Parent Relationship': 'Outer',
              'Relation Name': 'audit_logs',
              Alias: 'audit_logs',
              Filter: '(user_id = 1)',
              'Startup Cost': 0.0,
              'Total Cost': 2847.42,
              'Plan Rows': 89,
              'Plan Width': 156,
              'Actual Startup Time': 0.012,
              'Actual Total Time': 142.876,
              'Actual Rows': 1247,
              'Actual Loops': 1,
              'Rows Removed by Filter': 87987,
              'Shared Hit Blocks': 248,
              'Shared Read Blocks': 3124,
            },
          ],
        },
      ],
    },
    'Planning Time': 0.056,
    'Execution Time': 146.891,
  },
]

function getDemoExplainResult(query: string): ExplainResult[] {
  const q = query.toLowerCase()
  if (q.includes('join') || q.includes('comments')) {
    return DEMO_EXPLAIN_RESULT_COMPLEX
  }
  if (q.includes('audit_logs') || q.includes('audit log')) {
    return DEMO_EXPLAIN_RESULT_SEQSCAN
  }
  return DEMO_EXPLAIN_RESULT
}

// ─── Helper Functions ───

function getNodePerformanceColor(time: number): {
  bg: string
  border: string
  text: string
  dot: string
} {
  if (time < 1) {
    return {
      bg: 'bg-primary/10 dark:bg-primary/15',
      border: 'border-primary/20 dark:border-primary/30',
      text: 'text-primary dark:text-primary',
      dot: 'bg-primary',
    }
  }
  if (time < 50) {
    return {
      bg: 'bg-amber-500/10 dark:bg-amber-500/15',
      border: 'border-amber-500/20 dark:border-amber-500/30',
      text: 'text-amber-600 dark:text-amber-400',
      dot: 'bg-amber-500',
    }
  }
  return {
    bg: 'bg-red-500/10 dark:bg-red-500/15',
    border: 'border-red-500/20 dark:border-red-500/30',
    text: 'text-red-600 dark:text-red-400',
    dot: 'bg-red-500',
  }
}

function getNodeTypeLabel(node: PlanNode): string {
  const type = node['Node Type']
  switch (type) {
    case 'Seq Scan':
      return 'Sequential Scan'
    case 'Index Scan':
      return 'Index Scan'
    case 'Index Only Scan':
      return 'Index-Only Scan'
    case 'Bitmap Heap Scan':
      return 'Bitmap Heap Scan'
    case 'Bitmap Index Scan':
      return 'Bitmap Index Scan'
    case 'Nested Loop':
      return 'Nested Loop Join'
    case 'Hash Join':
      return 'Hash Join'
    case 'Merge Join':
      return 'Merge Join'
    case 'Sort':
      return 'Sort'
    case 'Incremental Sort':
      return 'Incremental Sort'
    case 'Limit':
      return 'Limit'
    case 'Aggregate':
      return 'Aggregate'
    case 'Hash':
      return 'Hash'
    case 'Append':
      return 'Append'
    case 'Merge Append':
      return 'Merge Append'
    case 'Subquery Scan':
      return 'Subquery Scan'
    case 'CTE Scan':
      return 'CTE Scan'
    case 'Function Scan':
      return 'Function Scan'
    case 'Values Scan':
      return 'Values Scan'
    default:
      return type
  }
}

function getNodeTypeIcon(nodeType: string): string {
  switch (nodeType) {
    case 'Seq Scan':
      return '🔍'
    case 'Index Scan':
    case 'Index Only Scan':
      return '⚡'
    case 'Bitmap Heap Scan':
    case 'Bitmap Index Scan':
      return '📊'
    case 'Nested Loop':
    case 'Hash Join':
    case 'Merge Join':
      return '🔗'
    case 'Sort':
    case 'Incremental Sort':
      return '📐'
    case 'Limit':
      return '✂️'
    case 'Aggregate':
      return '∑'
    case 'Hash':
      return '#'
    default:
      return '◦'
  }
}

function countNodes(node: PlanNode): number {
  let count = 1
  if (node.Plans) {
    for (const child of node.Plans) {
      count += countNodes(child)
    }
  }
  return count
}

function getTotalRows(node: PlanNode): number {
  return node['Actual Rows'] ?? 0
}

function getTotalBuffers(node: PlanNode): { hit: number; read: number } {
  let hit = node['Shared Hit Blocks'] ?? 0
  let read = node['Shared Read Blocks'] ?? 0
  if (node.Plans) {
    for (const child of node.Plans) {
      const childBuffers = getTotalBuffers(child)
      hit += childBuffers.hit
      read += childBuffers.read
    }
  }
  return { hit, read }
}

function detectWarnings(node: PlanNode, parentTime?: number): Warning[] {
  const warnings: Warning[] = []
  const nodeType = node['Node Type']
  const time = node['Actual Total Time'] ?? 0
  const relationName = node['Relation Name']

  // Sequential scan on a table with many rows
  if (nodeType === 'Seq Scan') {
    const rowsRemoved = node['Rows Removed by Filter'] ?? 0
    const actualRows = node['Actual Rows'] ?? 0
    if (actualRows > 1000 || rowsRemoved > 1000) {
      warnings.push({
        type: 'seq_scan',
        severity: rowsRemoved > 10000 ? 'critical' : 'warning',
        message: `Sequential scan on ${relationName ?? 'table'}`,
        nodeType,
        relationName,
        detail: `Scanned ${actualRows + rowsRemoved} rows, removed ${rowsRemoved} by filter. Consider adding an index.`,
      })
    }
  }

  // High-cost operations
  if (time > 100) {
    warnings.push({
      type: 'high_cost',
      severity: time > 500 ? 'critical' : 'warning',
      message: `High-cost ${nodeType} operation`,
      nodeType,
      relationName,
      detail: `Took ${time.toFixed(3)}ms${parentTime ? ` (${((time / parentTime) * 100).toFixed(1)}% of total)` : ''}`,
    })
  }

  // Nested loops with many iterations
  if (nodeType === 'Nested Loop') {
    const loops = node['Actual Loops'] ?? 1
    const actualRows = node['Actual Rows'] ?? 0
    if (loops > 1 && actualRows > 100) {
      warnings.push({
        type: 'nested_loop',
        severity: actualRows > 1000 ? 'critical' : 'warning',
        message: `Nested loop with high row count`,
        nodeType,
        relationName,
        detail: `${loops} loops producing ${actualRows} total rows. Consider a hash or merge join.`,
      })
    }
  }

  // Sort with high memory or disk usage
  if ((nodeType === 'Sort' || nodeType === 'Incremental Sort') && node['Sort Space Used']) {
    const spaceUsed = node['Sort Space Used']
    const spaceType = node['Sort Space Type']
    if (spaceType === 'Disk') {
      warnings.push({
        type: 'sort_memory',
        severity: 'critical',
        message: `Sort spilled to disk`,
        nodeType,
        relationName,
        detail: `Used ${spaceUsed}KB on disk for sorting. Consider increasing work_mem or adding an index to avoid sorting.`,
      })
    } else if (spaceUsed > 1024) {
      warnings.push({
        type: 'sort_memory',
        severity: 'warning',
        message: `Sort using significant memory`,
        nodeType,
        relationName,
        detail: `Used ${spaceUsed}KB in memory for sorting. Method: ${node['Sort Method'] ?? 'unknown'}.`,
      })
    }
  }

  // Low buffer hit ratio
  const hitBlocks = node['Shared Hit Blocks'] ?? 0
  const readBlocks = node['Shared Read Blocks'] ?? 0
  if (hitBlocks + readBlocks > 0) {
    const ratio = hitBlocks / (hitBlocks + readBlocks)
    if (ratio < 0.9 && hitBlocks + readBlocks > 100) {
      warnings.push({
        type: 'low_hit_ratio',
        severity: ratio < 0.5 ? 'critical' : 'warning',
        message: `Low buffer hit ratio on ${relationName ?? nodeType}`,
        nodeType,
        relationName,
        detail: `Hit ratio: ${(ratio * 100).toFixed(1)}% (${hitBlocks} hits, ${readBlocks} reads). Consider increasing shared_buffers.`,
      })
    }
  }

  // Recurse into children
  if (node.Plans) {
    for (const child of node.Plans) {
      warnings.push(...detectWarnings(child, parentTime ?? time))
    }
  }

  return warnings
}

// ─── Plan Tree Node Component ───

function PlanTreeNode({
  node,
  depth,
  executionTime,
}: {
  node: PlanNode
  depth: number
  executionTime?: number
}) {
  const [isOpen, setIsOpen] = useState(depth < 2)
  const hasChildren = node.Plans && node.Plans.length > 0
  const time = node['Actual Total Time'] ?? 0
  const perf = getNodePerformanceColor(time)
  const icon = getNodeTypeIcon(node['Node Type'])
  const label = getNodeTypeLabel(node)
  const rows = node['Actual Rows'] ?? 0
  const cost = node['Total Cost'] ?? 0
  const loops = node['Actual Loops'] ?? 1
  const timePercent = executionTime && executionTime > 0 ? (time / executionTime) * 100 : 0

  const hitBlocks = node['Shared Hit Blocks'] ?? 0
  const readBlocks = node['Shared Read Blocks'] ?? 0
  const totalBlocks = hitBlocks + readBlocks
  const hitRatio = totalBlocks > 0 ? (hitBlocks / totalBlocks) * 100 : 100

  return (
    <div className="w-full">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <div
          className={`rounded-lg border ${perf.border} ${perf.bg} transition-all hover:shadow-sm`}
          style={{ marginLeft: depth > 0 ? `${depth * 24}px` : '0' }}
        >
          <div className="flex items-center gap-2 p-3">
            {/* Expand/Collapse button */}
            {hasChildren ? (
              <CollapsibleTrigger asChild>
                <button className="shrink-0 p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                  {isOpen ? (
                    <ChevronDown className="size-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="size-4 text-muted-foreground" />
                  )}
                </button>
              </CollapsibleTrigger>
            ) : (
              <div className="w-5 shrink-0 flex items-center justify-center">
                <div className={`size-2 rounded-full ${perf.dot}`} />
              </div>
            )}

            {/* Node info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm">{icon}</span>
                <span className={`text-sm font-semibold ${perf.text}`}>{label}</span>
                {node['Relation Name'] && (
                  <Badge variant="secondary" className="text-[10px] font-mono px-1.5 py-0">
                    {node['Relation Name']}
                  </Badge>
                )}
                {node['Index Name'] && (
                  <Badge
                    variant="outline"
                    className="text-[10px] font-mono px-1.5 py-0 gap-1 border-primary/30 text-primary dark:text-primary"
                  >
                    <Zap className="size-2.5" />
                    {node['Index Name']}
                  </Badge>
                )}
                {node['Join Type'] && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {node['Join Type']}
                  </Badge>
                )}
              </div>

              {/* Details row */}
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Timer className="size-3" />
                  {time.toFixed(3)}ms
                  {timePercent > 0 && (
                    <span
                      className={`ml-0.5 ${timePercent > 80 ? 'text-red-500 font-semibold' : timePercent > 40 ? 'text-amber-500' : ''}`}
                    >
                      ({timePercent.toFixed(1)}%)
                    </span>
                  )}
                </span>
                <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Database className="size-3" />
                  {rows.toLocaleString()} rows
                </span>
                {loops > 1 && (
                  <span className="text-[11px] text-muted-foreground">×{loops} loops</span>
                )}
                <span className="text-[11px] text-muted-foreground">cost {cost.toFixed(2)}</span>
                {totalBlocks > 0 && (
                  <span
                    className={`text-[11px] ${hitRatio >= 99 ? 'text-primary' : hitRatio >= 90 ? 'text-amber-500' : 'text-red-500'}`}
                  >
                    cache {hitRatio.toFixed(0)}%
                  </span>
                )}
              </div>

              {/* Conditions */}
              {(node['Index Cond'] ||
                node['Filter'] ||
                node['Hash Cond'] ||
                node['Recheck Cond']) && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {node['Index Cond'] && (
                    <code className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary dark:text-primary font-mono">
                      Index: {node['Index Cond']}
                    </code>
                  )}
                  {node['Filter'] && (
                    <code className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-400 font-mono">
                      Filter: {node['Filter']}
                    </code>
                  )}
                  {node['Hash Cond'] && (
                    <code className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">
                      Hash: {node['Hash Cond']}
                    </code>
                  )}
                </div>
              )}

              {/* Sort info */}
              {node['Sort Key'] && (
                <div className="mt-1">
                  <code className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">
                    Sort: {node['Sort Key'].join(', ')}
                  </code>
                  {node['Sort Method'] && (
                    <span className="text-[10px] text-muted-foreground ml-1.5">
                      ({node['Sort Method']}
                      {node['Sort Space Used']
                        ? `: ${node['Sort Space Used']}KB ${node['Sort Space Type']?.toLowerCase() ?? ''}`
                        : ''}
                      )
                    </span>
                  )}
                </div>
              )}

              {/* Rows removed */}
              {node['Rows Removed by Filter'] != null && node['Rows Removed by Filter'] > 0 && (
                <div className="mt-1">
                  <span className="text-[10px] text-red-500/80">
                    ↓ {node['Rows Removed by Filter'].toLocaleString()} rows removed by filter
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Children */}
        {hasChildren && (
          <CollapsibleContent>
            <div className="mt-1.5 space-y-1.5">
              {node.Plans!.map((child, idx) => (
                <PlanTreeNode
                  key={`${child['Node Type']}-${idx}-${depth + 1}`}
                  node={child}
                  depth={depth + 1}
                  executionTime={executionTime}
                />
              ))}
            </div>
          </CollapsibleContent>
        )}
      </Collapsible>
    </div>
  )
}

// ─── Stats Card ───

function StatCard({
  icon,
  label,
  value,
  subValue,
  valueClassName,
}: {
  icon: React.ReactNode
  label: string
  value: string
  subValue?: string
  valueClassName?: string
}) {
  return (
    <div className="rounded-xl border p-4 transition-all hover:shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        {icon}
      </div>
      <div className={`text-xl font-bold tracking-tight ${valueClassName ?? ''}`}>{value}</div>
      {subValue && <div className="text-[11px] text-muted-foreground mt-0.5">{subValue}</div>}
    </div>
  )
}

// ─── Main Component ───

interface QueryAnalyzerProps {
  activeConnectionId: string | null
  query?: string
}

export function QueryAnalyzer({ activeConnectionId, query: initialQuery }: QueryAnalyzerProps) {
  const { connections } = useSupabaseStore()
  const activeConnection = connections.find((c) => c.id === activeConnectionId) || null
  const [query, setQuery] = useState(
    initialQuery ?? 'SELECT * FROM posts WHERE user_id = 1 ORDER BY created_at DESC LIMIT 10;'
  )
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [explainResult, setExplainResult] = useState<ExplainResult[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const isDemo = activeConnectionId === DEMO_CONNECTION_ID

  // When initialQuery changes, update the local query
  useMemo(() => {
    if (initialQuery && initialQuery.trim()) {
      setQuery(initialQuery)
    }
  }, [initialQuery])

  const runExplain = useCallback(async () => {
    if (!activeConnectionId || !query.trim()) return
    setIsAnalyzing(true)
    setError(null)
    setExplainResult(null)

    // Demo mode
    if (isDemo) {
      await new Promise((resolve) => setTimeout(resolve, 500 + Math.random() * 400))
      const result = getDemoExplainResult(query)
      setExplainResult(result)
      toast.success('EXPLAIN ANALYZE complete (demo)', {
        description: `Execution time: ${result[0]['Execution Time']?.toFixed(3)}ms`,
      })
      setIsAnalyzing(false)
      return
    }

    try {
      const res = await apiFetch('/api/sql', activeConnection, {
        query: `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query.trim()}`,
      })

      const data = await res.json()
      if (data.error) {
        setError(data.error)
        toast.error('EXPLAIN ANALYZE failed', { description: data.error })
      } else {
        // The result may come as a single JSON array or as rows
        let parsed: ExplainResult[]
        if (Array.isArray(data.data)) {
          // If rows are returned, the first row should contain the JSON plan
          const firstRow = data.data[0] as Record<string, unknown>
          const planKey = Object.keys(firstRow)[0]
          if (planKey) {
            const planData = firstRow[planKey]
            parsed =
              typeof planData === 'string' ? JSON.parse(planData) : (planData as ExplainResult[])
          } else {
            parsed = data.data as ExplainResult[]
          }
        } else if (data.data) {
          parsed = Array.isArray(data.data) ? data.data : [data.data]
        } else {
          parsed = data as ExplainResult[]
        }
        setExplainResult(parsed)
        toast.success('EXPLAIN ANALYZE complete', {
          description: `Execution time: ${parsed[0]?.['Execution Time']?.toFixed(3)}ms`,
        })
      }
    } catch (err) {
      setError('Network error occurred')
      toast.error('EXPLAIN ANALYZE failed', { description: 'Network error occurred' })
    } finally {
      setIsAnalyzing(false)
    }
  }, [activeConnectionId, activeConnection, query, isDemo])

  // Derived data
  const plan = explainResult?.[0]?.Plan
  const executionTime = explainResult?.[0]?.['Execution Time']
  const planningTime = explainResult?.[0]?.['Planning Time']
  const nodeCount = plan ? countNodes(plan) : 0
  const totalRows = plan ? getTotalRows(plan) : 0
  const buffers = plan ? getTotalBuffers(plan) : { hit: 0, read: 0 }
  const hitRatio =
    buffers.hit + buffers.read > 0 ? (buffers.hit / (buffers.hit + buffers.read)) * 100 : 100
  const warnings = plan ? detectWarnings(plan, executionTime) : []

  const criticalCount = warnings.filter((w) => w.severity === 'critical').length
  const warningCount = warnings.filter((w) => w.severity === 'warning').length

  return (
    <div className="em-panel h-full flex flex-col gap-4">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Gauge className="size-5 text-primary" />
            <CardTitle>Query Performance Analyzer</CardTitle>
            {isDemo && (
              <Badge
                variant="outline"
                className="gap-1 text-amber-600 border-amber-200 dark:text-amber-400 dark:border-amber-800 text-[10px]"
              >
                <Eye className="size-3" />
                Demo
              </Badge>
            )}
          </div>
          <CardDescription>
            {isDemo
              ? 'Visualize query execution plans with simulated EXPLAIN ANALYZE data'
              : 'Run EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) to visualize query performance'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Activity className="size-3.5" />
            {isDemo
              ? 'Demo mode — showing realistic execution plan data. Try queries with JOIN, comments, or audit_logs for different plans.'
              : 'Uses EXPLAIN ANALYZE — queries will be executed and measured. Use with caution on production.'}
          </div>
        </CardContent>
      </Card>

      {/* Query Input */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Query to Analyze</CardTitle>
            <div className="flex items-center gap-2">
              {isDemo && (
                <Select
                  value={
                    query.toLowerCase().includes('join') || query.toLowerCase().includes('comments')
                      ? 'join'
                      : query.toLowerCase().includes('audit')
                        ? 'seqscan'
                        : 'simple'
                  }
                  onValueChange={(v: string) => {
                    switch (v) {
                      case 'join':
                        setQuery(
                          'SELECT p.*, c.content FROM posts p JOIN comments c ON c.post_id = p.id WHERE p.user_id = 1 ORDER BY p.created_at DESC LIMIT 10;'
                        )
                        break
                      case 'seqscan':
                        setQuery(
                          'SELECT * FROM audit_logs WHERE user_id = 1 ORDER BY created_at DESC LIMIT 10;'
                        )
                        break
                      default:
                        setQuery(
                          'SELECT * FROM posts WHERE user_id = 1 ORDER BY created_at DESC LIMIT 10;'
                        )
                    }
                    setExplainResult(null)
                  }}
                >
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="Demo Query" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="simple">Simple Query</SelectItem>
                    <SelectItem value="join">JOIN Query</SelectItem>
                    <SelectItem value="seqscan">Seq Scan Query</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3">
            <div className="relative flex rounded-lg overflow-hidden border border-zinc-800 dark:border-zinc-700 bg-zinc-950 dark:bg-zinc-900 focus-within:ring-1 focus-within:ring-zinc-600">
              <Textarea
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                    e.preventDefault()
                    runExplain()
                  }
                }}
                placeholder="Enter a SQL query to analyze..."
                className="font-mono text-sm min-h-[100px] bg-transparent text-zinc-100 dark:text-zinc-200 border-0 focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-zinc-600 dark:placeholder:text-zinc-500 resize-y pl-3 py-3"
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {query.trim() ? `${query.trim().length} characters` : 'Enter a SQL query'}
              </span>
              <Button
                onClick={runExplain}
                disabled={isAnalyzing || !query.trim() || !activeConnectionId}
                size="sm"
              >
                {isAnalyzing ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <Search className="mr-2 size-4" />
                )}
                Explain Analyze
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Error */}
      {error && (
        <Card className="border-red-500/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
              <AlertTriangle className="size-4" />
              <span className="text-sm font-medium">Analysis Failed</span>
            </div>
            <p className="text-xs text-red-500/80 mt-1 font-mono">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {explainResult && plan && (
        <AnimatePresence mode="wait">
          <motion.div
            key="results"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col gap-4"
          >
            {/* Stats Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <StatCard
                icon={
                  <Clock
                    className={`size-3.5 ${executionTime != null && executionTime < 10 ? 'text-primary' : executionTime != null && executionTime < 100 ? 'text-amber-500' : 'text-red-500'}`}
                  />
                }
                label="Execution Time"
                value={executionTime != null ? `${executionTime.toFixed(2)}ms` : '—'}
                subValue={
                  executionTime != null
                    ? executionTime < 10
                      ? '⚡ Fast'
                      : executionTime < 100
                        ? '👍 Moderate'
                        : '🐌 Slow'
                    : undefined
                }
                valueClassName={
                  executionTime != null && executionTime < 10
                    ? 'text-primary'
                    : executionTime != null && executionTime < 100
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-red-600 dark:text-red-400'
                }
              />
              <StatCard
                icon={<Timer className="size-3.5 text-muted-foreground" />}
                label="Planning Time"
                value={planningTime != null ? `${planningTime.toFixed(2)}ms` : '—'}
                subValue={
                  planningTime != null && executionTime != null
                    ? `${((planningTime / (planningTime + executionTime)) * 100).toFixed(1)}% of total`
                    : undefined
                }
              />
              <StatCard
                icon={<Database className="size-3.5 text-muted-foreground" />}
                label="Rows Processed"
                value={totalRows.toLocaleString()}
                subValue={`${nodeCount} plan node${nodeCount !== 1 ? 's' : ''}`}
              />
              <StatCard
                icon={
                  <MemoryStick
                    className={`size-3.5 ${hitRatio >= 99 ? 'text-primary' : hitRatio >= 90 ? 'text-amber-500' : 'text-red-500'}`}
                  />
                }
                label="Buffer Hit Ratio"
                value={`${hitRatio.toFixed(0)}%`}
                subValue={`${buffers.hit.toLocaleString()} hits / ${buffers.read.toLocaleString()} reads`}
                valueClassName={
                  hitRatio >= 99
                    ? 'text-primary'
                    : hitRatio >= 90
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-red-600 dark:text-red-400'
                }
              />
              <StatCard
                icon={
                  <AlertTriangle
                    className={`size-3.5 ${criticalCount > 0 ? 'text-red-500' : warningCount > 0 ? 'text-amber-500' : 'text-primary'}`}
                  />
                }
                label="Warnings"
                value={`${criticalCount + warningCount}`}
                subValue={
                  criticalCount > 0
                    ? `${criticalCount} critical, ${warningCount} warning`
                    : warningCount > 0
                      ? `${warningCount} warning`
                      : 'No issues detected'
                }
                valueClassName={
                  criticalCount > 0
                    ? 'text-red-600 dark:text-red-400'
                    : warningCount > 0
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-primary'
                }
              />
            </div>

            {/* Plan Tree */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <TreePine className="size-5 text-primary" />
                  <CardTitle className="text-base">Execution Plan</CardTitle>
                </div>
                <CardDescription>
                  Visual representation of the query execution plan. Color indicates performance:
                  green (fast), amber (moderate), red (slow).
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="flex-1 min-h-0">
                  <div className="space-y-1.5 pb-4 pr-2">
                    <PlanTreeNode node={plan} depth={0} executionTime={executionTime} />
                  </div>
                </ScrollArea>

                {/* Legend */}
                <Separator className="my-3" />
                <div className="flex items-center gap-4 flex-wrap">
                  <span className="text-[11px] text-muted-foreground font-medium">
                    Performance:
                  </span>
                  <div className="flex items-center gap-1.5">
                    <div className="size-2.5 rounded-full bg-primary" />
                    <span className="text-[11px] text-muted-foreground">&lt; 1ms (fast)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="size-2.5 rounded-full bg-amber-500" />
                    <span className="text-[11px] text-muted-foreground">1-50ms (moderate)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="size-2.5 rounded-full bg-red-500" />
                    <span className="text-[11px] text-muted-foreground">&gt; 50ms (slow)</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Warnings */}
            {warnings.length > 0 && (
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="size-5 text-amber-500" />
                    <CardTitle className="text-base">Performance Warnings</CardTitle>
                    {criticalCount > 0 && (
                      <Badge variant="destructive" className="text-[10px] gap-1">
                        {criticalCount} Critical
                      </Badge>
                    )}
                    {warningCount > 0 && (
                      <Badge
                        variant="secondary"
                        className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 text-[10px] gap-1"
                      >
                        {warningCount} Warning{warningCount !== 1 ? 's' : ''}
                      </Badge>
                    )}
                  </div>
                  <CardDescription>
                    Issues detected in the query execution plan that may impact performance
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col gap-3">
                    {warnings.map((warning, idx) => (
                      <motion.div
                        key={`${warning.type}-${idx}`}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.05 }}
                        className={`rounded-lg border p-3 ${
                          warning.severity === 'critical'
                            ? 'border-red-500/30 bg-red-500/5 dark:bg-red-500/10'
                            : 'border-amber-500/30 bg-amber-500/5 dark:bg-amber-500/10'
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <div
                            className={`mt-0.5 shrink-0 size-5 rounded flex items-center justify-center ${
                              warning.severity === 'critical'
                                ? 'bg-red-500/20 text-red-600 dark:text-red-400'
                                : 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                            }`}
                          >
                            <AlertTriangle className="size-3" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span
                                className={`text-sm font-medium ${
                                  warning.severity === 'critical'
                                    ? 'text-red-600 dark:text-red-400'
                                    : 'text-amber-600 dark:text-amber-400'
                                }`}
                              >
                                {warning.message}
                              </span>
                              <Badge
                                variant="outline"
                                className={`text-[10px] ${
                                  warning.severity === 'critical'
                                    ? 'border-red-500/30 text-red-600 dark:text-red-400'
                                    : 'border-amber-500/30 text-amber-600 dark:text-amber-400'
                                }`}
                              >
                                {warning.nodeType}
                              </Badge>
                              {warning.relationName && (
                                <Badge variant="secondary" className="text-[10px] font-mono">
                                  {warning.relationName}
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">{warning.detail}</p>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Raw JSON (collapsible) */}
            <Card>
              <CardContent className="p-0">
                <Collapsible>
                  <CollapsibleTrigger asChild>
                    <button className="flex items-center justify-between w-full px-4 py-3 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
                      <span className="flex items-center gap-1.5">
                        <Database className="size-3.5" />
                        Raw EXPLAIN JSON
                      </span>
                      <ChevronDown className="size-3.5" />
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="border-t">
                      <ScrollArea>
                        <pre className="p-4 text-[11px] font-mono text-muted-foreground whitespace-pre-wrap">
                          {JSON.stringify(explainResult, null, 2)}
                        </pre>
                      </ScrollArea>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </CardContent>
            </Card>
          </motion.div>
        </AnimatePresence>
      )}

      {/* Empty state */}
      {!explainResult && !error && !isAnalyzing && (
        <Card>
          <CardContent className="py-10">
            <div className="flex flex-col items-center justify-center text-center">
              <Gauge className="mb-3 size-12 text-muted-foreground/30" />
              <p className="text-sm font-medium text-muted-foreground">Ready to analyze</p>
              <p className="text-xs text-muted-foreground mt-1">
                {isDemo
                  ? 'Click "Explain Analyze" to see a demo execution plan visualization'
                  : 'Enter a query and click "Explain Analyze" to visualize the execution plan'}
              </p>
              {isDemo && (
                <div className="flex flex-col gap-1.5 mt-4">
                  <p className="text-[11px] text-muted-foreground font-medium">
                    Try these demo queries:
                  </p>
                  <button
                    onClick={() => {
                      setQuery(
                        'SELECT * FROM posts WHERE user_id = 1 ORDER BY created_at DESC LIMIT 10;'
                      )
                      setExplainResult(null)
                    }}
                    className="text-[11px] font-mono text-primary hover:underline"
                  >
                    Simple index scan →
                  </button>
                  <button
                    onClick={() => {
                      setQuery(
                        'SELECT p.*, c.content FROM posts p JOIN comments c ON c.post_id = p.id WHERE p.user_id = 1 ORDER BY p.created_at DESC LIMIT 10;'
                      )
                      setExplainResult(null)
                    }}
                    className="text-[11px] font-mono text-primary hover:underline"
                  >
                    JOIN with nested loop →
                  </button>
                  <button
                    onClick={() => {
                      setQuery(
                        'SELECT * FROM audit_logs WHERE user_id = 1 ORDER BY created_at DESC LIMIT 10;'
                      )
                      setExplainResult(null)
                    }}
                    className="text-[11px] font-mono text-primary hover:underline"
                  >
                    Sequential scan (slow!) →
                  </button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

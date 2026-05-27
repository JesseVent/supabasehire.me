'use client'

import { useMemo, useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  Panel,
  type Node,
  type Edge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  BackgroundVariant,
  MarkerType,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import dagre from '@dagrejs/dagre'
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide, forceX, forceY } from 'd3-force'
import { ShieldCheck, ShieldAlert, Key, Link2, TableIcon, LayoutDashboard, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { TableSchema, TableRLSInfo, ColumnInfo, ForeignKeyInfo } from '@/lib/supabase-types'
import { cn } from '@/lib/utils'

// ─── Props ───

export interface SchemaDiagramProps {
  tables: TableSchema[]
  rlsStatuses: TableRLSInfo[]
  selectedTable: string | null
  onSelectTable: (tableName: string | null) => void
}

// ─── Custom Node Data ───

interface TableNodeData extends Record<string, unknown> {
  tableName: string
  columns: ColumnInfo[]
  foreignKeys: ForeignKeyInfo[]
  rlsEnabled: boolean
  rlsUnknown?: boolean
  rlsPoliciesCount: number
  isSelected: boolean
  onSelectTable: (tableName: string | null) => void
}

// ─── Layout Constants ───

const NODE_PADDING_X = 24
const NODE_PADDING_Y = 12
const ROW_HEIGHT = 28
const HEADER_HEIGHT = 40
const FOOTER_HEIGHT = 8
const MIN_NODE_WIDTH = 250
const COLS_PER_ROW = 3
const H_GAP = 80
const V_GAP = 60

// ─── Helpers ───

function calculateNodeWidth(columns: ColumnInfo[]): number {
  if (columns.length === 0) return MIN_NODE_WIDTH
  const maxLen = Math.max(
    ...columns.map((c) => `${c.column_name} ${c.data_type}`.length)
  )
  const estimated = maxLen * 8 + 80 + NODE_PADDING_X
  return Math.max(MIN_NODE_WIDTH, estimated)
}

function calculateNodeHeight(columnCount: number): number {
  return HEADER_HEIGHT + columnCount * ROW_HEIGHT + FOOTER_HEIGHT + NODE_PADDING_Y * 2
}

function getRLSForTable(tableName: string, rlsStatuses: TableRLSInfo[]): TableRLSInfo | undefined {
  return rlsStatuses.find((r) => r.tableName === tableName)
}

// ─── Dagre Auto-Layout ───

function getForceLayoutedElements(
  nodes: Node[],
  edges: Edge[]
): { nodes: Node[]; edges: Edge[] } {
  const width = (node: Node) => (node.style?.width as number) ?? MIN_NODE_WIDTH
  const height = (node: Node) => (node.style?.minHeight as number) ?? 200

  // Seed in a circle — avoids zero-distance singularity
  const spread = Math.sqrt(nodes.length) * 100
  const simNodes = nodes.map((n, i) => ({
    id: n.id,
    x: spread * Math.cos((2 * Math.PI * i) / nodes.length) + (Math.random() - 0.5) * 20,
    y: spread * Math.sin((2 * Math.PI * i) / nodes.length) + (Math.random() - 0.5) * 20,
    w: width(n),
    h: height(n),
  }))

  const idIndex = new Map(simNodes.map((n, i) => [n.id, i]))
  const simLinks = edges
    .map((e) => ({ source: e.source, target: e.target }))
    .filter((l) => idIndex.has(l.source) && idIndex.has(l.target))

  const connectedIds = new Set(simLinks.flatMap((l) => [l.source, l.target]))

  forceSimulation(simNodes)
    .force('link', forceLink(simLinks)
      .id((d) => (d as typeof simNodes[0]).id)
      .distance(220)
      .strength(0.9))
    // Fixed charge — avgSize-proportional was too aggressive for large tables
    .force('charge', forceManyBody().strength(-350).distanceMax(500))
    .force('center', forceCenter(0, 0).strength(0.25))
    .force('collide', forceCollide<typeof simNodes[0]>()
      .radius((n) => Math.max(n.w, n.h) / 2 + 20)
      .strength(0.9))
    // All nodes drift toward center; isolated ones pulled harder
    .force('gx', forceX<typeof simNodes[0]>(0).strength((n) => connectedIds.has(n.id) ? 0.04 : 0.2))
    .force('gy', forceY<typeof simNodes[0]>(0).strength((n) => connectedIds.has(n.id) ? 0.04 : 0.2))
    .alphaDecay(0.02)
    .stop()
    .tick(500)

  return {
    nodes: nodes.map((node, i) => ({
      ...node,
      position: {
        x: simNodes[i].x - width(node) / 2,
        y: simNodes[i].y - height(node) / 2,
      },
    })),
    edges,
  }
}

function getLayoutedElements(
  nodes: Node[],
  edges: Edge[],
  direction: 'LR' | 'TB' = 'TB'
): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: direction, ranksep: 120, nodesep: 60, edgesep: 30 })

  nodes.forEach((node) => {
    const w = (node.style?.width as number) ?? MIN_NODE_WIDTH
    const h = (node.style?.minHeight as number) ?? 200
    g.setNode(node.id, { width: w, height: h })
  })

  edges.forEach((edge) => {
    g.setEdge(edge.source, edge.target)
  })

  dagre.layout(g)

  return {
    nodes: nodes.map((node) => {
      const { x, y } = g.node(node.id)
      const w = (node.style?.width as number) ?? MIN_NODE_WIDTH
      const h = (node.style?.minHeight as number) ?? 200
      return { ...node, position: { x: x - w / 2, y: y - h / 2 } }
    }),
    edges,
  }
}

// ─── Custom Table Node ───

function TableNode({ data }: { data: TableNodeData }) {
  const { tableName, columns, foreignKeys, rlsEnabled, rlsUnknown, rlsPoliciesCount, isSelected, onSelectTable } = data

  const fkColumnSet = useMemo(() => {
    const set = new Set<string>()
    foreignKeys.forEach((fk) => set.add(fk.column_name))
    return set
  }, [foreignKeys])

  const handleClick = useCallback(() => {
    onSelectTable(tableName)
  }, [onSelectTable, tableName])

  const rlsNoPolicies = rlsEnabled && !rlsUnknown && rlsPoliciesCount === 0

  const borderColor = rlsUnknown ? 'border-amber-400/30' : rlsNoPolicies ? 'border-amber-400/30' : rlsEnabled ? 'border-brand/30' : 'border-red-400/30'
  const shadowColor = rlsUnknown ? 'shadow-amber-200/60 dark:shadow-amber-900/40' : rlsNoPolicies ? 'shadow-amber-200/60 dark:shadow-amber-900/40' : rlsEnabled ? 'shadow-black/10' : 'shadow-red-200/60 dark:shadow-red-900/40'
  const bgColor = rlsUnknown
    ? 'bg-amber-50/40 dark:bg-amber-950/10'
    : rlsNoPolicies
      ? 'bg-amber-50/40 dark:bg-amber-950/10'
      : rlsEnabled
          ? 'bg-background'
          : 'bg-red-50/40 dark:bg-red-950/10'
  const pulseClass = rlsNoPolicies ? 'rls-pulse-amber' : (!rlsEnabled && !rlsUnknown) ? 'rls-pulse-red' : ''

  return (
    <div
      className={cn(
        'rounded-lg border shadow-lg overflow-hidden cursor-pointer transition-all duration-200 hover:scale-[1.02] hover:shadow-xl relative',
        borderColor,
        shadowColor,
        bgColor,
        pulseClass,
        isSelected && 'ring-2 ring-primary ring-offset-2 ring-offset-background'
      )}
      onClick={handleClick}
    >
      {/* Handles for edges */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2 !h-2 !bg-muted-foreground !border-0"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!w-2 !h-2 !bg-muted-foreground !border-0"
      />

      {/* Header with gradient */}
      <div
        className={cn(
          'flex items-center justify-between px-3 py-2 border-b',
          rlsUnknown
            ? 'bg-gradient-to-r from-amber-100 to-amber-50 dark:from-amber-900/40 dark:to-amber-900/20 border-amber-200 dark:border-amber-800'
            : rlsNoPolicies
              ? 'bg-gradient-to-r from-amber-100 to-amber-50 dark:from-amber-900/40 dark:to-amber-900/20 border-amber-200 dark:border-amber-800'
              : rlsEnabled
                ? 'bg-gradient-to-r from-brand-100 to-brand-50 dark:from-brand-900/40 dark:to-brand-900/20 border-brand-200 dark:border-brand-800'
                : 'bg-gradient-to-r from-red-100 to-red-50 dark:from-red-900/40 dark:to-red-900/20 border-red-200 dark:border-red-800'
        )}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <TableIcon className="size-3.5 shrink-0 text-foreground/60" />
          <span className="font-bold text-sm text-foreground truncate">{tableName}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0 ml-2">
          {rlsUnknown ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500 text-black px-2 py-0.5 text-[10px] font-semibold">
              <ShieldAlert className="w-3 h-3" />
              RLS ?
            </span>
          ) : rlsNoPolicies ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500 text-black px-2 py-0.5 text-[10px] font-semibold">
              <ShieldAlert className="w-3 h-3" />
              NO RULES
            </span>
          ) : rlsEnabled ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-brand text-black px-2 py-0.5 text-[10px] font-semibold">
              <ShieldCheck className="w-3 h-3" />
              RLS ON
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-500 text-black px-2.5 py-0.5 text-[10px] font-semibold rls-badge-pulse">
              <ShieldAlert className="w-3 h-3" />
              RLS OFF
            </span>
          )}
        </div>
      </div>

      {/* Columns with alternating rows */}
      <div className="px-3 py-1 bg-white dark:bg-background">
        {columns.map((col, index) => {
          const isFk = fkColumnSet.has(col.column_name)
          const isPk = col.column_name === 'id' || col.column_name === `${tableName}_id` || col.column_default?.includes('nextval')

          const typeBadgeClass = rlsUnknown || rlsNoPolicies
            ? 'bg-amber-50 border border-amber-200 text-amber-700 dark:bg-amber-950/20 dark:border-amber-800 dark:text-amber-400'
            : !rlsEnabled
              ? 'bg-red-50 border border-red-200 text-red-700 dark:bg-red-950/20 dark:border-red-800 dark:text-red-400'
              : 'bg-muted/60 border border-border/40 text-muted-foreground'

          return (
            <div
              key={col.column_name}
              className={cn(
                'flex items-center gap-1.5 text-xs leading-7 text-foreground/80 border-b border-border/20 last:border-0',
                index % 2 === 1 && 'bg-black/[0.02] -mx-3 px-3'
              )}
            >
              <span className="w-4 h-4 flex items-center justify-center shrink-0">
                {isPk && <Key className="w-3 h-3 text-amber-500" />}
                {isFk && !isPk && <Link2 className="w-3 h-3 text-blue-500" />}
              </span>
              <span className="font-mono font-medium truncate">{col.column_name}</span>
              <span className="ml-auto shrink-0 pl-2">
                <span className={cn('inline-block rounded-full px-1.5 py-0.5 text-[10px] font-mono', typeBadgeClass)}>
                  {col.data_type}
                </span>
              </span>
              {col.is_nullable === 'YES' && (
                <span className="text-[9px] text-muted-foreground/60 shrink-0">nullable</span>
              )}
            </div>
          )
        })}
      </div>

      {/* Footer: Policy count */}
      <div
        className={cn(
          'px-3 py-1 text-[10px] border-t',
          rlsUnknown
            ? 'bg-amber-50/50 dark:bg-amber-950/10 border-amber-100 dark:border-amber-900/40 text-amber-700 dark:text-amber-400'
            : rlsNoPolicies
              ? 'bg-amber-50/50 dark:bg-amber-950/10 border-amber-100 dark:border-amber-900/40 text-amber-700 dark:text-amber-400'
              : rlsEnabled
                ? 'bg-brand-50/50 dark:bg-brand-950/10 border-brand-100 dark:border-brand-900/40 text-brand-700 dark:text-brand-400'
                : 'bg-red-50/50 dark:bg-red-950/10 border-red-100 dark:border-red-900/40 text-red-700 dark:text-red-400'
        )}
      >
        {rlsUnknown ? 'RLS status unknown' : rlsNoPolicies ? 'RLS on — no policies (all access denied)' : `${rlsPoliciesCount} polic${rlsPoliciesCount === 1 ? 'y' : 'ies'}`}
      </div>

      {/* Subtle shadow gradient at bottom for depth */}
      <div className="absolute bottom-0 left-0 right-0 h-4 bg-gradient-to-t from-black/[0.04] to-transparent pointer-events-none rounded-b-lg" />
    </div>
  )
}

const nodeTypes = { tableNode: TableNode }

// ─── Build Nodes & Edges ───

function buildNodesAndEdges(
  tables: TableSchema[],
  rlsStatuses: TableRLSInfo[],
  onSelectTable: (tableName: string | null) => void
): { nodes: Node<TableNodeData>[]; edges: Edge[] } {
  const nodes: Node<TableNodeData>[] = []
  const edges: Edge[] = []

  // Build nodes with grid layout
  tables.forEach((table, index) => {
    const rls = getRLSForTable(table.tableName, rlsStatuses)
    const rlsEnabled = rls?.rlsEnabled ?? false
    const rlsUnknown = (rls as Record<string, unknown> & { rlsUnknown?: boolean })?.rlsUnknown ?? false
    const policiesCount = rls?.policies.length ?? 0

    const width = calculateNodeWidth(table.columns)
    const height = calculateNodeHeight(table.columns.length)

    const row = Math.floor(index / COLS_PER_ROW)
    const col = index % COLS_PER_ROW
    const x = col * (MIN_NODE_WIDTH + H_GAP) + col * 40
    const y = row * (300 + V_GAP)

    nodes.push({
      id: table.tableName,
      type: 'tableNode',
      position: { x, y },
      data: {
        tableName: table.tableName,
        columns: table.columns,
        foreignKeys: table.foreignKeys,
        rlsEnabled,
        rlsUnknown,
        rlsPoliciesCount: policiesCount,
        isSelected: false,
        onSelectTable,
      },
      style: { width, minHeight: height },
    })
  })

  // Build edges for foreign key relationships
  const tableNameSet = new Set(tables.map((t) => t.tableName))

  tables.forEach((table) => {
    const rls = getRLSForTable(table.tableName, rlsStatuses)
    const rlsEnabled = rls?.rlsEnabled ?? false
    const rlsUnknown = (rls as Record<string, unknown> & { rlsUnknown?: boolean })?.rlsUnknown ?? false
    const edgePoliciesCount = rls?.policies.length ?? 0
    const rlsNoPolicies = rlsEnabled && !rlsUnknown && edgePoliciesCount === 0

    table.foreignKeys.forEach((fk, fkIndex) => {
      // Only draw edge if both tables exist in our diagram
      if (!tableNameSet.has(fk.foreign_table_name)) return

      const edgeId = `${table.tableName}-${fk.column_name}-${fk.foreign_table_name}-${fkIndex}`
      const edgeColor = rlsUnknown || rlsNoPolicies ? '#f59e0b' : rlsEnabled ? '#3ECF8E' : '#ef4444' // amber-500 / brand (#3ECF8E) / red-500

      edges.push({
        id: edgeId,
        source: table.tableName,
        target: fk.foreign_table_name,
        type: 'smoothstep',
        animated: !rlsEnabled || rlsNoPolicies,
        style: {
          stroke: edgeColor,
          strokeWidth: 2,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: edgeColor,
          width: 16,
          height: 16,
        },
        label: fk.column_name,
        labelStyle: {
          fontSize: 10,
          fontWeight: 600,
          fill: edgeColor,
        },
        labelBgStyle: {
          fill: 'var(--background)',
          fillOpacity: 0.85,
        },
        labelBgPadding: [4, 2] as [number, number],
        labelBgBorderRadius: 4,
      })
    })
  })

  return { nodes, edges }
}

// ─── Inner Diagram with ReactFlow hooks ───

function SchemaDiagramInner({
  tables,
  rlsStatuses,
  selectedTable,
  onSelectTable,
}: SchemaDiagramProps) {
  const { fitView } = useReactFlow()
  const hasAnimated = useRef(false)
  const [layoutMode, setLayoutMode] = useState<'TB' | 'LR' | 'Force'>('TB')
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)

  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => buildNodesAndEdges(tables, rlsStatuses, onSelectTable),
    // selectedTable deliberately excluded — selection is applied as a separate
    // derived pass below so clicking a table never triggers a layout rebuild
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tables, rlsStatuses]
  )

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  const applyLayout = useCallback((mode: 'TB' | 'LR' | 'Force', nds: Node[], edgs: Edge[]) => {
    if (mode === 'Force') {
      return getForceLayoutedElements(nds, edgs).nodes
    }
    return getLayoutedElements(nds, edgs, mode).nodes
  }, [])

  const handleAutoLayout = useCallback(() => {
    const next: 'TB' | 'LR' | 'Force' = layoutMode === 'TB' ? 'LR' : layoutMode === 'LR' ? 'Force' : 'TB'
    setLayoutMode(next)
    setNodes((nds) => applyLayout(next, nds, edges) as typeof nds)
    setTimeout(() => fitView({ padding: 0.2, duration: 500 }), 50)
  }, [layoutMode, edges, setNodes, fitView, applyLayout])

  // Update nodes/edges when input data changes
  useEffect(() => {
    setNodes(initialNodes)
    setEdges(initialEdges)
  }, [initialNodes, initialEdges, setNodes, setEdges])

  // Apply layout on first render and when tables change, then fit view
  useEffect(() => {
    const layouted = applyLayout(layoutMode, initialNodes, initialEdges)
    setNodes(layouted as typeof initialNodes)
    const timer = setTimeout(() => {
      fitView({ padding: 0.25, duration: 500 })
      hasAnimated.current = true
    }, 80)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tables.length, applyLayout])

  const onPaneClick = useCallback(() => {
    onSelectTable(null)
    setHoveredNodeId(null)
  }, [onSelectTable])

  // Dim/highlight edges based on hovered node
  const displayEdges = useMemo(() => {
    if (!hoveredNodeId) return edges
    return edges.map((edge) => {
      const isConnected = edge.source === hoveredNodeId || edge.target === hoveredNodeId
      return {
        ...edge,
        style: {
          ...edge.style,
          opacity: isConnected ? 1 : 0.08,
          strokeWidth: isConnected ? 3 : 1,
        },
        animated: isConnected && (edge.animated ?? false),
      }
    })
  }, [edges, hoveredNodeId])

  const onNodeMouseEnter = useCallback((_: ReactMouseEvent, node: Node) => {
    setHoveredNodeId(node.id)
  }, [])

  const onNodeMouseLeave = useCallback(() => {
    setHoveredNodeId(null)
  }, [])

  // Apply selection state as a cheap derived pass — never triggers a layout rebuild
  const nodesWithSelection = useMemo(
    () => nodes.map((n) => ({
      ...n,
      data: { ...n.data, isSelected: n.id === selectedTable },
    })),
    [nodes, selectedTable]
  )

  const [showHint, setShowHint] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('schema-hint-dismissed') !== 'true'
  })

  const dismissHint = useCallback(() => {
    setShowHint(false)
    localStorage.setItem('schema-hint-dismissed', 'true')
  }, [])

  if (tables.length === 0) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px] text-muted-foreground">
        <div className="text-center space-y-3">
          <div className="text-5xl">📊</div>
          <p className="text-lg font-medium">No schema loaded</p>
          <p className="text-sm">Connect to a Supabase project and fetch the schema to visualize your database.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full h-full min-h-[500px]" style={{ height: '100%', backgroundColor: '#ffffff' }}>
      <ReactFlow
        nodes={nodesWithSelection}
        edges={displayEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onPaneClick={onPaneClick}
        onNodeMouseEnter={onNodeMouseEnter}
        onNodeMouseLeave={onNodeMouseLeave}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        minZoom={0.1}
        maxZoom={2}
        attributionPosition="bottom-left"
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1.2} color="var(--border)" style={{ backgroundColor: '#ffffff' }} />
        <Controls position="bottom-right" />
        <Panel position="top-left">
          <Button
            size="sm"
            variant="secondary"
            onClick={handleAutoLayout}
            className="gap-1.5 text-xs shadow-md"
            title="Cycle layout: Top→Bottom → Left→Right → Force"
          >
            <LayoutDashboard className="size-3.5" />
            {layoutMode === 'TB' ? 'Top → Bottom' : layoutMode === 'LR' ? 'Left → Right' : 'Force'}
          </Button>
        </Panel>

        {showHint && (
          <Panel position="top-center">
            <div className="flex items-center gap-3 rounded-lg border bg-background/95 backdrop-blur-sm shadow-md px-3 py-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="inline-block size-2.5 rounded-sm border border-brand/30 shadow-sm shadow-emerald-200/60 bg-background shrink-0" />
                RLS on + policies
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block size-2.5 rounded-sm border border-amber-400/30 shadow-sm shadow-amber-200/60 bg-amber-50/40 shrink-0" />
                RLS on, no policies
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block size-2.5 rounded-sm border border-red-400/30 shadow-sm shadow-red-200/60 bg-red-50/40 shrink-0" />
                No RLS — security risk
              </span>
              <span className="text-border">·</span>
              <span>Hover a table to trace FK relationships</span>
              <button
                onClick={dismissHint}
                className="ml-1 rounded p-0.5 hover:bg-muted transition-colors"
                aria-label="Dismiss hint"
              >
                <X className="size-3" />
              </button>
            </div>
          </Panel>
        )}

        <MiniMap
          position="bottom-right"
          nodeColor={(node) => {
            const data = node.data as TableNodeData | undefined
            if ((data as Record<string, unknown> & { rlsUnknown?: boolean })?.rlsUnknown) return '#f59e0b'
            if (data?.rlsEnabled && data?.rlsPoliciesCount === 0) return '#f59e0b'
            if (data?.rlsEnabled) return '#3ECF8E'
            return '#ef4444'
          }}
          maskColor="rgba(0,0,0,0.1)"
          style={{ borderRadius: 8 }}
        />
      </ReactFlow>
    </div>
  )
}

// ─── Main Component (wrapped in ReactFlowProvider) ───

export function SchemaDiagram(props: SchemaDiagramProps) {
  return (
    <ReactFlowProvider>
      <SchemaDiagramInner {...props} />
    </ReactFlowProvider>
  )
}

export default SchemaDiagram

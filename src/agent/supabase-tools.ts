/**
 * Supabase-aware custom tools for the Page Agent.
 *
 * These tools let the agent call the existing API routes directly,
 * bypassing DOM operations for structured data tasks like:
 * - Executing SQL queries
 * - Inspecting schemas
 * - Checking RLS policies
 * - Browsing storage
 * - Listing edge functions
 */
import { z } from 'zod/v4'
import { connectionHeaders } from '@/lib/api-auth'

// Re-export the tool helper — we define our own type to avoid
// importing from page-agent at module level (browser-only).
export interface SupabaseTool<TParams = unknown> {
	description: string
	inputSchema: z.ZodType<TParams>
	execute: (args: TParams, getConnection: () => Promise<ConnectionData>) => Promise<string>
}

export function supabaseTool<TParams>(
	options: SupabaseTool<TParams>
): SupabaseTool<TParams> {
	return options
}

// ─── Connection Data ───

export interface ConnectionData {
	supabaseUrl: string
	anonKey: string
	serviceRoleKey: string | null
	accessToken: string | null
}

// ─── Helper ───

async function apiPost(path: string, connection: ConnectionData, body?: Record<string, unknown>) {
	// Connection credentials go in headers — not the body.
	// This keeps them out of request body logs/payloads.
	const conn: import('@/lib/supabase-types').SupabaseConnection = {
		id: '',
		name: '',
		supabaseUrl: connection.supabaseUrl,
		anonKey: connection.anonKey,
		serviceRoleKey: connection.serviceRoleKey,
		accessToken: connection.accessToken,
		s3KeyId: null,
		s3Secret: null,
		s3Warehouse: null,
		createdAt: '',
		updatedAt: '',
	}
	const res = await fetch(path, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			...connectionHeaders(conn),
		},
		body: JSON.stringify(body ?? {}),
	})
	const data = await res.json()
	if (!res.ok) {
		throw new Error(data.error || `API error ${res.status}`)
	}
	return data
}

// ─── EXPLAIN helpers (subset of query-analyzer logic, no React deps) ───

interface PlanNode {
	'Node Type': string
	'Relation Name'?: string
	'Actual Total Time'?: number
	'Actual Rows'?: number
	'Actual Loops'?: number
	'Rows Removed by Filter'?: number
	'Sort Space Used'?: number
	'Sort Space Type'?: string
	'Sort Method'?: string
	'Shared Hit Blocks'?: number
	'Shared Read Blocks'?: number
	'Total Cost'?: number
	Plans?: PlanNode[]
}

interface ExplainResult {
	Plan: PlanNode
	'Planning Time'?: number
	'Execution Time'?: number
}

interface ExplainWarning {
	type: 'seq_scan' | 'high_cost' | 'nested_loop' | 'sort_memory' | 'low_hit_ratio'
	severity: 'warning' | 'critical'
	message: string
	detail: string
	relationName?: string
}

function collectBuffers(node: PlanNode): { hit: number; read: number } {
	let hit = node['Shared Hit Blocks'] ?? 0
	let read = node['Shared Read Blocks'] ?? 0
	for (const child of node.Plans ?? []) {
		const c = collectBuffers(child)
		hit += c.hit
		read += c.read
	}
	return { hit, read }
}

function collectWarnings(node: PlanNode, totalMs?: number): ExplainWarning[] {
	const w: ExplainWarning[] = []
	const type = node['Node Type']
	const time = node['Actual Total Time'] ?? 0
	const rel = node['Relation Name']

	if (type === 'Seq Scan') {
		const removed = node['Rows Removed by Filter'] ?? 0
		const rows = node['Actual Rows'] ?? 0
		if (rows > 1000 || removed > 1000) {
			w.push({
				type: 'seq_scan',
				severity: removed > 10000 ? 'critical' : 'warning',
				message: `Sequential scan on ${rel ?? 'table'}`,
				detail: `Scanned ${rows + removed} rows, removed ${removed} by filter. Consider adding an index.`,
				relationName: rel,
			})
		}
	}

	if (time > 100) {
		w.push({
			type: 'high_cost',
			severity: time > 500 ? 'critical' : 'warning',
			message: `Slow ${type}`,
			detail: `${time.toFixed(2)}ms${totalMs ? ` (${((time / totalMs) * 100).toFixed(1)}% of query)` : ''}`,
			relationName: rel,
		})
	}

	if (type === 'Nested Loop') {
		const loops = node['Actual Loops'] ?? 1
		const rows = node['Actual Rows'] ?? 0
		if (loops > 1 && rows > 100) {
			w.push({
				type: 'nested_loop',
				severity: rows > 1000 ? 'critical' : 'warning',
				message: 'Nested loop with high row count',
				detail: `${loops} loops × ${rows} rows. Consider a hash or merge join.`,
			})
		}
	}

	if ((type === 'Sort' || type === 'Incremental Sort') && node['Sort Space Used']) {
		const kb = node['Sort Space Used']
		if (node['Sort Space Type'] === 'Disk') {
			w.push({
				type: 'sort_memory',
				severity: 'critical',
				message: 'Sort spilled to disk',
				detail: `${kb}KB written to disk. Increase work_mem or add a covering index.`,
			})
		} else if (kb > 1024) {
			w.push({
				type: 'sort_memory',
				severity: 'warning',
				message: 'Sort using high memory',
				detail: `${kb}KB in memory (${node['Sort Method'] ?? 'unknown'} method).`,
			})
		}
	}

	const hit = node['Shared Hit Blocks'] ?? 0
	const read = node['Shared Read Blocks'] ?? 0
	if (hit + read > 100) {
		const ratio = hit / (hit + read)
		if (ratio < 0.9) {
			w.push({
				type: 'low_hit_ratio',
				severity: ratio < 0.5 ? 'critical' : 'warning',
				message: `Low buffer hit ratio on ${rel ?? type}`,
				detail: `${(ratio * 100).toFixed(1)}% hits (${hit} hits / ${read} reads). Consider increasing shared_buffers.`,
				relationName: rel,
			})
		}
	}

	for (const child of node.Plans ?? []) {
		w.push(...collectWarnings(child, totalMs ?? time))
	}
	return w
}

// ─── Tool Definitions ───

export const executeSQL = supabaseTool({
	description:
		'Execute a SQL query on the connected Supabase database. ' +
		'Returns the query results as JSON. Use this for SELECT, INSERT, UPDATE, DELETE, DDL, etc. ' +
		'Prefer this over clicking through the UI for data operations.',
	inputSchema: z.object({
		query: z.string().describe('The SQL query to execute'),
	}),
	execute: async (input, getConnection) => {
		const conn = await getConnection()
		const result = await apiPost('/api/sql', conn, { query: input.query })
		if (result.error) {
			return `SQL Error: ${result.error}`
		}
		const data = result.data
		// Truncate large results
		const str = JSON.stringify(data, null, 2)
		if (str.length > 8000) {
			return str.slice(0, 8000) + '\n... (result truncated)'
		}
		return `Query executed successfully.\n\`\`\`json\n${str}\n\`\`\``
	},
})

export const getSchema = supabaseTool({
	description:
		'Get the full database schema of the connected Supabase project. ' +
		'Returns all tables with their columns, types, foreign keys, and defaults.',
	inputSchema: z.object({
		tableName: z
			.string()
			.optional()
			.describe('Optional table name to filter. If omitted, returns all tables.'),
	}),
	execute: async (input, getConnection) => {
		const conn = await getConnection()
		const result = await apiPost('/api/schema', conn)
		if (result.error) {
			return `Schema Error: ${result.error}`
		}
		let tables = result.tables || []
		if (input.tableName) {
			tables = tables.filter(
				(t: { tableName: string }) =>
					t.tableName.toLowerCase() === input.tableName!.toLowerCase()
			)
		}
		if (tables.length === 0) {
			return input.tableName
				? `Table "${input.tableName}" not found.`
				: 'No tables found in the database.'
		}
		// Format schema summary
		const lines: string[] = []
		for (const table of tables) {
			lines.push(`\n### ${table.tableName}`)
			if (table.columns) {
				for (const col of table.columns) {
					const nullable = col.is_nullable === 'YES' ? 'nullable' : 'NOT NULL'
					const def = col.column_default ? ` default ${col.column_default}` : ''
					lines.push(
						`  - ${col.column_name}: ${col.data_type} (${nullable}${def})`
					)
				}
			}
			if (table.foreignKeys?.length > 0) {
				lines.push('  Foreign keys:')
				for (const fk of table.foreignKeys) {
					lines.push(
						`    ${fk.column_name} → ${fk.foreign_table_name}.${fk.foreign_column_name}`
					)
				}
			}
		}
		const output = lines.join('\n')
		if (output.length > 8000) {
			return output.slice(0, 8000) + '\n... (result truncated)'
		}
		return `Database schema:\n${output}`
	},
})

export const getRLSPolicies = supabaseTool({
	description:
		'Get RLS (Row Level Security) policy information for the database. ' +
		'Returns which tables have RLS enabled/disabled and their policies.',
	inputSchema: z.object({
		tableName: z
			.string()
			.optional()
			.describe('Optional table name to filter.'),
	}),
	execute: async (input, getConnection) => {
		const conn = await getConnection()
		const result = await apiPost('/api/rls', conn)
		if (result.error) {
			return `RLS Error: ${result.error}`
		}
		let tables = result.tables || []
		if (input.tableName) {
			tables = tables.filter(
				(t: { tableName: string }) =>
					t.tableName.toLowerCase() === input.tableName!.toLowerCase()
			)
		}
		const lines: string[] = []
		for (const table of tables) {
			const status = table.rlsEnabled ? 'RLS ENABLED' : 'RLS DISABLED'
			const unknown = table.rlsUnknown ? ' (unknown - needs Management API token)' : ''
			lines.push(`\n### ${table.tableName} — ${status}${unknown}`)
			if (table.policies?.length > 0) {
				for (const p of table.policies) {
					lines.push(
						`  Policy "${p.policyname}": ${p.permissive} ${p.cmd}` +
							(p.qual ? `\n    USING: ${p.qual}` : '') +
							(p.with_check ? `\n    WITH CHECK: ${p.with_check}` : '')
					)
				}
			} else {
				lines.push('  No policies defined.')
			}
		}
		const output = lines.join('\n')
		return `RLS Status:\n${output || 'No tables found.'}`
	},
})

export const listStorageBuckets = supabaseTool({
	description:
		'List storage buckets and optionally their files from the Supabase project.',
	inputSchema: z.object({
		bucketId: z
			.string()
			.optional()
			.describe('Optional bucket ID. If provided, lists files in that bucket.'),
		path: z
			.string()
			.optional()
			.describe('Optional folder path within the bucket.'),
	}),
	execute: async (input, getConnection) => {
		const conn = await getConnection()
		const result = await apiPost('/api/storage', conn, {
			bucketId: input.bucketId,
			path: input.path,
		})
		if (result.error) {
			return `Storage Error: ${result.error}`
		}
		return `Storage:\n\`\`\`json\n${JSON.stringify(result, null, 2).slice(0, 6000)}\n\`\`\``
	},
})

export const listEdgeFunctions = supabaseTool({
	description: 'List all edge functions deployed in the Supabase project.',
	inputSchema: z.object({}),
	execute: async (_input, getConnection) => {
		const conn = await getConnection()
		const result = await apiPost('/api/edge-functions', conn)
		if (result.error) {
			return `Edge Functions Error: ${result.error}`
		}
		const fns = result.functions || []
		if (fns.length === 0) {
			return 'No edge functions found.'
		}
		const lines = fns.map(
			(f: { name: string; status: string; version: number }) =>
				`  - ${f.name} (v${f.version}, status: ${f.status})`
		)
		return `Edge Functions (${fns.length}):\n${lines.join('\n')}`
	},
})

export const getProjectInfo = supabaseTool({
	description:
		'Get project information including database size, region, and status.',
	inputSchema: z.object({}),
	execute: async (_input, getConnection) => {
		const conn = await getConnection()
		const result = await apiPost('/api/project', conn)
		if (result.error) {
			return `Project Info Error: ${result.error}`
		}
		return `Project Info:\n\`\`\`json\n${JSON.stringify(result, null, 2).slice(0, 4000)}\n\`\`\``
	},
})

export const getDatabaseIndexes = supabaseTool({
	description: 'Get database index usage statistics.',
	inputSchema: z.object({}),
	execute: async (_input, getConnection) => {
		const conn = await getConnection()
		const result = await apiPost('/api/database/indexes', conn)
		if (result.error) {
			return `Index Error: ${result.error}`
		}
		return `Database Indexes:\n\`\`\`json\n${JSON.stringify(result, null, 2).slice(0, 6000)}\n\`\`\``
	},
})

export const getDatabaseTriggers = supabaseTool({
	description: 'List all database triggers.',
	inputSchema: z.object({}),
	execute: async (_input, getConnection) => {
		const conn = await getConnection()
		const result = await apiPost('/api/database/triggers', conn)
		if (result.error) {
			return `Triggers Error: ${result.error}`
		}
		return `Database Triggers:\n\`\`\`json\n${JSON.stringify(result, null, 2).slice(0, 6000)}\n\`\`\``
	},
})

export const getViewsAndFunctions = supabaseTool({
	description: 'List all views and stored functions in the database.',
	inputSchema: z.object({}),
	execute: async (_input, getConnection) => {
		const conn = await getConnection()
		const result = await apiPost('/api/database/views-functions', conn)
		if (result.error) {
			return `Views/Functions Error: ${result.error}`
		}
		return `Views & Functions:\n\`\`\`json\n${JSON.stringify(result, null, 2).slice(0, 6000)}\n\`\`\``
	},
})

export const explainQuery = supabaseTool({
	description:
		'Run EXPLAIN (ANALYZE, BUFFERS) on a SQL query and return a structured performance analysis. ' +
		'Reports execution time, planning time, buffer hit ratio, and any detected issues: ' +
		'sequential scans, high-cost nodes, nested loop N+1s, disk-spilling sorts, low cache hit ratio. ' +
		'Includes concrete fix suggestions. Use this when the user reports a slow query or asks how to ' +
		'optimize a query — then follow up with execute_sql to apply index recommendations.',
	inputSchema: z.object({
		query: z.string().describe('The SQL SELECT/UPDATE/DELETE to analyze (no DDL, no semicolon required)'),
	}),
	execute: async (input, getConnection) => {
		const conn = await getConnection()
		const base = input.query.replace(/;\s*$/, '')
		const result = await apiPost('/api/sql', conn, {
			query: `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${base}`,
		})
		if (result.error) {
			return `EXPLAIN Error: ${result.error}`
		}

		// Postgres returns: [{ "QUERY PLAN": [ExplainResult] }]
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const plan: ExplainResult | undefined = (result.data as any[])?.[0]?.['QUERY PLAN']?.[0]
		if (!plan) return 'Could not parse EXPLAIN output.'

		const execMs = plan['Execution Time'] ?? 0
		const planMs = plan['Planning Time'] ?? 0
		const root = plan.Plan
		const bufs = collectBuffers(root)
		const totalBufs = bufs.hit + bufs.read
		const hitPct = totalBufs > 0 ? ((bufs.hit / totalBufs) * 100).toFixed(1) : '100.0'
		const warnings = collectWarnings(root, execMs)

		const lines: string[] = [
			`## Query Plan`,
			`- Execution: ${execMs.toFixed(3)}ms  Planning: ${planMs.toFixed(3)}ms`,
			`- Root node: ${root['Node Type']} (total cost ${root['Total Cost']?.toFixed(2)})`,
			`- Buffer hit ratio: ${hitPct}% (${bufs.hit} hits / ${bufs.read} reads)`,
		]

		if (warnings.length === 0) {
			lines.push('\nNo performance issues detected.')
		} else {
			lines.push(`\n## Issues (${warnings.length})`)
			for (const w of warnings) {
				lines.push(`- [${w.severity.toUpperCase()}] ${w.message}: ${w.detail}`)
			}

			const suggestions = new Set<string>()
			for (const w of warnings) {
				if (w.type === 'seq_scan' && w.relationName) {
					suggestions.add(
						`Add an index on the filtered column(s) of \`${w.relationName}\` to eliminate the sequential scan.`
					)
				}
				if (w.type === 'sort_memory') {
					suggestions.add(
						'Increase `work_mem` or add a covering index with the sort columns to avoid disk spill.'
					)
				}
				if (w.type === 'nested_loop') {
					suggestions.add(
						'Ensure join columns are indexed; consider rewriting with a hash join if row counts are large.'
					)
				}
				if (w.type === 'low_hit_ratio') {
					suggestions.add(
						'Low buffer cache hit — increase `shared_buffers` or warm the cache with a dry-run query.'
					)
				}
			}
			if (suggestions.size > 0) {
				lines.push('\n## Suggestions')
				for (const s of suggestions) lines.push(`- ${s}`)
			}
		}

		return lines.join('\n')
	},
})

// ─── All Supabase Tools Map ───

export const supabaseTools: Record<string, SupabaseTool<any>> = {
	execute_sql: executeSQL,
	get_schema: getSchema,
	get_rls_policies: getRLSPolicies,
	list_storage: listStorageBuckets,
	list_edge_functions: listEdgeFunctions,
	get_project_info: getProjectInfo,
	get_indexes: getDatabaseIndexes,
	get_triggers: getDatabaseTriggers,
	get_views_functions: getViewsAndFunctions,
	explain_query: explainQuery,
}

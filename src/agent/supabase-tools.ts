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
	const res = await fetch(path, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body ? { connection, ...body } : { connection }),
	})
	const data = await res.json()
	if (!res.ok) {
		throw new Error(data.error || `API error ${res.status}`)
	}
	return data
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
}

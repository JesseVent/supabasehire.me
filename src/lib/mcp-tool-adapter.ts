/**
 * Convert JSON Schema (as returned by MCP tools/list) to a Zod schema.
 *
 * Focused on the subset used by the Supabase MCP server: strings, numbers,
 * booleans, arrays, objects, enums, unions (anyOf), and optionality.
 * Ported from supa-agent's mcpToolAdapter.ts.
 */
import { z } from 'zod'
import type { SupabaseMcpClient } from './supabase-mcp-client'

function jsonSchemaToZod(schema: unknown, required = true): z.ZodType {
  if (schema === null || schema === undefined) return z.any()

  const s = schema as Record<string, unknown>

  const anyOf = (s.anyOf ?? s.oneOf) as Record<string, unknown>[] | undefined
  if (anyOf?.length) {
    const variants = anyOf.map((v) => jsonSchemaToZod(v, true))
    let type: z.ZodType = z.union(variants as [z.ZodType, z.ZodType, ...z.ZodType[]])
    type = applyMeta(type, s)
    return required ? type : type.optional()
  }

  const enumValues = s.enum as (string | number)[] | undefined
  if (enumValues?.length && s.type === 'string') {
    let type: z.ZodType = z.enum(enumValues as [string, ...string[]])
    type = applyMeta(type, s)
    return required ? type : type.optional()
  }

  let type: z.ZodType

  switch (s.type) {
    case 'string':
      type = z.string()
      break
    case 'number':
    case 'integer':
      type = z.number()
      break
    case 'boolean':
      type = z.boolean()
      break
    case 'array': {
      const itemSchema = jsonSchemaToZod(s.items, true)
      type = z.array(itemSchema)
      break
    }
    case 'object': {
      const props = (s.properties ?? {}) as Record<string, unknown>
      const requiredKeys = new Set((s.required as string[]) ?? [])
      const shape: Record<string, z.ZodType> = {}
      for (const [key, val] of Object.entries(props)) {
        shape[key] = jsonSchemaToZod(val, requiredKeys.has(key))
      }
      type = z.object(shape)
      break
    }
    case 'null':
      type = z.null()
      break
    default:
      type = z.any()
  }

  type = applyMeta(type, s)

  if (s.nullable === true) {
    type = z.union([type, z.null()])
  }

  return required ? type : type.optional()
}

function applyMeta(zodType: z.ZodType, schema: Record<string, unknown>): z.ZodType {
  if (typeof schema.description === 'string') {
    zodType = zodType.describe(schema.description)
  }
  return zodType
}

export interface McpAdaptedTool {
  description: string
  inputSchema: z.ZodType
  execute: (args: unknown) => Promise<string>
}

/**
 * Fetch the tool list from the MCP server directly (server-side use only).
 */
export async function adaptMcpTools(
  client: SupabaseMcpClient
): Promise<Record<string, McpAdaptedTool>> {
  const mcpTools = await client.listTools()
  const adapted: Record<string, McpAdaptedTool> = {}

  for (const tool of mcpTools) {
    const inputSchema = jsonSchemaToZod(tool.inputSchema, true)
    const name = tool.name

    adapted[name] = {
      description: tool.description ?? '',
      inputSchema,
      execute: async (args: unknown): Promise<string> => {
        return client.callTool(name, args as Record<string, unknown>)
      },
    }
  }

  return adapted
}

/**
 * Fetch MCP tools via the Next.js server-side proxy routes (avoids CORS).
 * Each tool's execute function calls POST /api/mcp/tool server-side.
 *
 * `connection` must include at minimum supabaseUrl, accessToken, anonKey, serviceRoleKey.
 */
export async function adaptMcpToolsViaApi(connection: {
  supabaseUrl: string
  anonKey: string
  serviceRoleKey: string | null
  accessToken: string | null
  [key: string]: unknown
}): Promise<Record<string, McpAdaptedTool>> {
  const { connectionHeaders } = await import('@/lib/api-auth')

  const conn = {
    id: '',
    name: '',
    supabaseUrl: connection.supabaseUrl,
    anonKey: connection.anonKey,
    serviceRoleKey: connection.serviceRoleKey,
    accessToken: connection.accessToken,
    refreshToken: (connection.refreshToken as string | null) ?? null,
    s3KeyId: null,
    s3Secret: null,
    s3Warehouse: null,
    createdAt: '',
    updatedAt: '',
  }

  const headers = {
    'Content-Type': 'application/json',
    ...connectionHeaders(conn),
  }

  const res = await fetch('/api/mcp/tools', { method: 'POST', headers })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error ?? `MCP tools fetch failed (${res.status})`)
  }

  const { tools } = (await res.json()) as {
    tools: { name: string; description?: string; inputSchema: Record<string, unknown> }[]
  }
  const adapted: Record<string, McpAdaptedTool> = {}

  for (const tool of tools) {
    const inputSchema = jsonSchemaToZod(tool.inputSchema, true)
    const name = tool.name

    adapted[name] = {
      description: tool.description ?? '',
      inputSchema,
      execute: async (args: unknown): Promise<string> => {
        const execRes = await fetch('/api/mcp/tool', {
          method: 'POST',
          headers,
          body: JSON.stringify({ name, args }),
        })
        const data = await execRes.json().catch(() => ({ error: 'Invalid response' }))
        if (!execRes.ok) throw new Error(data.error ?? `Tool "${name}" failed`)
        return typeof data.result === 'string' ? data.result : JSON.stringify(data.result)
      },
    }
  }

  return adapted
}

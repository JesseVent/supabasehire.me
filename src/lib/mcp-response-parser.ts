/**
 * Parse MCP `execute_sql` response from the hosted Supabase MCP server.
 *
 * The hosted server wraps SQL results in security boundaries:
 *   <untrusted-data-uuid>
 *   [{"col":"val"},...]
 *   </untrusted-data-uuid>
 *
 * This parser extracts the JSON payload from within those tags, then falls
 * back to the plain formats (raw array, { rows: [...] }, { data: [...] }).
 */
export function parseMcpSqlRows<T>(raw: string): T[] {
  // 1. Try to extract JSON from <untrusted-data-...> boundaries
  const startMatch = raw.match(/<untrusted-data-[\w-]+>\s*/)
  const endMatch = raw.match(/\s*<\/untrusted-data-[\w-]+>/)

  let payload = raw
  if (startMatch && endMatch) {
    const startIdx = startMatch.index! + startMatch[0].length
    const endIdx = endMatch.index!
    if (endIdx > startIdx) {
      payload = raw.slice(startIdx, endIdx).trim()
    }
  }

  // 2. Try to parse the extracted (or full) payload as JSON
  try {
    const parsed = JSON.parse(payload)
    if (Array.isArray(parsed)) return parsed as T[]
    if (Array.isArray(parsed?.rows)) return parsed.rows as T[]
    if (Array.isArray(parsed?.data)) return parsed.data as T[]
  } catch {
    /* ignore */
  }

  return []
}

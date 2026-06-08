/**
 * Parse MCP `execute_sql` response from the hosted Supabase MCP server.
 *
 * The hosted server returns results wrapped in a JSON object:
 *   {"result":"Below is the result of the SQL query...\n\n<untrusted-data-uuid>\n[{\"col\":\"val\"},...]\n</untrusted-data-uuid>\n\n..."}
 *
 * This parser:
 *   1. Unwraps the {"result":"..."} layer if present.
 *   2. Finds the <untrusted-data-...> block and parses the JSON inside.
 *   3. Falls back to plain formats (raw array, { rows: [...] }, { data: [...] }).
 */
export function parseMcpSqlRows<T>(raw: string): T[] {
  let text = raw

  // 1. Unwrap {"result":"..."} if present (hosted MCP wraps text in this)
  try {
    const parsed = JSON.parse(raw)
    if (typeof parsed?.result === 'string') {
      text = parsed.result
    }
  } catch {
    // not JSON — use raw as-is
  }

  // 2. Try each <untrusted-data-...> block (there may be multiple mentions in text)
  const openingRegex = /<untrusted-data-[\w-]+>\s*/g
  let match
  while ((match = openingRegex.exec(text)) !== null) {
    const startIdx = match.index + match[0].length
    const nextClosing = text.slice(startIdx).match(/<\/untrusted-data-[\w-]+>/)
    if (nextClosing && nextClosing.index !== undefined) {
      const endIdx = startIdx + nextClosing.index
      const payload = text.slice(startIdx, endIdx).trim()
      try {
        const parsed = JSON.parse(payload)
        if (Array.isArray(parsed)) return parsed as T[]
        if (Array.isArray(parsed?.rows)) return parsed.rows as T[]
        if (Array.isArray(parsed?.data)) return parsed.data as T[]
      } catch {
        // try next opening tag
      }
    }
  }

  // 3. Fallback: try to parse the (unwrapped) payload as JSON directly
  try {
    const parsed = JSON.parse(text)
    if (Array.isArray(parsed)) return parsed as T[]
    if (Array.isArray(parsed?.rows)) return parsed.rows as T[]
    if (Array.isArray(parsed?.data)) return parsed.data as T[]
  } catch {
    /* ignore */
  }

  return []
}

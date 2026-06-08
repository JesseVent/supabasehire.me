/**
 * Parse MCP `execute_sql` response from the hosted Supabase MCP server.
 *
 * The hosted server wraps SQL results in security boundaries:
 *   <untrusted-data-uuid>
 *   [{"col":"val"},...]
 *   </untrusted-data-uuid>
 *
 * This parser finds ALL opening tags, tries to parse the content between each
 * opening tag and the next closing tag, and returns the first successful parse.
 * Falls back to the plain formats (raw array, { rows: [...] }, { data: [...] }).
 */
export function parseMcpSqlRows<T>(raw: string): T[] {
  // 1. Try each <untrusted-data-...> block (there may be multiple mentions in text)
  const openingRegex = /<untrusted-data-[\w-]+>\s*/g
  let match
  while ((match = openingRegex.exec(raw)) !== null) {
    const startIdx = match.index + match[0].length
    const nextClosing = raw.slice(startIdx).match(/<\/untrusted-data-[\w-]+>/)
    if (nextClosing && nextClosing.index !== undefined) {
      const endIdx = startIdx + nextClosing.index
      const payload = raw.slice(startIdx, endIdx).trim()
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

  // 2. Fallback: try to parse the full payload as JSON
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed as T[]
    if (Array.isArray(parsed?.rows)) return parsed.rows as T[]
    if (Array.isArray(parsed?.data)) return parsed.data as T[]
  } catch {
    /* ignore */
  }

  return []
}

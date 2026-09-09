import type { SQLQueryResult } from '@/lib/supabase-types'

/**
 * MCP wraps a Postgres failure in `{"error":{"name":...,"message":"Failed to run
 * sql query: ERROR: ..."}}`. Unwrap it so the UI shows the Postgres error, not JSON.
 */
export function unwrapMcpError(text: string): string {
  try {
    const message = (JSON.parse(text) as { error?: { message?: unknown } })?.error?.message
    if (typeof message === 'string' && message.trim()) {
      return message.replace(/^Failed to run sql query:\s*/i, '').trim()
    }
  } catch {
    // not JSON — already readable
  }
  return text
}

/**
 * The `ai_*` functions ship in the supa_aisql extension, not in stock Postgres, so a
 * project without it fails every AI demo with a bare 42883. Say how to install it.
 */
export function withAiInstallHint(result: SQLQueryResult): SQLQueryResult {
  if (result.success || !result.error) return result
  if (!/function\s+(public\.)?ai_\w+.*does not exist/i.test(result.error)) return result
  return {
    ...result,
    error: `${result.error}\n\nThe ai_* functions come from the supa_aisql extension, which is not installed on this project. Install it with:\n\n  select dbdev.install('JesseVent/supa_aisql');\n  create extension "JesseVent/supa_aisql";\n\nRequires database.dev to be enabled — see https://database.dev/installer`,
  }
}

/** Postgres errors carry LINE/HINT detail — a toast only has room for the headline. */
export function firstLine(error: string | undefined): string {
  return error?.split('\n')[0]?.trim() || 'Unknown error'
}

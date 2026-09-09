import { expect, test } from 'bun:test'
import { firstLine, unwrapMcpError, withAiInstallHint } from '@/lib/sql-error-messages'

const MCP_BLOB = JSON.stringify({
  error: {
    name: 'HttpException',
    message:
      'Failed to run sql query: ERROR:  42883: function public.ai_extract_agg(text) does not exist\nLINE 10:   public.ai_extract_agg(message) as entities\nHINT:  No function matches the given name and argument types.\n',
  },
})

test('unwraps the Postgres error out of the MCP JSON blob', () => {
  const out = unwrapMcpError(MCP_BLOB)
  expect(out.startsWith('ERROR:  42883: function public.ai_extract_agg(text) does not exist')).toBe(
    true
  )
  expect(out).not.toContain('HttpException')
})

test('leaves a plain error string alone', () => {
  expect(unwrapMcpError('permission denied for table users')).toBe(
    'permission denied for table users'
  )
})

test('adds the install hint only for missing ai_* functions', () => {
  const hinted = withAiInstallHint({ success: false, error: unwrapMcpError(MCP_BLOB) })
  expect(hinted.error).toContain("dbdev.install('JesseVent/supa_aisql')")

  const other = withAiInstallHint({ success: false, error: 'relation "posts" does not exist' })
  expect(other.error).not.toContain('supa_aisql')

  expect(withAiInstallHint({ success: true, data: [] }).error).toBeUndefined()
})

test('firstLine keeps a toast to the headline', () => {
  expect(firstLine(unwrapMcpError(MCP_BLOB))).toBe(
    'ERROR:  42883: function public.ai_extract_agg(text) does not exist'
  )
  expect(firstLine(undefined)).toBe('Unknown error')
})

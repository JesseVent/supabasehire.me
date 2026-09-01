/// <reference types="bun-types" />
import { expect, test } from 'bun:test'
import { formatSql, highlightSql, supportsLocalInference } from './sql-panel'

const TABLES = new Set(['person', 'concept'])

test('markup in the query is escaped, never emitted as tags', () => {
  const html = highlightSql(`select '<img onerror=alert(1)>' as x`, TABLES)
  expect(html).not.toContain('<img')
  expect(html).toContain('&lt;img')
})

test('keywords, calls, tables, strings and numbers each get their own class', () => {
  const html = highlightSql(`select count(id) from person where n = 5 and s = 'a'`, TABLES)
  expect(html).toContain('<span class="kw">select</span>')
  expect(html).toContain('<span class="fn">count</span>')
  expect(html).toContain('<span class="tbl">person</span>')
  expect(html).toContain('<span class="num">5</span>')
  expect(html).toContain(`<span class="str">'a'</span>`)
})

test('an unknown identifier stays unstyled', () => {
  expect(highlightSql('select widgets', TABLES)).toContain('widgets')
  expect(highlightSql('select widgets', TABLES)).not.toContain('class="tbl">widgets')
})

test('a line comment runs to the end of the line only', () => {
  const html = highlightSql('-- note\nselect 1', TABLES)
  expect(html).toContain('<span class="cm">-- note</span>')
  expect(html).toContain('<span class="kw">select</span>')
})

test('format uppercases keywords and breaks major clauses onto their own lines', () => {
  expect(formatSql('select a from person where b = 1')).toBe('SELECT a\nFROM person\nWHERE b = 1')
})

test('format leaves string literals untouched', () => {
  // "from" inside the literal must not be uppercased or moved to a new line.
  expect(formatSql(`select 'a  from b' as x`)).toBe(`SELECT 'a  from b' AS x`)
})

test('format hangs AND under its clause', () => {
  expect(formatSql('select a from t where b = 1 and c = 2')).toBe(
    'SELECT a\nFROM t\nWHERE b = 1\n  AND c = 2'
  )
})

test('local inference is offered only for a local project URL', () => {
  expect(supportsLocalInference('http://localhost:54321')).toBe(true)
  expect(supportsLocalInference('http://127.0.0.1:54321')).toBe(true)
  // A hosted project cannot reach AI_INFERENCE_API_HOST, even from a local browser.
  expect(supportsLocalInference('https://jqjaisrrpoemnrnevmvf.supabase.co')).toBe(false)
  // A host that merely contains "localhost" is not local.
  expect(supportsLocalInference('https://localhost.evil.example')).toBe(false)
  expect(supportsLocalInference(undefined)).toBe(false)
  expect(supportsLocalInference('not a url')).toBe(false)
})

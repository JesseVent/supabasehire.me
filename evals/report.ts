#!/usr/bin/env node
/**
 * Renders a coverage matrix from eval/results/matrix.json.
 *
 * Usage:
 *   pnpm eval:report                    # full matrix (clean run)
 *   pnpm eval:report --noisy            # noisy run matrix
 *   pnpm eval:report --diff             # side-by-side clean vs noisy diff
 *   pnpm eval:report --md               # also write eval/results/matrix.md
 *   pnpm eval:report --skill supabase-postgres-best-practices
 *   pnpm eval:report --category schema
 *   pnpm eval:report --zero             # show only never-hit references
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { allReferenceIds, discoverSkills } from './lib/discover.ts'
import type { EvalResult, MatrixData } from './run.ts'

const RESULTS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'results')
const RESULTS_FILE = join(RESULTS_DIR, 'matrix.json')
const NOISY_FILE = join(RESULTS_DIR, 'matrix-noisy.json')

// ── Args ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)

function getArg(flag: string): string | undefined {
  const i = args.indexOf(flag)
  return i !== -1 ? args[i + 1] : undefined
}

const filterSkill = getArg('--skill')
const filterCat = getArg('--category')
const showZero = args.includes('--zero')
const writeMd = args.includes('--md')
const useNoisy = args.includes('--noisy')
const showDiff = args.includes('--diff')

// ── Load data ─────────────────────────────────────────────────────────────────

const targetFile = useNoisy ? NOISY_FILE : RESULTS_FILE

if (!existsSync(targetFile)) {
  console.error(
    `No results found at ${targetFile}. Run \`pnpm eval${useNoisy ? ' --noisy' : ''}\` first.`
  )
  process.exit(1)
}

const data: MatrixData = JSON.parse(readFileSync(targetFile, 'utf8'))
const skills = discoverSkills()
const allRefs = allReferenceIds(skills)

// ── Filter rows ───────────────────────────────────────────────────────────────

let rows: EvalResult[] = data.results
if (filterCat) rows = rows.filter((r) => r.category === filterCat)

// ── Determine which columns to show ───────────────────────────────────────────

const hitCounts = new Map<string, number>()
for (const ref of allRefs) hitCounts.set(ref, 0)
for (const row of data.results) {
  for (const ref of row.references) {
    hitCounts.set(ref, (hitCounts.get(ref) ?? 0) + 1)
  }
}

let cols = allRefs
if (filterSkill) cols = cols.filter((c) => c.startsWith(filterSkill + '/'))
if (showZero) cols = cols.filter((c) => (hitCounts.get(c) ?? 0) === 0)

// ── Abbreviate column headers ─────────────────────────────────────────────────
// "supabase-postgres-best-practices/schema-primary-keys.md" → "pk"
const COL_ABBREVS: Record<string, string> = {
  'advanced-full-text-search.md': 'fts',
  'advanced-jsonb-indexing.md': 'jsonb',
  'conn-idle-timeout.md': 'cit',
  'conn-limits.md': 'clim',
  'conn-pooling.md': 'pool',
  'conn-prepared-statements.md': 'cps',
  'data-batch-inserts.md': 'batch',
  'data-n-plus-one.md': 'n+1',
  'data-pagination.md': 'page',
  'data-upsert.md': 'ups',
  'lock-advisory.md': 'adv',
  'lock-deadlock-prevention.md': 'dead',
  'lock-short-transactions.md': 'stx',
  'lock-skip-locked.md': 'skip',
  'monitor-explain-analyze.md': 'expl',
  'monitor-pg-stat-statements.md': 'pgss',
  'monitor-vacuum-analyze.md': 'vac',
  'query-composite-indexes.md': 'comp',
  'query-covering-indexes.md': 'cov',
  'query-index-types.md': 'ityp',
  'query-missing-indexes.md': 'midx',
  'query-partial-indexes.md': 'pidx',
  'schema-constraints.md': 'con',
  'schema-data-types.md': 'dt',
  'schema-foreign-key-indexes.md': 'fk',
  'schema-lowercase-identifiers.md': 'low',
  'schema-partitioning.md': 'part',
  'schema-primary-keys.md': 'pk',
  'security-privileges.md': 'priv',
  'security-rls-basics.md': 'rls',
  'security-rls-performance.md': 'rlsp',
  'skill-feedback.md': 'fb',
}

function abbrev(colId: string): string {
  const file = colId.split('/')[1]
  return COL_ABBREVS[file] ?? file.replace('.md', '').slice(0, 4)
}

// ── Render ────────────────────────────────────────────────────────────────────

const PROMPT_W = 52
const CAT_W = 11
const COL_W = 5

function pad(s: string, w: number) {
  return s.length > w ? s.slice(0, w - 1) + '…' : s.padEnd(w)
}
function rpad(s: string, w: number) {
  return s.padStart(w)
}

function renderTable(results: EvalResult[], columns: string[]): string[] {
  const lines: string[] = []

  // Header
  const headerCols = columns.map((c) => rpad(abbrev(c), COL_W)).join('')
  lines.push(`${'Prompt'.padEnd(PROMPT_W)} ${'Category'.padEnd(CAT_W)} ${headerCols}`)
  lines.push('─'.repeat(PROMPT_W + 1 + CAT_W + 1 + columns.length * COL_W))

  // Rows grouped by category
  const categories = [...new Set(results.map((r) => r.category))]
  for (const cat of categories) {
    const catRows = results.filter((r) => r.category === cat)
    for (const row of catRows) {
      const refSet = new Set(row.references)
      const cells = columns.map((c) => rpad(refSet.has(c) ? '✓' : '·', COL_W)).join('')
      lines.push(`${pad(row.prompt, PROMPT_W)} ${pad(cat, CAT_W)} ${cells}`)
    }
    lines.push('') // blank between categories
  }

  // Hit-rate footer
  lines.push('─'.repeat(PROMPT_W + 1 + CAT_W + 1 + columns.length * COL_W))
  const hitRow = columns
    .map((c) => {
      const n = hitCounts.get(c) ?? 0
      const pct = Math.round((n / data.total_prompts) * 100)
      return rpad(`${pct}%`, COL_W)
    })
    .join('')
  lines.push(`${'Hit rate'.padEnd(PROMPT_W)} ${''.padEnd(CAT_W)} ${hitRow}`)
  lines.push(
    `${'(of all prompts)'.padEnd(PROMPT_W)} ${''.padEnd(CAT_W)} ${columns.map((c) => rpad(String(hitCounts.get(c) ?? 0), COL_W)).join('')}`
  )

  return lines
}

// ── Summary stats ─────────────────────────────────────────────────────────────

function renderSummary(): string[] {
  const lines: string[] = []
  lines.push(`\nEval summary`)
  lines.push(`  Run at:       ${data.run_at}`)
  lines.push(`  Model:        ${data.model}`)
  lines.push(`  Prompts:      ${data.total_prompts}`)
  if (filterCat) lines.push(`  Filter cat:   ${filterCat}`)
  if (filterSkill) lines.push(`  Filter skill: ${filterSkill}`)

  // Top 5 most-hit references
  const sorted = [...hitCounts.entries()]
    .filter(([c]) => !filterSkill || c.startsWith(filterSkill + '/'))
    .sort((a, b) => b[1] - a[1])
  lines.push(`\n  Most loaded references (out of ${data.total_prompts} prompts):`)
  for (const [ref, n] of sorted.slice(0, 8)) {
    const bar = '█'.repeat(Math.round((n / data.total_prompts) * 20))
    lines.push(`    ${String(n).padStart(3)}  ${bar.padEnd(20)}  ${ref}`)
  }

  // Never-hit references
  const zeros = sorted.filter(([, n]) => n === 0).map(([c]) => c)
  if (zeros.length > 0) {
    lines.push(`\n  Never loaded (${zeros.length} references):`)
    for (const ref of zeros) lines.push(`    · ${ref}`)
  } else {
    lines.push(`\n  All references were loaded by at least one prompt. ✓`)
  }

  // Category breakdown
  lines.push(`\n  Prompts by category:`)
  const catCounts = new Map<string, number>()
  for (const r of data.results) {
    catCounts.set(r.category, (catCounts.get(r.category) ?? 0) + 1)
  }
  for (const [cat, n] of [...catCounts.entries()].sort((a, b) => b[1] - a[1])) {
    lines.push(`    ${String(n).padStart(3)}  ${cat}`)
  }

  return lines
}

// ── Legend ─────────────────────────────────────────────────────────────────────

function renderLegend(columns: string[]): string[] {
  const lines = ['\n  Column legend:']
  for (const c of columns) {
    lines.push(`    ${abbrev(c).padEnd(6)}  ${c}`)
  }
  return lines
}

// ── Diff view (clean vs noisy) ────────────────────────────────────────────────

function renderDiff() {
  if (!existsSync(RESULTS_FILE) || !existsSync(NOISY_FILE)) {
    console.error(
      'Need both matrix.json and matrix-noisy.json. Run both `pnpm eval` and `pnpm eval --noisy`.'
    )
    process.exit(1)
  }

  const clean: MatrixData = JSON.parse(readFileSync(RESULTS_FILE, 'utf8'))
  const noisy: MatrixData = JSON.parse(readFileSync(NOISY_FILE, 'utf8'))

  // Per-reference hit counts for each run
  const cleanCounts = new Map<string, number>()
  const noisyCounts = new Map<string, number>()
  for (const ref of allRefs) {
    cleanCounts.set(ref, 0)
    noisyCounts.set(ref, 0)
  }

  for (const r of clean.results)
    for (const ref of r.references) cleanCounts.set(ref, (cleanCounts.get(ref) ?? 0) + 1)
  for (const r of noisy.results)
    for (const ref of r.references) noisyCounts.set(ref, (noisyCounts.get(ref) ?? 0) + 1)

  const N = clean.total_prompts
  const lines: string[] = [
    '',
    `CLEAN vs NOISY DIFF — ${N} prompts  (context: ${noisy.context_template ?? 'random'})`,
    '',
    `${'Reference'.padEnd(58)} ${'clean'.padStart(6)} ${'noisy'.padStart(6)} ${'Δ'.padStart(6)}  trend`,
    '─'.repeat(85),
  ]

  const diffs = allRefs
    .map((ref) => {
      const c = cleanCounts.get(ref) ?? 0
      const n = noisyCounts.get(ref) ?? 0
      return { ref, c, n, delta: n - c }
    })
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))

  for (const { ref, c, n, delta } of diffs) {
    const cPct = `${Math.round((c / N) * 100)}%`
    const nPct = `${Math.round((n / N) * 100)}%`
    const dStr = delta === 0 ? '  =' : delta > 0 ? `+${delta}` : `${delta}`
    const bar =
      delta > 0 ? '▲'.repeat(Math.min(delta, 8)) : delta < 0 ? '▼'.repeat(Math.min(-delta, 8)) : '·'
    const flag = delta !== 0 ? (Math.abs(delta) >= 5 ? ' ⚠' : '') : ''
    lines.push(
      `${ref.padEnd(58)} ${cPct.padStart(6)} ${nPct.padStart(6)} ${dStr.padStart(6)}  ${bar}${flag}`
    )
  }

  const totalClean = [...cleanCounts.values()].reduce((a, b) => a + b, 0)
  const totalNoisy = [...noisyCounts.values()].reduce((a, b) => a + b, 0)
  lines.push('─'.repeat(85))
  lines.push(
    `${'Total reference loads'.padEnd(58)} ${String(totalClean).padStart(6)} ${String(totalNoisy).padStart(6)} ${String(totalNoisy - totalClean).padStart(6)}`
  )
  lines.push('')
  lines.push('  Legend: ▲ loaded more in noisy run  ▼ loaded less  · no change  ⚠ large drift (≥5)')

  // Prompts that changed reference sets
  const changed: string[] = []
  for (const cr of clean.results) {
    const nr = noisy.results.find((r) => r.prompt === cr.prompt)
    if (!nr) continue
    const cSet = new Set(cr.references)
    const nSet = new Set(nr.references)
    const added = nr.references.filter((r) => !cSet.has(r))
    const dropped = cr.references.filter((r) => !nSet.has(r))
    if (added.length || dropped.length) {
      changed.push(`  "${cr.prompt}"`)
      for (const r of added) changed.push(`      + ${r}`)
      for (const r of dropped) changed.push(`      - ${r}`)
    }
  }

  if (changed.length) {
    lines.push(`\n  Prompts with changed reference sets (${(changed.length / 3) | 0} of ${N}):`)
    lines.push(...changed.slice(0, 60)) // cap output
    if (changed.length > 60) lines.push(`  ... and ${((changed.length - 60) / 3) | 0} more`)
  } else {
    lines.push(
      '\n  No prompts changed reference sets. Skill loading is stable under noisy context. ✓'
    )
  }

  console.log(lines.join('\n'))
}

// ── Output ────────────────────────────────────────────────────────────────────

if (showDiff) {
  renderDiff()
  process.exit(0)
}

const tableLines = renderTable(rows, cols)
const summaryLines = renderSummary()
const legendLines = renderLegend(cols)

const label = useNoisy ? `NOISY — context: ${data.context_template ?? 'random'}` : 'CLEAN'
const output = [
  '',
  `SKILL COVERAGE MATRIX [${label}] — ${rows.length} prompts × ${cols.length} references`,
  '',
  ...tableLines,
  ...summaryLines,
  ...legendLines,
  '',
].join('\n')

console.log(output)

if (writeMd) {
  const mdPath = join(dirname(fileURLToPath(import.meta.url)), 'results/matrix.md')
  // Convert to markdown table
  const mdLines: string[] = [
    `# Skill Coverage Matrix`,
    ``,
    `Run: ${data.run_at} · Model: ${data.model} · ${data.total_prompts} prompts`,
    ``,
    `| Prompt | Category | ${cols.map(abbrev).join(' | ')} |`,
    `|--------|----------|${cols.map(() => '---').join('|')}|`,
  ]
  for (const row of rows) {
    const refSet = new Set(row.references)
    mdLines.push(
      `| ${row.prompt} | ${row.category} | ${cols.map((c) => (refSet.has(c) ? '✓' : '')).join(' | ')} |`
    )
  }
  mdLines.push(``, `## Hit rates`, ``)
  mdLines.push(`| Reference | Hits | Rate |`, `|-----------|------|------|`)
  for (const [ref, n] of [...hitCounts.entries()].sort((a, b) => b[1] - a[1])) {
    mdLines.push(`| ${ref} | ${n} | ${Math.round((n / data.total_prompts) * 100)}% |`)
  }
  writeFileSync(mdPath, mdLines.join('\n'))
  console.log(`Markdown saved → ${mdPath}`)
}

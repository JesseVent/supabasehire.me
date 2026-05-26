'use client'

import { useState, useMemo, useCallback } from 'react'
import {
  Wand2,
  Copy,
  Check,
  Terminal,
  ArrowRight,
  Layers,
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { TableRLSInfo, TableSchema } from '@/lib/supabase-types'
import { useSupabaseStore } from '@/store/supabase-store'

interface PolicyGeneratorProps {
  tables: TableSchema[]
  rlsStatuses: TableRLSInfo[]
  onCopyToSQL?: (sql: string) => void
  initialTable?: string
}

interface PolicyTemplate {
  id: string
  label: string
  description: string
  generate: (table: string, column: string) => string
  needsColumn: boolean
}

const POLICY_TEMPLATES: PolicyTemplate[] = [
  {
    id: 'enable-rls',
    label: 'Enable RLS on table',
    description: 'Enable Row Level Security on a table',
    needsColumn: false,
    generate: (table) => `ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`,
  },
  {
    id: 'select-own',
    label: 'Users can view own data',
    description: 'Users can only SELECT rows where they are the owner',
    needsColumn: true,
    generate: (table, column) =>
      `CREATE POLICY "${table}_select_own" ON ${table}\n  FOR SELECT\n  USING (auth.uid() = ${column});`,
  },
  {
    id: 'select-auth',
    label: 'Authenticated users can view all',
    description: 'All authenticated users can SELECT all rows',
    needsColumn: false,
    generate: (table) =>
      `CREATE POLICY "${table}_select_auth" ON ${table}\n  FOR SELECT\n  TO authenticated\n  USING (true);`,
  },
  {
    id: 'insert-own',
    label: 'Users can insert own data',
    description: 'Users can INSERT rows with their own user ID',
    needsColumn: true,
    generate: (table, column) =>
      `CREATE POLICY "${table}_insert_own" ON ${table}\n  FOR INSERT\n  WITH CHECK (auth.uid() = ${column});`,
  },
  {
    id: 'update-own',
    label: 'Users can update own data',
    description: 'Users can UPDATE only their own rows',
    needsColumn: true,
    generate: (table, column) =>
      `CREATE POLICY "${table}_update_own" ON ${table}\n  FOR UPDATE\n  USING (auth.uid() = ${column})\n  WITH CHECK (auth.uid() = ${column});`,
  },
  {
    id: 'delete-own',
    label: 'Users can delete own data',
    description: 'Users can DELETE only their own rows',
    needsColumn: true,
    generate: (table, column) =>
      `CREATE POLICY "${table}_delete_own" ON ${table}\n  FOR DELETE\n  USING (auth.uid() = ${column});`,
  },
  {
    id: 'select-public',
    label: 'Public read access',
    description: 'Anyone (including anonymous) can SELECT all rows',
    needsColumn: false,
    generate: (table) =>
      `CREATE POLICY "${table}_select_public" ON ${table}\n  FOR SELECT\n  TO anon, authenticated\n  USING (true);`,
  },
  {
    id: 'disable-rls',
    label: 'Disable RLS on table',
    description: 'Disable Row Level Security on a table',
    needsColumn: false,
    generate: (table) => `ALTER TABLE ${table} DISABLE ROW LEVEL SECURITY;`,
  },
]

type GeneratorMode = 'single' | 'batch'

export function PolicyGenerator({ tables, rlsStatuses, onCopyToSQL, initialTable }: PolicyGeneratorProps) {
  const { setActivePanel, setSqlEditorContent } = useSupabaseStore()

  const [mode, setMode] = useState<GeneratorMode>('single')

  // Single mode state
  const [selectedTable, setSelectedTable] = useState<string>(initialTable ?? '')
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('')
  const [columnName, setColumnName] = useState<string>('user_id')
  const [copied, setCopied] = useState(false)

  // Batch mode state
  const [batchCopied, setBatchCopied] = useState(false)
  const [batchIncludePolicies, setBatchIncludePolicies] = useState(true)

  const selectedTemplate = useMemo(
    () => POLICY_TEMPLATES.find((t) => t.id === selectedTemplateId),
    [selectedTemplateId]
  )

  const selectedTableSchema = useMemo(
    () => tables.find((t) => t.tableName === selectedTable),
    [tables, selectedTable]
  )

  // Auto-detect user_id-like column when table changes
  const suggestedColumns = useMemo(() => {
    if (!selectedTableSchema) return []
    return selectedTableSchema.columns
      .filter(
        (c) =>
          c.column_name.toLowerCase().includes('user') ||
          c.column_name.toLowerCase().includes('owner') ||
          c.column_name.toLowerCase().includes('author') ||
          c.column_name.toLowerCase().includes('created_by')
      )
      .map((c) => c.column_name)
  }, [selectedTableSchema])

  // Auto-fill column name when table changes
  const handleTableChange = useCallback(
    (tableName: string) => {
      setSelectedTable(tableName)
      const tableSchema = tables.find((t) => t.tableName === tableName)
      if (tableSchema) {
        const userCol = tableSchema.columns.find(
          (c) =>
            c.column_name.toLowerCase() === 'user_id' ||
            c.column_name.toLowerCase().includes('user') ||
            c.column_name.toLowerCase().includes('owner')
        )
        if (userCol) {
          setColumnName(userCol.column_name)
        } else {
          setColumnName('user_id')
        }
      }
    },
    [tables]
  )

  const generatedSQL = useMemo(() => {
    if (!selectedTable || !selectedTemplate) return ''
    return selectedTemplate.generate(selectedTable, columnName)
  }, [selectedTable, selectedTemplate, columnName])

  // Tables without RLS for batch mode
  const tablesWithoutRLS = useMemo(
    () => rlsStatuses.filter((t) => !t.rlsEnabled),
    [rlsStatuses]
  )

  // Batch generated SQL
  const batchSQL = useMemo(() => {
    if (tablesWithoutRLS.length === 0) return ''

    const statements: string[] = []

    tablesWithoutRLS.forEach((t) => {
      // ALTER TABLE to enable RLS
      statements.push(`ALTER TABLE ${t.tableName} ENABLE ROW LEVEL SECURITY;`)

      if (batchIncludePolicies) {
        // Add a basic SELECT policy
        const tableSchema = tables.find((ts) => ts.tableName === t.tableName)
        const userCol = tableSchema?.columns.find(
          (c) =>
            c.column_name.toLowerCase() === 'user_id' ||
            c.column_name.toLowerCase().includes('user')
        )

        if (userCol) {
          statements.push(
            `CREATE POLICY "${t.tableName}_select_own" ON ${t.tableName}\n  FOR SELECT\n  USING (auth.uid() = ${userCol.column_name});`
          )
        } else {
          statements.push(
            `CREATE POLICY "${t.tableName}_select_auth" ON ${t.tableName}\n  FOR SELECT\n  TO authenticated\n  USING (true);`
          )
        }
      }
    })

    return statements.join('\n\n')
  }, [tablesWithoutRLS, tables, batchIncludePolicies])

  const copyToClipboard = useCallback((text: string, isBatch = false) => {
    navigator.clipboard.writeText(text)
    if (isBatch) {
      setBatchCopied(true)
      setTimeout(() => setBatchCopied(false), 2000)
    } else {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }, [])

  const openInSQLRunner = useCallback((sql: string) => {
    setSqlEditorContent(sql)
    setActivePanel('sql')
    onCopyToSQL?.(sql)
  }, [setSqlEditorContent, setActivePanel, onCopyToSQL])

  return (
    <div className="flex flex-col gap-4">
      {/* Mode toggle */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Wand2 className="size-5 text-primary" />
            <CardTitle>RLS Policy Generator</CardTitle>
          </div>
          <CardDescription>
            Generate RLS policy SQL from templates — customize and run in the SQL editor
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex items-center gap-2">
            <Button
              variant={mode === 'single' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setMode('single')}
              className="gap-1.5"
            >
              <Wand2 className="size-3.5" />
              Single Table
            </Button>
            <Button
              variant={mode === 'batch' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setMode('batch')}
              className="gap-1.5"
            >
              <Layers className="size-3.5" />
              Batch Generate
              {tablesWithoutRLS.length > 0 && (
                <Badge variant="destructive" className="text-[9px] px-1 py-0 ml-1">
                  {tablesWithoutRLS.length}
                </Badge>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Single mode */}
      {mode === 'single' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Single Table Generator</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-5">
              {/* Table selector */}
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">Target Table</Label>
                {tables.length > 0 ? (
                  <Select value={selectedTable} onValueChange={handleTableChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a table" />
                    </SelectTrigger>
                    <SelectContent>
                      {tables.map((t) => (
                        <SelectItem key={t.tableName} value={t.tableName}>
                          {t.tableName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    value={selectedTable}
                    onChange={(e) => setSelectedTable(e.target.value)}
                    placeholder="table_name"
                    className="font-mono"
                  />
                )}
              </div>

              {/* Template selector */}
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">Policy Template</Label>
                <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choose a policy template" />
                  </SelectTrigger>
                  <SelectContent>
                    {POLICY_TEMPLATES.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        <div className="flex flex-col">
                          <span>{template.label}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedTemplate && (
                  <p className="text-xs text-muted-foreground">
                    {selectedTemplate.description}
                  </p>
                )}
              </div>

              {/* Column name customizer */}
              {selectedTemplate?.needsColumn && (
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs">Identity Column</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      value={columnName}
                      onChange={(e) => setColumnName(e.target.value)}
                      placeholder="user_id"
                      className="font-mono"
                    />
                    {suggestedColumns.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {suggestedColumns.map((col) => (
                          <Button
                            key={col}
                            variant={columnName === col ? 'default' : 'outline'}
                            size="sm"
                            className="text-[10px] h-6 px-2"
                            onClick={() => setColumnName(col)}
                          >
                            {col}
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    The column that references the authenticated user (used in auth.uid() comparison)
                  </p>
                </div>
              )}

              <Separator />

              {/* Generated SQL output */}
              {generatedSQL ? (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium">Generated SQL</Label>
                    <Badge variant="outline" className="text-[10px]">
                      {generatedSQL.split('\n').length} line{generatedSQL.split('\n').length !== 1 ? 's' : ''}
                    </Badge>
                  </div>
                  <div className="relative rounded-lg overflow-hidden border border-zinc-800 dark:border-zinc-700 bg-zinc-950 dark:bg-zinc-900">
                    <pre className="p-4 font-mono text-sm text-zinc-100 dark:text-zinc-200 overflow-x-auto whitespace-pre-wrap">
                      <code>{generatedSQL}</code>
                    </pre>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(generatedSQL)}
                      className="gap-1.5"
                    >
                      {copied ? (
                        <Check className="size-3.5 text-emerald-500" />
                      ) : (
                        <Copy className="size-3.5" />
                      )}
                      {copied ? 'Copied!' : 'Copy SQL'}
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => openInSQLRunner(generatedSQL)}
                      className="gap-1.5"
                    >
                      <ArrowRight className="size-3.5" />
                      <Terminal className="size-3.5" />
                      Open in SQL Runner
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <Wand2 className="mb-2 size-8 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">
                    Select a table and template to generate SQL
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Batch mode */}
      {mode === 'batch' && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-1">
                <CardTitle className="text-base">Batch RLS Enablement</CardTitle>
                <CardDescription>
                  Generate SQL to enable RLS on all unprotected tables at once
                </CardDescription>
              </div>
              <Badge variant="destructive" className="gap-1">
                {tablesWithoutRLS.length} unprotected
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {tablesWithoutRLS.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Wand2 className="mb-2 size-8 text-emerald-500/50" />
                <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                  All tables have RLS enabled!
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  No batch generation needed — your database is secure.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {/* Table list */}
                <div className="flex flex-col gap-2">
                  <Label className="text-xs">Unprotected Tables</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {tablesWithoutRLS.map((t) => (
                      <Badge key={t.tableName} variant="destructive" className="text-xs gap-1">
                        {t.tableName}
                        <span className="text-[9px] opacity-70">
                          ({t.policies.length} policies)
                        </span>
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Include policies toggle */}
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium">Include basic SELECT policies</span>
                    <span className="text-xs text-muted-foreground">
                      Auto-generate a SELECT policy for each table (auth.uid() based or authenticated-only)
                    </span>
                  </div>
                  <Switch
                    checked={batchIncludePolicies}
                    onCheckedChange={setBatchIncludePolicies}
                  />
                </div>

                <Separator />

                {/* Batch SQL output */}
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium">Generated SQL</Label>
                    <Badge variant="outline" className="text-[10px]">
                      {batchSQL.split('\n').length} line{batchSQL.split('\n').length !== 1 ? 's' : ''}
                    </Badge>
                  </div>
                  <div className="relative rounded-lg overflow-hidden border border-zinc-800 dark:border-zinc-700 bg-zinc-950 dark:bg-zinc-900">
                    <ScrollArea className="max-h-80">
                      <pre className="p-4 font-mono text-sm text-zinc-100 dark:text-zinc-200 overflow-x-auto whitespace-pre-wrap">
                        <code>{batchSQL}</code>
                      </pre>
                    </ScrollArea>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(batchSQL, true)}
                      className="gap-1.5"
                    >
                      {batchCopied ? (
                        <Check className="size-3.5 text-emerald-500" />
                      ) : (
                        <Copy className="size-3.5" />
                      )}
                      {batchCopied ? 'Copied!' : 'Copy All'}
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => openInSQLRunner(batchSQL)}
                      className="gap-1.5"
                    >
                      <ArrowRight className="size-3.5" />
                      <Terminal className="size-3.5" />
                      Open in SQL Runner
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

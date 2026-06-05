'use client'

import { useState, useCallback, useEffect, useMemo, Fragment } from 'react'
import { apiFetch } from '@/lib/api-auth'
import { toast } from 'sonner'
import {
  Zap,
  Loader2,
  CheckCircle2,
  XCircle,
  Play,
  Copy,
  Check,
  Globe,
  Clock,
  Pencil,
  Save,
  X,
  Info,
  Wand2,
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useSupabaseStore } from '@/store/supabase-store'
import type { EdgeFunction } from '@/lib/supabase-types'
import { DEMO_CONNECTION_ID, DEMO_FUNCTION_NOTES } from '@/lib/demo-data'
import { parseFunctionNotes, generateBodyFromSchema, extractCommentFrontmatter } from '@/lib/edge-function-utils'
import { BUILT_IN_FUNCTION_SCHEMAS } from '@/config/function-schemas'

interface InvokeResult {
  data?: unknown
  error?: string
  status: number
  responseTime?: number
}

export function EdgeFunctionsPanel() {
  const { activeConnectionId, connections, edgeFunctions, setEdgeFunctions, addActivityLog, functionNotes, setFunctionNotes } = useSupabaseStore()
  const activeConnection = connections.find((c) => c.id === activeConnectionId) || null

  const [isLoading, setIsLoading] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // Selected function state
  const [selectedFunction, setSelectedFunction] = useState<EdgeFunction | null>(null)

  // Invoke state
  const [httpMethod, setHttpMethod] = useState<string>('POST')
  const [requestBody, setRequestBody] = useState('')
  const [customHeaders, setCustomHeaders] = useState<Array<{ key: string; value: string }>>([
    { key: '', value: '' },
  ])
  const [isInvoking, setIsInvoking] = useState(false)
  const [invokeResult, setInvokeResult] = useState<InvokeResult | null>(null)
  const [copied, setCopied] = useState(false)

  // Schema / notes state
  const [isEditingNotes, setIsEditingNotes] = useState(false)
  const [draftNotes, setDraftNotes] = useState('')
  const [isAutoFetchingNotes, setIsAutoFetchingNotes] = useState(false)
  const [sourceFetchResult, setSourceFetchResult] = useState<'ok' | 'bundle' | 'error' | null>(null)

  const notesKey = activeConnectionId && selectedFunction
    ? `${activeConnectionId}:${selectedFunction.name}`
    : null

  const savedNotes = notesKey ? (functionNotes[notesKey] ?? '') : ''
  const effectiveNotes = savedNotes || (selectedFunction ? (BUILT_IN_FUNCTION_SCHEMAS[selectedFunction.name] ?? '') : '')

  const parsedSchema = useMemo(() => parseFunctionNotes(effectiveNotes), [effectiveNotes])

  const fetchFunctions = useCallback(async () => {
    if (!activeConnectionId) return
    setIsLoading(true)
    setFetchError(null)
    try {
      const res = await apiFetch('/api/edge-functions', activeConnection)
      const data = await res.json()
      if (data.error) {
        setFetchError(data.error)
      } else {
        setEdgeFunctions(data.functions || [])
      }
    } catch {
      setFetchError('Failed to fetch edge functions')
    } finally {
      setIsLoading(false)
    }
  }, [activeConnectionId, setEdgeFunctions])

  const invokeFunction = useCallback(async () => {
    if (!activeConnectionId || !selectedFunction) return
    setIsInvoking(true)
    setInvokeResult(null)

    const startTime = Date.now()

    if (activeConnectionId === DEMO_CONNECTION_ID) {
      await new Promise((r) => setTimeout(r, 200 + Math.random() * 400))
      const responseTime = Date.now() - startTime
      const demoResponses: Record<string, unknown> = {
        'hello-world': { message: 'Hello from Edge Function!', timestamp: new Date().toISOString() },
        'send-notification': { success: true, notificationId: `notif_${Math.random().toString(36).slice(2, 9)}`, recipient: 'user@example.com' },
        'process-webhook': { received: true, eventType: 'demo.event', processedAt: new Date().toISOString() },
      }
      const demoData = demoResponses[selectedFunction.name] ?? { result: 'ok', function: selectedFunction.name }
      setInvokeResult({ data: demoData, status: 200, responseTime })
      addActivityLog({ type: 'function', action: `Invoked: ${selectedFunction.name}`, details: `Status: 200, ${responseTime}ms (demo)` })
      toast.success('Function invoked (demo)', { description: `Status: 200, ${responseTime}ms` })
      setIsInvoking(false)
      return
    }

    try {
      let body: Record<string, unknown> | undefined
      if (requestBody.trim()) {
        try {
          body = JSON.parse(requestBody)
        } catch {
          setInvokeResult({
            error: 'Invalid JSON in request body',
            status: 0,
            responseTime: Date.now() - startTime,
          })
          setIsInvoking(false)
          return
        }
      }

      const headersObj: Record<string, string> = {}
      for (const h of customHeaders) {
        if (h.key.trim() && h.value.trim()) {
          headersObj[h.key.trim()] = h.value.trim()
        }
      }

      const res = await apiFetch('/api/edge-functions/invoke', activeConnection, {
          functionName: selectedFunction.name,
          method: httpMethod,
          body,
          headers: Object.keys(headersObj).length > 0 ? headersObj : undefined,
        })

      const data = await res.json()
      const responseTime = Date.now() - startTime

      setInvokeResult({
        data: data.data,
        error: data.error,
        status: data.status || res.status,
        responseTime,
      })
      addActivityLog({ type: 'function', action: `Invoked: ${selectedFunction.name}`, details: `Status: ${data.status || res.status}, ${responseTime}ms` })
      if (data.error) {
        toast.error('Invocation failed', { description: data.error })
      } else {
        toast.success('Function invoked', { description: `Status: ${data.status || res.status}, ${responseTime}ms` })
      }
    } catch {
      setInvokeResult({
        error: 'Network error occurred',
        status: 0,
        responseTime: Date.now() - startTime,
      })
    } finally {
      setIsInvoking(false)
    }
  }, [activeConnectionId, selectedFunction, httpMethod, requestBody, customHeaders, addActivityLog])

  // Reset invoke state and prefill template whenever the selected function changes
  useEffect(() => {
    setInvokeResult(null)
    setHttpMethod('POST')
    setCustomHeaders([{ key: '', value: '' }])
    setIsEditingNotes(false)
    setDraftNotes('')
    setSourceFetchResult(null)

    if (!selectedFunction) return
    const name = selectedFunction.name

    if (name === 'insert-person') {
      const personId = Math.floor(Math.random() * 900000) + 100000
      setRequestBody(JSON.stringify({
        person_id: personId,
        gender_concept_id: 8532,
        year_of_birth: 1985,
        race_concept_id: 8527,
        ethnicity_concept_id: 38003564,
        month_of_birth: 6,
        day_of_birth: 15,
        person_source_value: `PAT-${personId}`,
      }, null, 2))
    } else {
      setRequestBody('')
    }
  }, [selectedFunction])

  // Auto-seed schema annotations from the deployed source's leading comment
  // block. Only runs when we have no saved notes for this (connection, function)
  // and we're on a real (non-demo) connection with an access token.
  useEffect(() => {
    if (!notesKey || !selectedFunction || !activeConnection) return
    if (savedNotes) return
    if (activeConnectionId === DEMO_CONNECTION_ID) return
    if (!activeConnection.accessToken) return

    let cancelled = false
    setIsAutoFetchingNotes(true)
    ;(async () => {
      try {
        const res = await apiFetch('/api/edge-functions/source', activeConnection, {
            functionName: selectedFunction.name,
          })
        if (!res.ok) return
        const data = (await res.json()) as { source?: string; error?: string }
        if (cancelled || !data.source) return
        const extracted = extractCommentFrontmatter(data.source)
        if (extracted) {
          setFunctionNotes(notesKey, extracted)
          if (!cancelled) setSourceFetchResult('ok')
        } else {
          // Binary eszip bundle or no recognizable frontmatter
          if (!cancelled) setSourceFetchResult('bundle')
        }
      } catch {
        if (!cancelled) setSourceFetchResult('error')
      } finally {
        if (!cancelled) setIsAutoFetchingNotes(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [notesKey, savedNotes, selectedFunction, activeConnection, activeConnectionId, setFunctionNotes])


  const addHeader = useCallback(() => {
    setCustomHeaders((prev) => [...prev, { key: '', value: '' }])
  }, [])

  const removeHeader = useCallback((index: number) => {
    setCustomHeaders((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const updateHeader = useCallback(
    (index: number, field: 'key' | 'value', val: string) => {
      setCustomHeaders((prev) =>
        prev.map((h, i) => (i === index ? { ...h, [field]: val } : h))
      )
    },
    []
  )

  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [])

  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case 'active':
        return <Badge variant="default">Active</Badge>
      case 'inactive':
        return <Badge variant="secondary">Inactive</Badge>
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  return (
    <div className="em-panel h-full flex flex-col gap-4">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Zap className="size-5 text-primary" />
            <CardTitle>Edge Functions</CardTitle>
          </div>
          <CardDescription>
            Test and invoke your Supabase Edge Functions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-3">
            {activeConnectionId ? (
              <Button onClick={fetchFunctions} disabled={isLoading} size="sm">
                {isLoading ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <Zap className="mr-2 size-4" />
                )}
                {edgeFunctions.length > 0 ? 'Refresh Functions' : 'Load Edge Functions'}
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">
                Select a connection first to view edge functions
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Error display */}
      {fetchError && (
        <Alert variant="destructive">
          <AlertDescription>{fetchError}</AlertDescription>
        </Alert>
      )}

      {/* Function List */}
      {edgeFunctions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Deployed Functions</CardTitle>
            <CardDescription>{edgeFunctions.length} function(s) deployed</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea>
              <div className="flex flex-col gap-2">
                {edgeFunctions.map((fn: EdgeFunction) => (
                  <button
                    key={fn.id}
                    onClick={() => setSelectedFunction(fn)}
                    className={`flex items-center justify-between rounded-lg border p-3 text-left transition-colors hover:bg-accent ${
                      selectedFunction?.id === fn.id ? 'border-primary bg-accent' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`size-2 rounded-full shrink-0 ${fn.status === 'active' ? 'bg-primary' : fn.status === 'failed' ? 'bg-red-500' : 'bg-muted-foreground'}`} />
                      <div className="flex flex-col">
                        <span className="font-mono text-sm font-medium">{fn.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {fn.entrypoint_path ? fn.entrypoint_path.split('/').pop() : 'index.ts'}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {getStatusBadge(fn.status)}
                      {fn.verify_jwt !== undefined && (
                        <Badge variant={fn.verify_jwt ? 'default' : 'outline'} className="text-xs">
                          {fn.verify_jwt ? 'JWT ✓' : 'No JWT'}
                        </Badge>
                      )}
                      <Badge variant="secondary" className="text-xs">
                        v{fn.version}
                      </Badge>
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* Function Details + Schema */}
      {selectedFunction && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Info className="size-4 text-muted-foreground" />
                <CardTitle className="text-base">
                  <span className="font-mono">{selectedFunction.name}</span>
                </CardTitle>
              </div>
              <div className="flex items-center gap-1">
                {!isEditingNotes ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setDraftNotes(effectiveNotes); setIsEditingNotes(true) }}
                    className="h-7 px-2 text-xs"
                  >
                    <Pencil className="size-3 mr-1" />
                    {effectiveNotes ? 'Edit schema' : 'Add schema'}
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (notesKey) setFunctionNotes(notesKey, draftNotes)
                        setIsEditingNotes(false)
                        toast.success('Schema saved')
                      }}
                      className="h-7 px-2 text-xs"
                    >
                      <Save className="size-3 mr-1" />
                      Save
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsEditingNotes(false)}
                      className="h-7 px-2 text-xs text-muted-foreground"
                    >
                      <X className="size-3" />
                    </Button>
                  </>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4">
              {/* Metadata row */}
              <div className="flex flex-wrap gap-x-6 gap-y-1.5 text-xs text-muted-foreground">
                <span><span className="font-medium text-foreground">Version</span> v{selectedFunction.version}</span>
                <span><span className="font-medium text-foreground">Status</span> {selectedFunction.status}</span>
                <span><span className="font-medium text-foreground">JWT</span> {selectedFunction.verify_jwt ? 'required' : 'disabled'}</span>
                {selectedFunction.import_map !== undefined && (
                  <span><span className="font-medium text-foreground">Import map</span> {selectedFunction.import_map ? 'yes' : 'no'}</span>
                )}
                {selectedFunction.entrypoint_path && (() => {
                  const raw = selectedFunction.entrypoint_path!
                  // Strip Supabase's internal deployed path prefix (file:///tmp/user_fn_.../source/)
                  const cleaned = raw.replace(/^file:\/\/\/tmp\/[^/]+\/source\//, '')
                  return <span className="font-mono">{cleaned}</span>
                })()}
                <span>{new Date(selectedFunction.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
              </div>

              <Separator />

              {/* Schema / notes */}
              {isEditingNotes ? (
                <div className="flex flex-col gap-2">
                  <Label className="text-xs text-muted-foreground">
                    Schema annotations — document inputs using <code className="font-mono bg-muted px-1 rounded">@param</code>
                  </Label>
                  <Textarea
                    value={draftNotes}
                    onChange={(e) => setDraftNotes(e.target.value)}
                    placeholder={`@description Brief description of what this function does\n\n@param userId string required - The target user's UUID\n@param message string required - The notification message\n@param channel string optional - Channel: push, email, sms`}
                    className="font-mono text-xs min-h-[120px] bg-muted/50"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Format: <code className="font-mono">@param name type required|optional - description</code>
                  </p>
                </div>
              ) : effectiveNotes ? (
                <div className="flex flex-col gap-3">
                  {parsedSchema.description && (
                    <p className="text-sm text-muted-foreground">{parsedSchema.description}</p>
                  )}
                  {!savedNotes && effectiveNotes && (
                    <p className="text-[11px] text-muted-foreground">
                      Schema from built-in registry — click <span className="font-medium">Edit schema</span> to customise.
                    </p>
                  )}
                  {parsedSchema.params.length > 0 ? (
                    <div className="flex flex-col gap-1">
                      <div className="grid grid-cols-[auto_auto_auto_1fr] gap-x-3 gap-y-1.5 text-xs items-baseline">
                        <span className="text-muted-foreground font-medium">Param</span>
                        <span className="text-muted-foreground font-medium">Type</span>
                        <span className="text-muted-foreground font-medium">Required</span>
                        <span className="text-muted-foreground font-medium">Description</span>
                        {parsedSchema.params.map((p) => (
                          <Fragment key={p.name}>
                            <code className="font-mono text-primary">{p.name}</code>
                            <code className="font-mono text-blue-600 dark:text-blue-400">{p.type}</code>
                            <span className={p.required ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}>
                              {p.required ? 'yes' : 'no'}
                            </span>
                            <span className="text-muted-foreground">{p.description || '—'}</span>
                          </Fragment>
                        ))}
                      </div>
                    </div>
                  ) : parsedSchema.description ? (
                    <p className="text-xs text-muted-foreground italic">No parameters — this function takes no request body.</p>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">No @param annotations found — add them in the schema editor.</p>
                  )}
                  {parsedSchema.params.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="self-start"
                      onClick={() => {
                        const body = generateBodyFromSchema(parsedSchema.params)
                        if (body) {
                          setRequestBody(body)
                          setHttpMethod('POST')
                          toast.success('Request body generated from schema')
                        }
                      }}
                    >
                      <Wand2 className="size-3 mr-1.5" />
                      Fill from schema
                    </Button>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic flex items-center gap-2">
                  {isAutoFetchingNotes ? (
                    <>
                      <Loader2 className="size-3 animate-spin" />
                      Looking for <code className="font-mono not-italic">@param</code> frontmatter in the deployed source…
                    </>
                  ) : sourceFetchResult === 'bundle' ? (
                    <>Deployed as a compiled bundle — source cannot be read. Click <span className="font-medium not-italic">Add schema</span> to annotate inputs manually.</>
                  ) : (
                    <>No schema annotations yet. Click <span className="font-medium not-italic">Add schema</span> to document the expected inputs for this function.</>
                  )}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Invoke Section */}
      {selectedFunction && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Invoke: <span className="font-mono">{selectedFunction.name}</span>
            </CardTitle>
            <CardDescription>
              {selectedFunction.name === 'insert-person'
                ? 'Inserts an OMOP person record — subscribe to the person table in Realtime to see the INSERT event live.'
                : 'Send a request to this edge function'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4">
              {/* Method selector */}
              <div className="flex flex-wrap items-end gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs">HTTP Method</Label>
                  <div className="flex items-center gap-1">
                    <Button
                      variant={httpMethod === 'GET' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setHttpMethod('GET')}
                      className={httpMethod === 'GET' ? 'bg-primary hover:bg-primary text-white gap-1' : 'gap-1'}
                    >
                      GET
                    </Button>
                    <Button
                      variant={httpMethod === 'POST' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setHttpMethod('POST')}
                      className={httpMethod === 'POST' ? 'bg-amber-600 hover:bg-amber-700 text-white gap-1' : 'gap-1'}
                    >
                      POST
                    </Button>
                  </div>
                </div>

                <Button
                  onClick={invokeFunction}
                  disabled={isInvoking}
                  size="sm"
                >
                  {isInvoking ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : (
                    <Play className="mr-2 size-4" />
                  )}
                  Invoke
                </Button>
              </div>

              {/* Request Body */}
              {httpMethod === 'POST' && (
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs text-muted-foreground">Request Body (JSON)</Label>
                  <Textarea
                    value={requestBody}
                    onChange={(e) => setRequestBody(e.target.value)}
                    placeholder='{"key": "value"}'
                    className="font-mono text-xs min-h-[100px] bg-muted/50"
                  />
                </div>
              )}

              {/* Custom Headers */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">Custom Headers</Label>
                  <Button variant="ghost" size="sm" onClick={addHeader}>
                    + Add Header
                  </Button>
                </div>
                {customHeaders.map((header, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Input
                      value={header.key}
                      onChange={(e) => updateHeader(idx, 'key', e.target.value)}
                      placeholder="Header name"
                      className="font-mono text-xs h-8"
                    />
                    <Input
                      value={header.value}
                      onChange={(e) => updateHeader(idx, 'value', e.target.value)}
                      placeholder="Header value"
                      className="font-mono text-xs h-8"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeHeader(idx)}
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                    >
                      ×
                    </Button>
                  </div>
                ))}
              </div>

              <Separator />

              {/* Response */}
              {invokeResult && (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    {invokeResult.error ? (
                      <XCircle className="size-5 text-red-500" />
                    ) : (
                      <CheckCircle2 className="size-5 text-primary" />
                    )}
                    <div className="flex items-center gap-2">
                      <Globe className="size-4 text-muted-foreground" />
                      <Badge
                        variant={
                          invokeResult.status >= 200 && invokeResult.status < 300
                            ? 'default'
                            : 'destructive'
                        }
                      >
                        {invokeResult.status}
                      </Badge>
                    </div>
                    {invokeResult.responseTime !== undefined && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="size-3" />
                        {invokeResult.responseTime}ms
                      </div>
                    )}
                    {invokeResult.responseTime !== undefined && (
                      <div className="flex items-center gap-2 flex-1 max-w-[200px]">
                        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              invokeResult.responseTime < 200
                                ? 'bg-primary'
                                : invokeResult.responseTime < 1000
                                  ? 'bg-amber-500'
                                  : 'bg-red-500'
                            }`}
                            style={{ width: `${Math.min(100, (invokeResult.responseTime / 2000) * 100)}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                          {invokeResult.responseTime < 200 ? 'Fast' : invokeResult.responseTime < 1000 ? 'Medium' : 'Slow'}
                        </span>
                      </div>
                    )}
                  </div>

                  {invokeResult.error && (
                    <Alert variant="destructive">
                      <AlertDescription className="font-mono text-xs">
                        {invokeResult.error}
                      </AlertDescription>
                    </Alert>
                  )}

                  {invokeResult.data !== undefined && (
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Response Body</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            copyToClipboard(
                              typeof invokeResult.data === 'string'
                                ? invokeResult.data
                                : JSON.stringify(invokeResult.data, null, 2)
                            )
                          }
                        >
                          {copied ? (
                            <Check className="mr-1 size-3" />
                          ) : (
                            <Copy className="mr-1 size-3" />
                          )}
                          Copy
                        </Button>
                      </div>
                      <ScrollArea>
                        <pre className="rounded-lg bg-muted p-3 font-mono text-xs overflow-x-auto">
                          {typeof invokeResult.data === 'string'
                            ? invokeResult.data
                            : JSON.stringify(invokeResult.data, null, 2)}
                        </pre>
                      </ScrollArea>
                    </div>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state - no connection */}
      {!activeConnectionId && (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center text-center">
              <Zap className="mb-3 size-12 text-muted-foreground/30" />
              <p className="text-sm font-medium text-muted-foreground">
                No connection selected
              </p>
              <p className="text-xs text-muted-foreground">
                Connect to a Supabase project to view edge functions
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state - connection but no functions loaded */}
      {activeConnectionId && edgeFunctions.length === 0 && !isLoading && !fetchError && (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center text-center space-y-4">
              <div className="size-14 rounded-full bg-amber-100 dark:bg-amber-950/30 flex items-center justify-center">
                <Zap className="size-7 text-amber-500" />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">
                  No edge functions loaded
                </p>
                <p className="text-xs text-muted-foreground max-w-sm">
                  Click &quot;Load Edge Functions&quot; to fetch your deployed functions, or deploy your first function to get started.
                </p>
              </div>
              <a
                href="https://supabase.com/docs/guides/functions"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline"
              >
                Deploy your first function → Supabase Docs
              </a>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

'use client'

import { Download, FileIcon, Loader2, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { apiFetch } from '@/lib/api-auth'
import { track } from '@/lib/analytics'
import type { SupabaseConnection } from '@/lib/supabase-types'

interface FilePreviewProps {
  open: boolean
  onClose: () => void
  connection: SupabaseConnection
  bucket: string
  filePath: string
  fileName: string
  mimeType: string
  size: number
  isDemoMode?: boolean
}

type Phase = 'loading' | 'ready' | 'error'

function isTextLike(mime: string): boolean {
  return (
    mime.startsWith('text/') ||
    mime.includes('json') ||
    mime.includes('javascript') ||
    mime.includes('xml') ||
    mime.includes('csv') ||
    mime.includes('markdown') ||
    mime.includes('yaml') ||
    mime.includes('html')
  )
}

function formatSize(bytes: number): string {
  if (!bytes) return '—'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`
}

export function FilePreview({
  open,
  onClose,
  connection,
  bucket,
  filePath,
  fileName,
  mimeType,
  size,
  isDemoMode = false,
}: FilePreviewProps) {
  const [phase, setPhase] = useState<Phase>('loading')
  const [error, setError] = useState<string | null>(null)
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [textContent, setTextContent] = useState<string | null>(null)
  const blobRef = useRef<Blob | null>(null)

  // Cleanup blob URL whenever the modal closes or the target changes
  const cleanup = useCallback(() => {
    if (objectUrl) URL.revokeObjectURL(objectUrl)
    setObjectUrl(null)
    setTextContent(null)
    blobRef.current = null
  }, [objectUrl])

  const load = useCallback(async () => {
    setPhase('loading')
    setError(null)
    cleanup()

    // ponytail: demo mode has no real file bytes for non-parquet assets —
    // surface an honest "not available" state instead of a broken fetch.
    if (isDemoMode) {
      setPhase('error')
      setError('File preview is not available in Demo mode. Connect a real project to preview stored files.')
      return
    }

    try {
      const res = await apiFetch('/api/storage/download', connection, { bucket, path: filePath })
      if (!res.ok) {
        let msg = 'Download failed'
        try {
          const d = await res.json()
          msg = d.error || msg
        } catch {
          msg = `Download failed (status ${res.status})`
        }
        throw new Error(msg)
      }

      const blob = await res.blob()
      blobRef.current = blob
      const url = URL.createObjectURL(blob)

      if (isTextLike(mimeType)) {
        const text = await blob.text()
        // Pretty-print JSON for readability
        if (mimeType.includes('json')) {
          try {
            setTextContent(JSON.stringify(JSON.parse(text), null, 2))
          } catch {
            setTextContent(text)
          }
        } else {
          setTextContent(text)
        }
      }
      setObjectUrl(url)
      setPhase('ready')
      track('storage_file_previewed', { bucket, mime: mimeType })
    } catch (err) {
      setPhase('error')
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [bucket, filePath, mimeType, connection, isDemoMode, cleanup])

  useEffect(() => {
    if (open) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, filePath])

  useEffect(() => {
    if (!open) cleanup()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const handleDownload = useCallback(() => {
    if (isDemoMode) {
      toast.info('Download not available in Demo mode')
      return
    }
    const blob = blobRef.current
    if (!blob) return
    const url = objectUrl ?? URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    if (!objectUrl) URL.revokeObjectURL(url)
    track('storage_file_downloaded', { bucket, file_name: fileName })
  }, [bucket, fileName, objectUrl, isDemoMode])

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col gap-3 p-4 sm:p-6">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3 pr-8">
            <div className="flex items-center gap-2 min-w-0">
              <FileIcon className="size-5 shrink-0 text-muted-foreground" />
              <DialogTitle className="font-mono text-sm truncate">{fileName}</DialogTitle>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Badge variant="outline" className="text-[10px]">
                {mimeType || 'unknown'}
              </Badge>
              <Badge variant="secondary" className="text-[10px]">
                {formatSize(size)}
              </Badge>
            </div>
          </div>
          <DialogDescription className="font-mono text-xs">
            {bucket}/{filePath}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 rounded-lg border bg-muted/30 overflow-hidden">
          {phase === 'loading' && (
            <div className="flex flex-col items-center justify-center h-64 gap-3">
              <Loader2 className="size-8 text-muted-foreground/50 animate-spin" />
              <p className="text-sm text-muted-foreground">Loading file…</p>
            </div>
          )}

          {phase === 'error' && (
            <div className="flex flex-col items-center justify-center h-64 gap-3 text-center px-6">
              <X className="size-8 text-destructive/50" />
              <p className="text-sm font-medium">Preview unavailable</p>
              <p className="text-xs text-muted-foreground max-w-md">{error}</p>
            </div>
          )}

          {phase === 'ready' && objectUrl && mimeType.startsWith('image/') && (
            <ScrollArea className="h-[70vh]">
              <div className="flex items-center justify-center p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={objectUrl} alt={fileName} className="max-w-full h-auto rounded" />
              </div>
            </ScrollArea>
          )}

          {phase === 'ready' && objectUrl && mimeType === 'application/pdf' && (
            <iframe src={objectUrl} title={fileName} className="w-full h-[75vh] bg-white" />
          )}

          {phase === 'ready' && objectUrl && mimeType.startsWith('video/') && (
            <div className="flex items-center justify-center p-4 h-[70vh]">
              <video src={objectUrl} controls className="max-w-full max-h-full rounded" />
            </div>
          )}

          {phase === 'ready' && objectUrl && mimeType.startsWith('audio/') && (
            <div className="flex items-center justify-center h-64">
              <audio src={objectUrl} controls />
            </div>
          )}

          {phase === 'ready' && textContent !== null && (
            <ScrollArea className="h-[70vh]">
              <pre className="p-4 text-xs font-mono whitespace-pre-wrap break-words">{textContent}</pre>
            </ScrollArea>
          )}

          {phase === 'ready' && objectUrl && !mimeType.startsWith('image/') &&
            mimeType !== 'application/pdf' && !mimeType.startsWith('video/') &&
            !mimeType.startsWith('audio/') && textContent === null && (
              <div className="flex flex-col items-center justify-center h-64 gap-3 text-center px-6">
                <FileIcon className="size-10 text-muted-foreground/40" />
                <p className="text-sm font-medium">No inline preview for this file type</p>
                <p className="text-xs text-muted-foreground">
                  Use the Download button to save the file.
                </p>
              </div>
            )}
        </div>

        <div className="flex justify-between items-center gap-2 pt-1">
          <p className="text-xs text-muted-foreground">
            {phase === 'ready' ? 'Loaded from Supabase Storage' : ''}
          </p>
          <Button onClick={handleDownload} disabled={phase === 'loading' || isDemoMode} className="gap-1.5">
            <Download className="size-4" />
            Download
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
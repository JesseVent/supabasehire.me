'use client'

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { ParquetViewer } from '@/components/parquet-viewer'
import {
  FolderOpen,
  Upload,
  FileIcon,
  Image as ImageIcon,
  FileText,
  Eye,
  Video,
  Music,
  Archive,
  Code,
  Database,
  Globe,
  Lock,
  Copy,
  Check,
  Trash2,
  Loader2,
  HardDrive,
  Clock,
  ArrowLeft,
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

// ─── Types ───

interface StorageBucket {
  id: string
  name: string
  isPublic: boolean
  fileCount: number
  createdAt: string
  fileSizeLimit: number | null
}

interface StorageFile {
  id: string
  name: string
  bucketId: string
  size: number
  lastModified: string
  mimeType: string
  isFolder: boolean
  fullPath: string
}

// ─── Demo Data ───

const DEMO_BUCKETS: StorageBucket[] = [
  {
    id: 'avatars',
    name: 'avatars',
    isPublic: true,
    fileCount: 24,
    createdAt: '2024-01-15T10:30:00Z',
    fileSizeLimit: 5242880, // 5MB
  },
  {
    id: 'documents',
    name: 'documents',
    isPublic: false,
    fileCount: 12,
    createdAt: '2024-02-20T14:15:00Z',
    fileSizeLimit: 52428800, // 50MB
  },
  {
    id: 'media',
    name: 'media',
    isPublic: true,
    fileCount: 56,
    createdAt: '2024-03-05T09:00:00Z',
    fileSizeLimit: 104857600, // 100MB
  },
]

const DEMO_FILES: Record<string, StorageFile[]> = {
  avatars: [
    { id: 'av1', name: 'john-profile.jpg', bucketId: 'avatars', size: 245760, lastModified: '2024-06-15T10:30:00Z', mimeType: 'image/jpeg', isFolder: false, fullPath: 'john-profile.jpg' },
    { id: 'av2', name: 'jane-avatar.png', bucketId: 'avatars', size: 512000, lastModified: '2024-06-14T08:22:00Z', mimeType: 'image/png', isFolder: false, fullPath: 'jane-avatar.png' },
    { id: 'av3', name: 'bob-photo.webp', bucketId: 'avatars', size: 189440, lastModified: '2024-06-12T16:45:00Z', mimeType: 'image/webp', isFolder: false, fullPath: 'bob-photo.webp' },
    { id: 'av4', name: 'default-avatar.svg', bucketId: 'avatars', size: 4096, lastModified: '2024-01-15T10:30:00Z', mimeType: 'image/svg+xml', isFolder: false, fullPath: 'default-avatar.svg' },
    { id: 'av5', name: 'team-photo.jpg', bucketId: 'avatars', size: 1048576, lastModified: '2024-05-20T14:10:00Z', mimeType: 'image/jpeg', isFolder: false, fullPath: 'team-photo.jpg' },
  ],
  documents: [
    { id: 'doc-parquet', name: 'user-analytics.parquet', bucketId: 'documents', size: 3891, lastModified: '2024-06-18T09:00:00Z', mimeType: 'application/octet-stream', isFolder: false, fullPath: 'user-analytics.parquet' },
    { id: 'doc1', name: 'project-proposal.pdf', bucketId: 'documents', size: 2097152, lastModified: '2024-06-10T09:15:00Z', mimeType: 'application/pdf', isFolder: false, fullPath: 'project-proposal.pdf' },
    { id: 'doc2', name: 'budget-report.xlsx', bucketId: 'documents', size: 524288, lastModified: '2024-06-08T11:30:00Z', mimeType: 'application/vnd.ms-excel', isFolder: false, fullPath: 'budget-report.xlsx' },
    { id: 'doc3', name: 'meeting-notes.docx', bucketId: 'documents', size: 102400, lastModified: '2024-06-05T16:00:00Z', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', isFolder: false, fullPath: 'meeting-notes.docx' },
    { id: 'doc4', name: 'api-reference.md', bucketId: 'documents', size: 32768, lastModified: '2024-05-28T13:45:00Z', mimeType: 'text/markdown', isFolder: false, fullPath: 'api-reference.md' },
    { id: 'doc5', name: 'contracts.zip', bucketId: 'documents', size: 8388608, lastModified: '2024-05-15T10:00:00Z', mimeType: 'application/zip', isFolder: false, fullPath: 'contracts.zip' },
  ],
  media: [
    { id: 'med1', name: 'hero-banner.mp4', bucketId: 'media', size: 52428800, lastModified: '2024-06-01T08:00:00Z', mimeType: 'video/mp4', isFolder: false, fullPath: 'hero-banner.mp4' },
    { id: 'med2', name: 'product-demo.webm', bucketId: 'media', size: 31457280, lastModified: '2024-05-25T14:30:00Z', mimeType: 'video/webm', isFolder: false, fullPath: 'product-demo.webm' },
    { id: 'med3', name: 'podcast-ep1.mp3', bucketId: 'media', size: 15728640, lastModified: '2024-05-20T10:00:00Z', mimeType: 'audio/mpeg', isFolder: false, fullPath: 'podcast-ep1.mp3' },
    { id: 'med4', name: 'background-music.wav', bucketId: 'media', size: 41943040, lastModified: '2024-05-18T09:30:00Z', mimeType: 'audio/wav', isFolder: false, fullPath: 'background-music.wav' },
    { id: 'med5', name: 'screenshot-landing.png', bucketId: 'media', size: 2097152, lastModified: '2024-06-12T11:15:00Z', mimeType: 'image/png', isFolder: false, fullPath: 'screenshot-landing.png' },
    { id: 'med6', name: 'logo-dark.svg', bucketId: 'media', size: 8192, lastModified: '2024-04-01T12:00:00Z', mimeType: 'image/svg+xml', isFolder: false, fullPath: 'logo-dark.svg' },
  ],
}

// ─── Helpers ───

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function getFileIcon(mimeType: string) {
  if (mimeType.startsWith('image/')) return <ImageIcon className="size-4 text-violet-500" />
  if (mimeType.startsWith('video/')) return <Video className="size-4 text-amber-500" />
  if (mimeType.startsWith('audio/')) return <Music className="size-4 text-pink-500" />
  if (mimeType.includes('pdf') || mimeType.includes('document') || mimeType.includes('text'))
    return <FileText className="size-4 text-blue-500" />
  if (mimeType.includes('zip') || mimeType.includes('archive') || mimeType.includes('compressed'))
    return <Archive className="size-4 text-orange-500" />
  if (mimeType.includes('javascript') || mimeType.includes('json') || mimeType.includes('html') || mimeType.includes('css'))
    return <Code className="size-4 text-primary" />
  return <FileIcon className="size-4 text-muted-foreground" />
}

function getFileTypeLabel(mimeType: string): string {
  if (mimeType.startsWith('image/')) return 'Image'
  if (mimeType.startsWith('video/')) return 'Video'
  if (mimeType.startsWith('audio/')) return 'Audio'
  if (mimeType.includes('pdf')) return 'PDF'
  if (mimeType.includes('document') || mimeType.includes('text')) return 'Document'
  if (mimeType.includes('zip') || mimeType.includes('archive')) return 'Archive'
  return 'File'
}

// ─── Component ───

interface StorageBrowserProps {
  connection: import('@/lib/supabase-types').SupabaseConnection | null
  isDemoMode?: boolean
}

export function StorageBrowser({ connection, isDemoMode = false }: StorageBrowserProps) {
  const connectionId = connection?.id || null
  const [selectedBucket, setSelectedBucket] = useState<StorageBucket | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [buckets, setBuckets] = useState<StorageBucket[]>(isDemoMode ? DEMO_BUCKETS : [])
  const [files, setFiles] = useState<StorageFile[]>([])
  const [currentPath, setCurrentPath] = useState<string>('')
  const [isLoadingBuckets, setIsLoadingBuckets] = useState(false)
  const [isLoadingFiles, setIsLoadingFiles] = useState(false)
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null)
  const [previewFile, setPreviewFile] = useState<StorageFile | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchBuckets = useCallback(async () => {
    if (isDemoMode || !connection) return
    setIsLoadingBuckets(true)
    try {
      const res = await fetch('/api/storage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection, action: 'list-buckets' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to fetch buckets')
      // Normalize API shape → our StorageBucket shape
      const normalized: StorageBucket[] = (data.buckets || []).map((b: Record<string, unknown>) => ({
        id: b.id as string,
        name: b.name as string,
        isPublic: b.public as boolean,
        fileCount: 0,
        createdAt: b.created_at as string,
        fileSizeLimit: (b.file_size_limit as number | null) ?? null,
      }))
      setBuckets(normalized)
    } catch (err) {
      toast.error('Failed to load buckets', { description: err instanceof Error ? err.message : String(err) })
    } finally {
      setIsLoadingBuckets(false)
    }
  }, [connection, isDemoMode])

  const fetchFiles = useCallback(async (bucket: StorageBucket, path = '') => {
    if (isDemoMode) {
      const demoFiles = (DEMO_FILES[bucket.id] || []).map(f => ({ ...f, isFolder: false, fullPath: f.name }))
      setFiles(demoFiles)
      return
    }
    if (!connection) return
    setIsLoadingFiles(true)
    try {
      const res = await fetch('/api/storage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection, action: 'list-files', bucket: bucket.name, prefix: path }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to fetch files')
      const normalized: StorageFile[] = (data.files || []).map((f: Record<string, unknown>) => {
        const meta = f.metadata as Record<string, unknown> | null
        // Supabase returns null metadata for folder entries
        const isFolder = !meta
        const rawDate = isFolder ? '' : ((meta!.lastModified as string) || (f.updated_at as string) || (f.last_accessed_at as string) || '')
        const parsedDate = rawDate ? new Date(rawDate) : null
        const name = f.name as string
        return {
          id: (f.id as string) || name,
          name,
          bucketId: bucket.id,
          size: isFolder ? 0 : ((meta!.size as number) ?? (meta!.contentLength as number) ?? 0),
          lastModified: parsedDate && !isNaN(parsedDate.getTime()) ? parsedDate.toISOString() : '',
          mimeType: isFolder ? 'folder' : ((meta!.mimetype as string) || 'application/octet-stream'),
          isFolder,
          fullPath: path ? `${path}${name}` : name,
        }
      })
      setFiles(normalized)
    } catch (err) {
      toast.error('Failed to load files', { description: err instanceof Error ? err.message : String(err) })
    } finally {
      setIsLoadingFiles(false)
    }
  }, [connection, isDemoMode])

  useEffect(() => {
    fetchBuckets()
  }, [fetchBuckets])

  const handleSelectBucket = useCallback((bucket: StorageBucket) => {
    setSelectedBucket(bucket)
    setCurrentPath('')
    fetchFiles(bucket, '')
  }, [fetchFiles])

  const handleEnterFolder = useCallback((folder: StorageFile) => {
    if (!selectedBucket) return
    const newPath = `${folder.fullPath}/`
    setCurrentPath(newPath)
    fetchFiles(selectedBucket, newPath)
  }, [selectedBucket, fetchFiles])

  const handleNavigateUp = useCallback(() => {
    if (!selectedBucket) return
    // Strip last path segment: "a/b/c/" → "a/b/"
    const parts = currentPath.replace(/\/$/, '').split('/')
    parts.pop()
    const newPath = parts.length ? parts.join('/') + '/' : ''
    setCurrentPath(newPath)
    fetchFiles(selectedBucket, newPath)
  }, [selectedBucket, currentPath, fetchFiles])

  const handleBackToBuckets = useCallback(() => {
    setSelectedBucket(null)
    setCurrentPath('')
    setFiles([])
  }, [])

  const handleDeleteFile = useCallback(async (file: StorageFile) => {
    if (isDemoMode) {
      toast.info(`Deleted ${file.name}`, { description: 'This is a simulated action' })
      return
    }
    if (!connection || !selectedBucket) return
    setIsDeletingId(file.id)
    try {
      const res = await fetch('/api/storage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection, action: 'delete-file', bucket: selectedBucket.name, prefix: file.fullPath }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to delete file')
      toast.success(`Deleted ${file.name}`)
      setFiles((prev) => prev.filter((f) => f.id !== file.id))
    } catch (err) {
      toast.error('Failed to delete file', { description: err instanceof Error ? err.message : String(err) })
    } finally {
      setIsDeletingId(null)
    }
  }, [connection, isDemoMode, selectedBucket])

  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !selectedBucket) return
    if (isDemoMode) {
      setIsUploading(true)
      setUploadProgress(0)
      const interval = setInterval(() => {
        setUploadProgress((prev) => {
          if (prev >= 100) {
            clearInterval(interval)
            setIsUploading(false)
            toast.success('File uploaded successfully (demo)', { description: `${file.name} uploaded to ${selectedBucket.name}` })
            return 100
          }
          return prev + Math.random() * 15 + 5
        })
      }, 150)
      return
    }
    // Real upload via Supabase Storage API
    if (!connection || !connection.supabaseUrl) return
    setIsUploading(true)
    setUploadProgress(10)
    try {
      const formData = new FormData()
      formData.append('', file, file.name)
      // We call the API route for validation then do the upload directly from client
      // using a pre-signed approach — simplest: POST to the API route with base64
      const reader = new FileReader()
      reader.onload = async () => {
        const res = await fetch(`/api/storage/upload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            connection,
            bucket: selectedBucket.name,
            fileName: file.name,
            mimeType: file.type,
            data: (reader.result as string).split(',')[1],
          }),
        })
        const result = await res.json()
        if (!res.ok) throw new Error(result.error || 'Upload failed')
        setUploadProgress(100)
        toast.success(`Uploaded ${file.name}`)
        await fetchFiles(selectedBucket)
      }
      reader.onerror = () => { throw new Error('Failed to read file') }
      reader.readAsDataURL(file)
    } catch (err) {
      toast.error('Upload failed', { description: err instanceof Error ? err.message : String(err) })
    } finally {
      setTimeout(() => { setIsUploading(false); setUploadProgress(0) }, 800)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }, [connection, isDemoMode, selectedBucket, fetchFiles])

  const copyUrl = useCallback((file: StorageFile) => {
    const base = connection?.supabaseUrl || 'https://demo-project.supabase.co'
    const url = `${base.replace(/\/$/, '')}/storage/v1/object/public/${file.bucketId}/${file.name}`
    navigator.clipboard.writeText(url)
    setCopiedId(file.id)
    toast.success('URL copied to clipboard')
    setTimeout(() => setCopiedId(null), 2000)
  }, [connection])

  const totalSize = useMemo(() => {
    return files.filter(f => !f.isFolder).reduce((acc, f) => acc + f.size, 0)
  }, [files])

  return (
    <div className="flex flex-col gap-4">
      {/* Hidden file input */}
      <input ref={fileInputRef} type="file" className="hidden" onChange={handleUpload} />

      {/* Bucket Grid or File Browser */}
      {!selectedBucket ? (
        <>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <HardDrive className="size-5 text-primary" />
                  <CardTitle className="text-base">Storage Buckets</CardTitle>
                  {isDemoMode && <Badge variant="secondary" className="text-[10px]">Demo</Badge>}
                </div>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={fetchBuckets} disabled={isLoadingBuckets || isDemoMode}>
                  {isLoadingBuckets ? <Loader2 className="size-3.5 animate-spin" /> : <Database className="size-3.5" />}
                  Refresh
                </Button>
              </div>
              <CardDescription>
                Browse your Supabase Storage buckets and manage files
              </CardDescription>
            </CardHeader>
          </Card>

          {isLoadingBuckets ? (
            <Card>
              <CardContent className="py-12">
                <div className="flex flex-col items-center justify-center gap-3">
                  <Loader2 className="size-8 text-muted-foreground/40 animate-spin" />
                  <p className="text-sm text-muted-foreground">Loading buckets…</p>
                </div>
              </CardContent>
            </Card>
          ) : buckets.length === 0 ? (
            <Card>
              <CardContent className="py-12">
                <div className="flex flex-col items-center justify-center text-center space-y-3">
                  <FolderOpen className="size-12 text-muted-foreground/30" />
                  <p className="text-sm font-medium text-muted-foreground">
                    No storage buckets found
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Create a bucket in your Supabase dashboard to get started.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {buckets.map((bucket) => (
                <Card
                  key={bucket.id}
                  className="cursor-pointer hover:shadow-md transition-all hover:border-primary/30"
                  onClick={() => handleSelectBucket(bucket)}
                >
                  <CardContent className="p-4">
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="size-9 rounded-lg bg-primary/10 flex items-center justify-center">
                            <FolderOpen className="size-4 text-primary" />
                          </div>
                          <div>
                            <p className="text-sm font-medium font-mono">{bucket.name}</p>
                            <p className="text-xs text-muted-foreground">
                              Click to browse
                            </p>
                          </div>
                        </div>
                        {bucket.isPublic ? (
                          <Badge variant="outline" className="gap-1 text-primary border-primary/30 dark:text-primary dark:border-primary/30">
                            <Globe className="size-3" />
                            Public
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="gap-1">
                            <Lock className="size-3" />
                            Private
                          </Badge>
                        )}
                      </div>
                      <Separator />
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Clock className="size-3" />
                          {formatDate(bucket.createdAt)}
                        </div>
                        <span>
                          {bucket.fileSizeLimit ? formatFileSize(bucket.fileSizeLimit) + ' limit' : 'No limit'}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          {/* File Browser Header */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleBackToBuckets}
                    className="gap-1.5 shrink-0"
                  >
                    <ArrowLeft className="size-4" />
                    Buckets
                  </Button>
                  <Separator orientation="vertical" className="h-6" />
                  {/* Breadcrumb */}
                  <div className="flex items-center gap-1 flex-wrap min-w-0">
                    <button
                      className="font-mono text-sm font-semibold text-primary hover:underline"
                      onClick={() => { setCurrentPath(''); fetchFiles(selectedBucket, '') }}
                    >
                      {selectedBucket.name}
                    </button>
                    {currentPath && currentPath.replace(/\/$/, '').split('/').map((seg, i, arr) => {
                      const pathUpTo = arr.slice(0, i + 1).join('/') + '/'
                      return (
                        <span key={pathUpTo} className="flex items-center gap-1">
                          <span className="text-muted-foreground">/</span>
                          <button
                            className="font-mono text-sm text-foreground hover:underline"
                            onClick={() => { setCurrentPath(pathUpTo); fetchFiles(selectedBucket, pathUpTo) }}
                          >
                            {seg}
                          </button>
                        </span>
                      )
                    })}
                  </div>
                  {currentPath && (
                    <>
                      <Separator orientation="vertical" className="h-6" />
                      <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={handleNavigateUp}>
                        <ArrowLeft className="size-3.5" />
                        Up
                      </Button>
                    </>
                  )}
                  <Separator orientation="vertical" className="h-6" />
                  {selectedBucket.isPublic ? (
                    <Badge variant="outline" className="gap-1 text-primary border-primary/30 dark:text-primary dark:border-primary/30">
                      <Globe className="size-3" />
                      Public
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="gap-1">
                      <Lock className="size-3" />
                      Private
                    </Badge>
                  )}
                </div>
                <Button
                  size="sm"
                  className="gap-1.5 shrink-0"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                >
                  {isUploading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Upload className="size-4" />
                  )}
                  Upload File
                </Button>
              </div>
              <CardDescription>
                {files.filter(f => !f.isFolder).length} file{files.filter(f => !f.isFolder).length !== 1 ? 's' : ''}
                {files.some(f => f.isFolder) ? `, ${files.filter(f => f.isFolder).length} folder${files.filter(f => f.isFolder).length !== 1 ? 's' : ''}` : ''}
                {' '}&middot; {formatFileSize(totalSize)} total &middot; {selectedBucket.fileSizeLimit ? formatFileSize(selectedBucket.fileSizeLimit) + ' size limit' : 'No size limit'}
              </CardDescription>
            </CardHeader>
          </Card>

          {/* Upload Progress */}
          {isUploading && (
            <Card>
              <CardContent className="p-4">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Uploading example-file.pdf...</span>
                    <span className="font-mono text-xs">{Math.min(Math.round(uploadProgress), 100)}%</span>
                  </div>
                  <Progress value={Math.min(uploadProgress, 100)} className="h-2" />
                </div>
              </CardContent>
            </Card>
          )}

          {/* File List */}
          {isLoadingFiles ? (
            <Card>
              <CardContent className="py-12">
                <div className="flex flex-col items-center justify-center gap-3">
                  <Loader2 className="size-8 text-muted-foreground/40 animate-spin" />
                  <p className="text-sm text-muted-foreground">Loading files…</p>
                </div>
              </CardContent>
            </Card>
          ) : files.length === 0 ? (
            <Card>
              <CardContent className="py-12">
                <div className="flex flex-col items-center justify-center text-center space-y-3">
                  <FolderOpen className="size-12 text-muted-foreground/30" />
                  <p className="text-sm font-medium text-muted-foreground">
                    This bucket is empty
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Upload files to this bucket to see them listed here.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 mt-2"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                  >
                    <Upload className="size-3.5" />
                    Upload a File
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <ScrollArea className="max-h-[calc(100vh-260px)]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">File</TableHead>
                        <TableHead className="text-xs">Type</TableHead>
                        <TableHead className="text-xs">Size</TableHead>
                        <TableHead className="text-xs">Modified</TableHead>
                        <TableHead className="text-xs text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {files.map((file) => (
                        <TableRow
                          key={file.id || file.name}
                          className={file.isFolder ? 'cursor-pointer hover:bg-muted/50' : ''}
                          onClick={file.isFolder ? () => handleEnterFolder(file) : undefined}
                        >
                          <TableCell className="py-2">
                            <div className="flex items-center gap-2">
                              {file.isFolder
                                ? <FolderOpen className="size-4 text-amber-500" />
                                : getFileIcon(file.mimeType)
                              }
                              <span className={`font-mono text-xs truncate max-w-[200px] ${file.isFolder ? 'font-medium text-foreground' : ''}`}>
                                {file.name}
                                {file.isFolder && <span className="text-muted-foreground">/</span>}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="py-2">
                            <Badge variant={file.isFolder ? 'secondary' : 'outline'} className="text-[10px]">
                              {file.isFolder ? 'Folder' : getFileTypeLabel(file.mimeType)}
                            </Badge>
                          </TableCell>
                          <TableCell className="py-2 text-xs text-muted-foreground">
                            {file.isFolder ? '—' : formatFileSize(file.size)}
                          </TableCell>
                          <TableCell className="py-2 text-xs text-muted-foreground">
                            {file.isFolder ? '—' : formatDate(file.lastModified)}
                          </TableCell>
                          <TableCell className="py-2 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {!file.isFolder && file.name.endsWith('.parquet') && connection && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-primary"
                                onClick={(e) => { e.stopPropagation(); setPreviewFile(file) }}
                                title="Preview in DuckDB"
                              >
                                <Eye className="size-3.5" />
                              </Button>
                            )}
                            {!file.isFolder && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                onClick={(e) => { e.stopPropagation(); copyUrl(file) }}
                                title="Copy URL"
                              >
                                {copiedId === file.id ? (
                                  <Check className="size-3.5 text-primary" />
                                ) : (
                                  <Copy className="size-3.5" />
                                )}
                              </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                                onClick={(e) => { e.stopPropagation(); handleDeleteFile(file) }}
                                disabled={isDeletingId === file.id || file.isFolder}
                                title={file.isFolder ? 'Cannot delete folders directly' : 'Delete'}
                              >
                                {isDeletingId === file.id ? (
                                  <Loader2 className="size-3.5 animate-spin" />
                                ) : (
                                  <Trash2 className="size-3.5" />
                                )}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Parquet Viewer Modal */}
      {previewFile && connection && selectedBucket && (
        <ParquetViewer
          open={!!previewFile}
          onClose={() => setPreviewFile(null)}
          connection={connection}
          bucket={selectedBucket.name}
          filePath={previewFile.fullPath}
          fileName={previewFile.name}
        />
      )}
    </div>
  )
}

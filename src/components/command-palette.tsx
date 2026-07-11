'use client'

import {
  Database,
  Eye,
  FileText,
  GitFork,
  HeartPulse,
  Keyboard,
  LayoutDashboard,
  RefreshCw,
  ScrollText,
  Settings,
  Shield,
  Terminal,
  Zap,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command'
import {
  DEMO_CONNECTION,
  DEMO_CONNECTION_ID,
  DEMO_EDGE_FUNCTIONS,
  DEMO_RLS_STATUSES,
  DEMO_TABLES,
} from '@/lib/demo-data'
import type { ActivePanel } from '@/lib/supabase-types'
import { useSupabaseStore } from '@/store/supabase-store'

function isMac() {
  if (typeof navigator === 'undefined') return false
  return navigator.platform.toUpperCase().indexOf('MAC') >= 0
}

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [modKey, setModKey] = useState('Ctrl')
  useEffect(() => {
    setModKey(navigator.platform.toUpperCase().indexOf('MAC') >= 0 ? '⌘' : 'Ctrl')
  }, [])
  const {
    activeConnectionId,
    connections,
    tables,
    setActivePanel,
    setActiveConnectionId,
    setTables,
    setRlsStatuses,
    setEdgeFunctions,
    setSelectedTable,
    setShowShortcutsDialog,
  } = useSupabaseStore()

  // Listen for Ctrl+K globally
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = isMac() ? e.metaKey : e.ctrlKey
      if (mod && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        e.stopPropagation()
        setOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [])

  const runAction = useCallback((action: () => void) => {
    setOpen(false)
    action()
  }, [])

  const loadDemoData = useCallback(() => {
    const existingDemo = connections.find((c) => c.id === DEMO_CONNECTION_ID)
    if (!existingDemo) {
      useSupabaseStore.getState().addConnection(DEMO_CONNECTION)
    }
    setActiveConnectionId(DEMO_CONNECTION_ID)
    setTables(DEMO_TABLES)
    setRlsStatuses(DEMO_RLS_STATUSES)
    setEdgeFunctions(DEMO_EDGE_FUNCTIONS)
    setSelectedTable(null)
    setActivePanel('dashboard')
  }, [
    connections,
    setActiveConnectionId,
    setTables,
    setRlsStatuses,
    setEdgeFunctions,
    setSelectedTable,
    setActivePanel,
  ])

  const navigateToTable = useCallback(
    (tableName: string) => {
      setSelectedTable(tableName)
      setActivePanel('schema' as ActivePanel)
    },
    [setSelectedTable, setActivePanel]
  )

  const navItems = [
    {
      label: 'Dashboard',
      icon: LayoutDashboard,
      panel: 'dashboard' as ActivePanel,
      shortcut: `${modKey}+0`,
    },
    { label: 'Schema', icon: GitFork, panel: 'schema' as ActivePanel, shortcut: `${modKey}+1` },
    { label: 'RLS', icon: Shield, panel: 'rls' as ActivePanel, shortcut: `${modKey}+2` },
    {
      label: 'Functions',
      icon: Zap,
      panel: 'edge-functions' as ActivePanel,
      shortcut: `${modKey}+3`,
    },
    { label: 'SQL', icon: Terminal, panel: 'sql' as ActivePanel, shortcut: `${modKey}+4` },
    {
      label: 'Settings',
      icon: Settings,
      panel: 'settings' as ActivePanel,
      shortcut: `${modKey}+5`,
    },
    {
      label: 'Logs',
      icon: ScrollText,
      panel: 'logs' as ActivePanel,
      shortcut: `${modKey}+6`,
    },
  ]

  const actionItems = [
    { label: 'Try Demo', icon: Eye, action: loadDemoData, shortcut: `${modKey}+D` },
    { label: 'Export Report', icon: FileText, action: () => {}, shortcut: '' },
    {
      label: 'Run Health Check',
      icon: HeartPulse,
      action: () => setActivePanel('settings' as ActivePanel),
      shortcut: '',
    },
    {
      label: 'Refresh Schema',
      icon: RefreshCw,
      action: () => setActivePanel('schema' as ActivePanel),
      shortcut: '',
    },
    {
      label: 'Keyboard Shortcuts',
      icon: Keyboard,
      action: () => setShowShortcutsDialog(true),
      shortcut: `${modKey}/`,
    },
  ]

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Command Palette"
      description="Search for a command or navigate quickly..."
    >
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {/* Navigation Group */}
        <CommandGroup heading="Navigation">
          {navItems.map((item) => (
            <CommandItem
              key={item.panel}
              value={`navigate ${item.label}`}
              onSelect={() => runAction(() => setActivePanel(item.panel))}
            >
              <item.icon className="size-4" />
              <span>{item.label}</span>
              {item.shortcut && <CommandShortcut>{item.shortcut}</CommandShortcut>}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        {/* Actions Group */}
        <CommandGroup heading="Actions">
          {actionItems.map((item) => (
            <CommandItem
              key={item.label}
              value={`action ${item.label}`}
              onSelect={() => runAction(item.action)}
            >
              <item.icon className="size-4" />
              <span>{item.label}</span>
              {item.shortcut && <CommandShortcut>{item.shortcut}</CommandShortcut>}
            </CommandItem>
          ))}
        </CommandGroup>

        {/* Tables Group — only show when connected */}
        {activeConnectionId && tables.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Tables">
              {tables.map((table) => {
                const rlsInfo = useSupabaseStore
                  .getState()
                  .rlsStatuses.find((r) => r.tableName === table.tableName)
                const suffix = rlsInfo?.rlsEnabled ? '' : ' (no RLS)'
                return (
                  <CommandItem
                    key={table.tableName}
                    value={`table ${table.tableName}${suffix}`}
                    onSelect={() => runAction(() => navigateToTable(table.tableName))}
                  >
                    <Database className="size-4" />
                    <span className="font-mono">{table.tableName}</span>
                    {!rlsInfo?.rlsEnabled && (
                      <Badge className="ml-auto text-[9px] px-1.5 py-0 bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400 hover:bg-red-100">
                        No RLS
                      </Badge>
                    )}
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  )
}

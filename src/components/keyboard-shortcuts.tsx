'use client'

import { useEffect, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { useSupabaseStore } from '@/store/supabase-store'
import type { ActivePanel } from '@/lib/supabase-types'
import { DEMO_CONNECTION_ID } from '@/lib/demo-data'

interface ShortcutGroup {
  category: string
  shortcuts: {
    keys: string[]
    description: string
    action: () => void
  }[]
}

function isMac() {
  if (typeof navigator === 'undefined') return false
  return navigator.platform.toUpperCase().indexOf('MAC') >= 0
}

function modKey() {
  return isMac() ? '⌘' : 'Ctrl'
}

export function KeyboardShortcuts() {
  const {
    showShortcutsDialog,
    setShowShortcutsDialog,
    setActivePanel,
    activeConnectionId,
    connections,
    setActiveConnectionId,
  } = useSupabaseStore()

  const isDemoMode = activeConnectionId === DEMO_CONNECTION_ID

  const shortcutGroups: ShortcutGroup[] = [
    {
      category: 'Navigation',
      shortcuts: [
        {
          keys: [`${modKey()}`, '0'],
          description: 'Switch to Dashboard tab',
          action: () => setActivePanel('dashboard' as ActivePanel),
        },
        {
          keys: [`${modKey()}`, '1'],
          description: 'Switch to Schema tab',
          action: () => setActivePanel('schema'),
        },
        {
          keys: [`${modKey()}`, '2'],
          description: 'Switch to RLS tab',
          action: () => setActivePanel('rls'),
        },
        {
          keys: [`${modKey()}`, '3'],
          description: 'Switch to Functions tab',
          action: () => setActivePanel('edge-functions'),
        },
        {
          keys: [`${modKey()}`, '4'],
          description: 'Switch to SQL tab',
          action: () => setActivePanel('sql'),
        },
        {
          keys: [`${modKey()}`, '5'],
          description: 'Switch to Settings tab',
          action: () => setActivePanel('settings'),
        },
      ],
    },
    {
      category: 'Actions',
      shortcuts: [
        {
          keys: [`${modKey()}`, 'K'],
          description: 'Open command palette',
          action: () => {
            // Command palette handles Ctrl+K itself
          },
        },
        {
          keys: [`${modKey()}`, 'D'],
          description: 'Toggle demo mode',
          action: () => {
            if (isDemoMode) {
              setActiveConnectionId(null)
            } else {
              // Will be handled by loadDemoData in the parent
              const demoConn = connections.find((c) => c.id === DEMO_CONNECTION_ID)
              if (demoConn) {
                setActiveConnectionId(DEMO_CONNECTION_ID)
              }
            }
          },
        },
      ],
    },
    {
      category: 'General',
      shortcuts: [
        {
          keys: [`${modKey()}`, '/'],
          description: 'Show keyboard shortcuts',
          action: () => setShowShortcutsDialog(true),
        },
        {
          keys: ['Esc'],
          description: 'Close dialog / sheet',
          action: () => setShowShortcutsDialog(false),
        },
      ],
    },
  ]

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const mod = isMac() ? e.metaKey : e.ctrlKey

      // Don't intercept when typing in input/textarea
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        // Only allow Escape in inputs
        if (e.key === 'Escape') {
          setShowShortcutsDialog(false)
        }
        return
      }

      // Escape — close any open dialog
      if (e.key === 'Escape') {
        setShowShortcutsDialog(false)
        return
      }

      // Ctrl/Cmd + key shortcuts
      if (mod) {
        switch (e.key) {
          case '0':
            e.preventDefault()
            setActivePanel('dashboard' as ActivePanel)
            break
          case '1':
            e.preventDefault()
            setActivePanel('schema')
            break
          case '2':
            e.preventDefault()
            setActivePanel('rls')
            break
          case '3':
            e.preventDefault()
            setActivePanel('edge-functions')
            break
          case '4':
            e.preventDefault()
            setActivePanel('sql')
            break
          case '5':
            e.preventDefault()
            setActivePanel('settings')
            break
          case 'k':
          case 'K':
            e.preventDefault()
            // Command palette component handles its own Ctrl+K listener
            break
          case 'd':
          case 'D':
            e.preventDefault()
            if (isDemoMode) {
              setActiveConnectionId(null)
            } else {
              const demoConn = connections.find((c) => c.id === DEMO_CONNECTION_ID)
              if (demoConn) {
                setActiveConnectionId(DEMO_CONNECTION_ID)
              }
            }
            break
          case '/':
            e.preventDefault()
            setShowShortcutsDialog(!showShortcutsDialog)
            break
          default:
            break
        }
      }
    },
    [
      setActivePanel,
      setActiveConnectionId,
      setShowShortcutsDialog,
      connections,
      activeConnectionId,
      isDemoMode,
      showShortcutsDialog,
    ]
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return (
    <Dialog open={showShortcutsDialog} onOpenChange={setShowShortcutsDialog}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
          <DialogDescription>
            Use these shortcuts to navigate and interact with the app faster.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-5 py-2">
          {shortcutGroups.map((group, gi) => (
            <div key={group.category}>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                {group.category}
              </h4>
              <div className="flex flex-col gap-2">
                {group.shortcuts.map((shortcut) => (
                  <div
                    key={shortcut.keys.join('+')}
                    className="flex items-center justify-between gap-4"
                  >
                    <span className="text-sm text-foreground">{shortcut.description}</span>
                    <div className="flex items-center gap-1">
                      {shortcut.keys.map((key, ki) => (
                        <span key={ki}>
                          <Badge
                            variant="outline"
                            className="font-mono text-xs px-2 py-0.5 bg-muted/50 min-w-[28px] text-center justify-center"
                          >
                            {key}
                          </Badge>
                          {ki < shortcut.keys.length - 1 && (
                            <span className="mx-0.5 text-muted-foreground text-xs">+</span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              {gi < shortcutGroups.length - 1 && <Separator className="mt-4" />}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

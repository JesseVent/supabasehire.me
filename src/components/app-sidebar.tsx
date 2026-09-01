'use client'

import {
  Activity,
  BookOpen,
  DatabaseBackup,
  GitFork,
  HardDrive,
  Layers,
  LayoutDashboard,
  ScrollText,
  Settings,
  Shield,
  ShieldAlert,
  Terminal,
  Zap,
} from 'lucide-react'
import { AppLogo } from '@/components/app-logo'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'
import type { ActivePanel } from '@/lib/supabase-types'

type NavItem = { value: ActivePanel; icon: typeof LayoutDashboard; label: string; title: string }

// Grouped nav for the left sidebar. 13 panels no longer fit a single
// horizontal tab row, so they're bucketed by what you're doing with them.
const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Inspect',
    items: [
      { value: 'dashboard', icon: LayoutDashboard, label: 'Dashboard', title: 'Dashboard' },
      { value: 'schema', icon: GitFork, label: 'Schema', title: 'Schema' },
      { value: 'rls', icon: Shield, label: 'RLS', title: 'Row Level Security' },
      { value: 'storage', icon: HardDrive, label: 'Storage', title: 'Storage' },
      { value: 'catalog', icon: BookOpen, label: 'Catalog', title: 'Data Catalog' },
    ],
  },
  {
    label: 'Run',
    items: [
      { value: 'sql', icon: Terminal, label: 'SQL', title: 'SQL Editor' },
      { value: 'edge-functions', icon: Zap, label: 'Functions', title: 'Edge Functions' },
    ],
  },
  {
    label: 'Observe',
    items: [
      { value: 'logs', icon: ScrollText, label: 'Logs', title: 'Database Logs' },
      { value: 'traces', icon: Activity, label: 'Traces', title: 'Traces' },
      {
        value: 'resource-warnings',
        icon: ShieldAlert,
        label: 'Warnings',
        title: 'Resource Warnings',
      },
    ],
  },
  {
    label: 'Manage',
    items: [
      { value: 'backup', icon: DatabaseBackup, label: 'Backup', title: 'Project Backup' },
      { value: 'iceberg', icon: Layers, label: 'Iceberg', title: 'Analytics' },
      { value: 'settings', icon: Settings, label: 'Settings', title: 'Settings' },
    ],
  },
]

export function AppSidebar({
  activePanel,
  onSelect,
}: {
  activePanel: ActivePanel
  onSelect: (panel: ActivePanel) => void
}) {
  const { isMobile, setOpenMobile } = useSidebar()

  const select = (panel: ActivePanel) => {
    onSelect(panel)
    // On mobile the rail is a drawer over the content — close it once a panel is chosen.
    if (isMobile) setOpenMobile(false)
  }

  return (
    // `bottom-7 h-auto` overrides the component's `inset-y-0 h-svh`, so the rail stops
    // above the fixed-height footer in layout.tsx instead of running behind it.
    <Sidebar collapsible="icon" className="bottom-7 h-auto">
      <SidebarHeader className="h-14 justify-center border-b border-sidebar-border px-3">
        <div className="flex items-center gap-2.5 overflow-hidden">
          <div className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-sidebar-accent p-1">
            <AppLogo className="h-full w-full" />
          </div>
          <span
            className="truncate font-sans text-[17px] leading-none tracking-tight group-data-[collapsible=icon]:hidden"
            style={{ fontWeight: 800 }}
          >
            supabasehire.me
          </span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {NAV_GROUPS.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const Icon = item.icon
                  return (
                    <SidebarMenuItem key={item.value}>
                      <SidebarMenuButton
                        isActive={activePanel === item.value}
                        tooltip={item.title}
                        onClick={() => select(item.value)}
                      >
                        <Icon />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  )
}

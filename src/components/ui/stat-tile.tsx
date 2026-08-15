import type { LucideIcon } from 'lucide-react'
import type * as React from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface StatTileProps {
  label: string
  value: React.ReactNode
  icon: LucideIcon
  iconClassName?: string
  valueClassName?: string
  className?: string
}

/**
 * Small metric tile: mono uppercase label + icon top-right, bold number below.
 * Matches the discord.supabasehire.me stat-card language — flat card, no
 * gradient wash. Icon/value color defaults to neutral; pass a semantic color
 * (e.g. status-derived) via iconClassName/valueClassName, never a decorative one.
 */
export function StatTile({
  label,
  value,
  icon: Icon,
  iconClassName,
  valueClassName,
  className,
}: StatTileProps) {
  return (
    <Card className={cn('gap-0 py-4', className)}>
      <CardContent className="px-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
            {label}
          </span>
          <Icon className={cn('size-3.5 text-muted-foreground', iconClassName)} />
        </div>
        <div className={cn('text-2xl font-bold tracking-tight', valueClassName)}>{value}</div>
      </CardContent>
    </Card>
  )
}

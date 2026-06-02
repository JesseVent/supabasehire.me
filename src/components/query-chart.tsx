'use client'

import { useState, useMemo, useCallback } from 'react'
import {
  BarChart3,
  LineChart as LineChartIcon,
  PieChart as PieChartIcon,
  AlertTriangle,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from '@/components/ui/chart'
import type { ChartConfig } from '@/components/ui/chart'

type ChartType = 'bar' | 'line' | 'pie'

const CHART_COLORS = [
  'hsl(159, 84%, 62%)',  // Supabase green #3ECF8E
  'hsl(45, 93%, 47%)',   // amber
  'hsl(0, 72%, 51%)',    // red
  'hsl(263, 70%, 50%)',  // violet
  'hsl(199, 89%, 48%)',  // cyan
  'hsl(25, 95%, 53%)',   // orange
  'hsl(280, 67%, 53%)',  // purple
  'hsl(142, 71%, 45%)',  // green
  'hsl(346, 77%, 50%)',  // rose
  'hsl(197, 71%, 52%)',  // light blue
]

interface QueryChartProps {
  data: Array<Record<string, unknown>>
}

function isNumeric(value: unknown): boolean {
  if (typeof value === 'number' && !isNaN(value)) return true
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed === '') return false
    return !isNaN(Number(trimmed))
  }
  return false
}

function isStringColumn(rows: Array<Record<string, unknown>>, key: string): boolean {
  let stringCount = 0
  let totalNonEmpty = 0
  for (const row of rows) {
    const val = row[key]
    if (val === null || val === undefined) continue
    totalNonEmpty++
    if (typeof val === 'string') stringCount++
  }
  return totalNonEmpty > 0 && stringCount / totalNonEmpty > 0.5
}

function isNumericColumn(rows: Array<Record<string, unknown>>, key: string): boolean {
  let numCount = 0
  let totalNonEmpty = 0
  for (const row of rows) {
    const val = row[key]
    if (val === null || val === undefined || val === '') continue
    totalNonEmpty++
    if (isNumeric(val)) numCount++
  }
  return totalNonEmpty > 0 && numCount / totalNonEmpty > 0.5
}

function autoDetectColumns(rows: Array<Record<string, unknown>>) {
  if (rows.length === 0) return { xKey: '', yKey: '' }

  const keys = Object.keys(rows[0])

  // Find first string column for X
  let xKey = keys[0]
  for (const key of keys) {
    if (isStringColumn(rows, key)) {
      xKey = key
      break
    }
  }

  // Find first numeric column for Y (not the same as xKey)
  let yKey = ''
  for (const key of keys) {
    if (key !== xKey && isNumericColumn(rows, key)) {
      yKey = key
      break
    }
  }

  // If no numeric column found, try second column or any different column
  if (!yKey) {
    for (const key of keys) {
      if (key !== xKey) {
        yKey = key
        break
      }
    }
  }

  return { xKey, yKey }
}

function toNumber(value: unknown): number {
  if (typeof value === 'number' && !isNaN(value)) return value
  if (typeof value === 'string') {
    const num = Number(value)
    return isNaN(num) ? 0 : num
  }
  return 0
}

export function QueryChart({ data }: QueryChartProps) {
  const [chartType, setChartType] = useState<ChartType>('bar')

  const columns = useMemo(() => {
    if (data.length === 0) return []
    return Object.keys(data[0])
  }, [data])

  const { xKey: autoXKey, yKey: autoYKey } = useMemo(
    () => autoDetectColumns(data),
    [data]
  )

  const [xKey, setXKey] = useState<string | undefined>(undefined)
  const [yKey, setYKey] = useState<string | undefined>(undefined)

  const activeXKey = xKey ?? autoXKey
  const activeYKey = yKey ?? autoYKey

  // Determine if charting is possible
  const hasNumericColumn = useMemo(
    () => columns.some((key) => isNumericColumn(data, key)),
    [columns, data]
  )

  const chartData = useMemo(() => {
    if (!activeXKey || !activeYKey || data.length === 0) return []

    // For pie charts, limit to top 10 entries
    const maxItems = chartType === 'pie' ? 10 : data.length
    const slicedData = data.slice(0, maxItems)

    return slicedData.map((row) => ({
      name: String(row[activeXKey] ?? ''),
      [activeYKey]: toNumber(row[activeYKey]),
    }))
  }, [data, activeXKey, activeYKey, chartType])

  // Build chart config for shadcn chart
  const chartConfig = useMemo<ChartConfig>(() => {
    if (!activeYKey) return {}

    if (chartType === 'pie') {
      // For pie, each slice gets a color
      const config: ChartConfig = {}
      const maxItems = Math.min(data.length, 10)
      for (let i = 0; i < maxItems; i++) {
        const label = String(data[i]?.[activeXKey] ?? `Item ${i + 1}`)
        config[`slice-${i}`] = {
          label,
          color: CHART_COLORS[i % CHART_COLORS.length],
        }
      }
      return config
    }

    return {
      [activeYKey]: {
        label: activeYKey,
        color: CHART_COLORS[0],
      },
    }
  }, [activeYKey, activeXKey, chartType, data])

  const handleXKeyChange = useCallback((value: string) => {
    setXKey(value)
  }, [])

  const handleYKeyChange = useCallback((value: string) => {
    setYKey(value)
  }, [])

  // No data or no suitable columns
  if (data.length === 0) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex flex-col items-center justify-center text-center">
            <BarChart3 className="mb-3 size-10 text-muted-foreground/30" />
            <p className="text-sm font-medium text-muted-foreground">
              No data to visualize
            </p>
            <p className="text-xs text-muted-foreground">
              Execute a query with results to see chart visualizations
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!hasNumericColumn) {
    return (
      <Card>
        <CardContent className="py-6">
          <Alert>
            <AlertTriangle className="size-4" />
            <AlertDescription>
              No numeric columns detected in the result set. Charts require at least one numeric column for the Y-axis.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <CardTitle className="text-base">Query Visualization</CardTitle>
          <Tabs
            value={chartType}
            onValueChange={(v) => setChartType(v as ChartType)}
          >
            <TabsList className="h-8">
              <TabsTrigger value="bar" className="gap-1.5 px-2.5 text-xs">
                <BarChart3 className="size-3.5" />
                Bar
              </TabsTrigger>
              <TabsTrigger value="line" className="gap-1.5 px-2.5 text-xs">
                <LineChartIcon className="size-3.5" />
                Line
              </TabsTrigger>
              <TabsTrigger value="pie" className="gap-1.5 px-2.5 text-xs">
                <PieChartIcon className="size-3.5" />
                Pie
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Column selectors */}
        <div className="flex items-end gap-4 flex-wrap">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="x-axis-select" className="text-xs text-muted-foreground">
              X-Axis
            </Label>
            <Select value={activeXKey} onValueChange={handleXKeyChange}>
              <SelectTrigger id="x-axis-select" className="w-[180px]" size="sm">
                <SelectValue placeholder="Select column" />
              </SelectTrigger>
              <SelectContent>
                {columns.map((col) => (
                  <SelectItem key={col} value={col}>
                    {col}
                    {isStringColumn(data, col) && (
                      <Badge variant="secondary" className="ml-1.5 text-[10px] px-1 py-0">
                        text
                      </Badge>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="y-axis-select" className="text-xs text-muted-foreground">
              Y-Axis
            </Label>
            <Select value={activeYKey} onValueChange={handleYKeyChange}>
              <SelectTrigger id="y-axis-select" className="w-[180px]" size="sm">
                <SelectValue placeholder="Select column" />
              </SelectTrigger>
              <SelectContent>
                {columns.map((col) => (
                  <SelectItem key={col} value={col}>
                    {col}
                    {isNumericColumn(data, col) && (
                      <Badge variant="secondary" className="ml-1.5 text-[10px] px-1 py-0">
                        num
                      </Badge>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {chartType === 'pie' && data.length > 10 && (
            <Badge variant="outline" className="text-xs">
              Top 10 items shown
            </Badge>
          )}
        </div>

        {/* Chart area */}
        <div className="transition-all duration-300 ease-in-out">
          <Tabs value={chartType}>
            <TabsContent value="bar" className="mt-0">
              <ChartContainer config={chartConfig} className="min-h-[300px] min-w-[300px] w-full">
                <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    tick={{ fontSize: 12 }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    tick={{ fontSize: 12 }}
                  />
                  <ChartTooltip
                    content={<ChartTooltipContent />}
                  />
                  <Bar
                    dataKey={activeYKey}
                    fill={`var(--color-${activeYKey})`}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={60}
                  />
                </BarChart>
              </ChartContainer>
            </TabsContent>

            <TabsContent value="line" className="mt-0">
              <ChartContainer config={chartConfig} className="min-h-[300px] min-w-[300px] w-full">
                <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    tick={{ fontSize: 12 }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    tick={{ fontSize: 12 }}
                  />
                  <ChartTooltip
                    content={<ChartTooltipContent />}
                  />
                  <Line
                    type="monotone"
                    dataKey={activeYKey}
                    stroke={`var(--color-${activeYKey})`}
                    strokeWidth={2}
                    dot={{ r: 4, fill: `var(--color-${activeYKey})` }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ChartContainer>
            </TabsContent>

            <TabsContent value="pie" className="mt-0">
              <ChartContainer config={chartConfig} className="min-h-[300px] min-w-[300px] w-full">
                <PieChart>
                  <ChartTooltip
                    content={<ChartTooltipContent nameKey="name" hideLabel />}
                  />
                  <Pie
                    data={chartData}
                    dataKey={activeYKey}
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius="70%"
                    innerRadius="30%"
                    paddingAngle={2}
                  >
                    {chartData.map((_, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={`var(--color-slice-${index})`}
                        stroke="transparent"
                      />
                    ))}
                  </Pie>
                  <ChartLegend
                    content={<ChartLegendContent nameKey="name" />}
                  />
                </PieChart>
              </ChartContainer>
            </TabsContent>
          </Tabs>
        </div>
      </CardContent>
    </Card>
  )
}

import type { Metadata } from 'next'
import Script from 'next/script'
import './globals.css'
import { ThemeProvider } from 'next-themes'
import { AgentSidebar } from '@/components/AgentSidebar'
import { Toaster } from '@/components/ui/sonner'

export const metadata: Metadata = {
  title: 'AI Tooling Engineer',
  description:
    'Debug and inspect your Supabase RLS policies, edge functions, and database schema with interactive visualizations. Red-line highlighting for tables without row-level security.',
  keywords: [
    'Supabase',
    'RLS',
    'Edge Functions',
    'Database Debugging',
    'PostgreSQL',
    'Row Level Security',
    'Schema Visualization',
  ],
  icons: {
    icon: '/logo.svg',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Martian+Mono:wdth,wght@75..112.5,100..800&family=Open+Sans:ital,wght@0,300..800;1,300..800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased bg-background text-foreground flex flex-col min-h-screen">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          <div className="flex-1 flex flex-col">{children}</div>
          <Toaster />
          <AgentSidebar />
          <Script
            src="https://umami.rankuse.com/stats"
            data-website-id="03bb816f-2dbb-4375-8f9e-e437f4a5e270"
            integrity="sha384-LTPPwaLbU0osA3KlbZu0gbKM+OX2/iNJYVcdtY6ZFUJfsuj7LJ+40McwiPCPpKad"
            crossOrigin="anonymous"
            strategy="lazyOnload"
          />
          <footer className="border-t border-border/40 px-6 py-1.5 flex items-center justify-center gap-5 text-[10px]">
            <span className="font-mono text-muted-foreground">supabasehire.me</span>
            <span className="text-border">·</span>
            <span className="text-muted-foreground/70">Not affiliated with Supabase</span>
            <span className="text-border">·</span>
            <a href="https://github.com/JesseVent/supabase-devtool" target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground font-medium transition-colors">GitHub</a>
            <span className="text-border">·</span>
            <a href="https://www.linkedin.com/in/jessevent/" target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground font-medium transition-colors">LinkedIn</a>
          </footer>
        </ThemeProvider>
      </body>
    </html>
  )
}

import type { Metadata } from 'next'
import './globals.css'
import { ThemeProvider } from 'next-themes'
import { SupaAgentPanel } from '@/components/SupaAgentPanel'
import { Toaster } from '@/components/ui/sonner'

export const metadata: Metadata = {
  title: '🇦🇺 AI Agent Engineer',
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
        <script
          defer
          src="https://umami.rankuse.com/stats"
          data-website-id="03bb816f-2dbb-4375-8f9e-e437f4a5e270"
          integrity="sha384-LTPPwaLbU0osA3KlbZu0gbKM+OX2/iNJYVcdtY6ZFUJfsuj7LJ+40McwiPCPpKad"
          crossOrigin="anonymous"
        ></script>
      </head>
      <body className={`antialiased bg-background text-foreground`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          {children}
          <Toaster />
          <SupaAgentPanel />
          <footer className="border-t bg-muted/30 py-2 px-4 text-center text-[11px] text-muted-foreground">
            This site is not affiliated with or endorsed by Supabase. It is an independent
            engineering project built as part of a job application.
          </footer>
        </ThemeProvider>
      </body>
    </html>
  )
}

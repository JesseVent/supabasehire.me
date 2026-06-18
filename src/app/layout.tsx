import type { Metadata } from 'next'
import Script from 'next/script'
import './globals.css'
import { ThemeProvider } from 'next-themes'
import { AgentSidebar } from '@/components/AgentSidebar'
import { Toaster } from '@/components/ui/sonner'
import { PostHogInit } from '@/components/PostHogInit'

const SITE_URL = 'https://supabasehire.me'
const SITE_NAME = 'Supabase DevTool'
const SITE_TITLE = `${SITE_NAME} — Inspect Schema, RLS & Edge Functions`
const SITE_DESCRIPTION =
  'A web-based inspector and debugger for Supabase projects. Run SQL, browse RLS policies, invoke edge functions, profile tables, and visualize schema — all in one place, with a Demo Mode that needs no connection.'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  keywords: [
    'Supabase',
    'Supabase DevTool',
    'RLS',
    'Row Level Security',
    'Edge Functions',
    'Database Debugging',
    'PostgreSQL',
    'Schema Visualization',
    'Supabase Management API',
    'Supabase Inspector',
  ],
  authors: [{ name: 'Jesse Vent', url: 'https://github.com/JesseVent' }],
  alternates: { canonical: '/' },
  icons: {
    icon: '/logo.svg',
  },
  openGraph: {
    type: 'website',
    url: SITE_URL,
    siteName: SITE_NAME,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: SITE_NAME,
  url: SITE_URL,
  applicationCategory: 'DeveloperApplication',
  operatingSystem: 'Any (Web-based)',
  description: SITE_DESCRIPTION,
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  author: { '@type': 'Person', name: 'Jesse Vent', url: 'https://github.com/JesseVent' },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Source+Code+Pro:ital,wght@0,300..900;1,300..900&display=swap"
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
          <PostHogInit />
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
            <a href="https://github.com/JesseVent/supabasehire.me" target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground font-medium transition-colors">GitHub</a>
            <span className="text-border">·</span>
            <a href="https://www.linkedin.com/in/jessevent/" target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground font-medium transition-colors">LinkedIn</a>
          </footer>
        </ThemeProvider>
      </body>
    </html>
  )
}

'use client'

import { useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function OAuthCallbackInner() {
  const params = useSearchParams()

  useEffect(() => {
    const code = params.get('code')
    const state = params.get('state')
    const error = params.get('error')
    const errorDescription = params.get('error_description')

    if (!window.opener) {
      // Fallback: redirect to home if opened without a parent
      window.location.href = '/'
      return
    }

    window.opener.postMessage(
      {
        type: 'SUPABASE_OAUTH_CALLBACK',
        code: code ?? undefined,
        state: state ?? undefined,
        error: error ? (errorDescription ?? error) : undefined,
      },
      window.location.origin
    )

    window.close()
  }, [params])

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Connecting to Supabase…</p>
      </div>
    </div>
  )
}

export default function OAuthCallbackPage() {
  return (
    <Suspense>
      <OAuthCallbackInner />
    </Suspense>
  )
}

// Supabase Management API OAuth (popup flow).
// Uses the registered OAuth app — client_id is public, secret stays server-side.
// Token exchange goes through /api/oauth/token so the secret never hits the browser.

const MGMT_API = 'https://api.supabase.com'


export interface OAuthProject {
  id: string
  ref: string
  name: string
  region: string
  status: string
}

export interface ProjectKeys {
  anon: string
  serviceRole: string
}

// ── PKCE ──────────────────────────────────────────────────────────────────────

export async function generatePKCE(): Promise<{ codeVerifier: string; codeChallenge: string }> {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  const codeVerifier = btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')

  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier))
  const codeChallenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')

  return { codeVerifier, codeChallenge }
}

// ── Authorize URL ─────────────────────────────────────────────────────────────

export function getCallbackUrl(): string {
  return `${window.location.origin}/oauth/callback`
}

export function buildAuthorizeUrl(
  clientId: string,
  redirectUri: string,
  codeChallenge: string,
  state: string
): string {
  const url = new URL(`${MGMT_API}/v1/oauth/authorize`)
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('code_challenge', codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')
  url.searchParams.set('state', state)
  return url.toString()
}

// ── Token Exchange (server-side — secret never in browser) ────────────────────

export async function exchangeCode(
  code: string,
  codeVerifier: string,
  redirectUri: string
): Promise<{ accessToken: string; refreshToken?: string }> {
  const res = await fetch('/api/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, code_verifier: codeVerifier, redirect_uri: redirectUri }),
  })

  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error ?? `Token exchange failed (${res.status})`)
  }

  const data = await res.json()
  return { accessToken: data.access_token, refreshToken: data.refresh_token }
}

// ── Token Refresh ───────────────────────────────────────────────────────────────

export async function refreshAccessToken(
  refreshToken: string
): Promise<{ accessToken: string; refreshToken?: string }> {
  const res = await fetch('/api/oauth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  })

  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error ?? `Token refresh failed (${res.status})`)
  }

  const data = await res.json()
  return { accessToken: data.access_token, refreshToken: data.refresh_token }
}

// ── Management API helpers ────────────────────────────────────────────────────

export async function listProjects(accessToken: string): Promise<OAuthProject[]> {
  const res = await fetch('/api/oauth/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ access_token: accessToken }),
  })
  if (!res.ok) throw new Error(`Failed to list projects: ${res.status}`)
  return res.json()
}

export class OAuthScopeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OAuthScopeError'
  }
}

export async function getProjectKeys(ref: string, accessToken: string): Promise<ProjectKeys> {
  const res = await fetch('/api/oauth/project-keys', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ access_token: accessToken, ref }),
  })
  if (res.status === 403) {
    throw new OAuthScopeError(
      'Your OAuth app is missing the "Secrets" scope. Enable Secrets → Read in your Supabase OAuth app settings, then re-authorize.'
    )
  }
  if (!res.ok) throw new Error(`Failed to fetch API keys: ${res.status}`)
  const keys = (await res.json()) as { name: string; api_key: string }[]
  return {
    anon: keys.find((k) => k.name === 'anon')?.api_key ?? '',
    serviceRole: keys.find((k) => k.name === 'service_role')?.api_key ?? '',
  }
}

// ── Popup flow ────────────────────────────────────────────────────────────────

export function openOAuthPopup(authorizeUrl: string): Window | null {
  const width = 600
  const height = 700
  const left = window.screenX + (window.outerWidth - width) / 2
  const top = window.screenY + (window.outerHeight - height) / 2
  return window.open(
    authorizeUrl,
    'supabase-oauth',
    `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no`
  )
}

export function waitForOAuthCallback(state: string, popup: Window): Promise<string> {
  return new Promise((resolve, reject) => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      if (event.data?.type !== 'SUPABASE_OAUTH_CALLBACK') return
      if (event.data?.state !== state) return

      window.removeEventListener('message', onMessage)
      clearInterval(closedCheck)

      if (event.data.error) reject(new Error(event.data.error))
      else if (event.data.code) resolve(event.data.code as string)
      else reject(new Error('No code received'))
    }

    const closedCheck = setInterval(() => {
      if (popup.closed) {
        clearInterval(closedCheck)
        window.removeEventListener('message', onMessage)
        reject(new Error('OAuth popup closed'))
      }
    }, 500)

    window.addEventListener('message', onMessage)
  })
}

// Supabase Management API OAuth (popup flow) using Dynamic Client Registration (RFC 7591).
// No pre-registered app required — the client is registered at runtime and the client_id
// is cached in sessionStorage (cleared on tab close — no persistent credential exposure).

const MGMT_API = 'https://api.supabase.com'
const DCR_CACHE_KEY = 'supabase_dcr_client_id'
const DCR_SECRET_CACHE_KEY = 'supabase_dcr_client_secret'

export interface OAuthProject {
  id: string
  ref: string
  name: string
  region: string
  status: string
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

// ── Dynamic Client Registration (RFC 7591) ─────────────────────────────────────

export interface DcrClient {
  clientId: string
  clientSecret: string
}

/**
 * Register a public OAuth client via DCR. The client_id and client_secret are
 * cached in sessionStorage so they're cleared on tab close.
 */
export function clearDcrCache(): void {
  sessionStorage.removeItem(DCR_CACHE_KEY)
  sessionStorage.removeItem(DCR_SECRET_CACHE_KEY)
}

export async function getOrRegisterDcrClient(redirectUri: string, force = false): Promise<DcrClient> {
  if (!force) {
    const cachedId = sessionStorage.getItem(DCR_CACHE_KEY)
    const cachedSecret = sessionStorage.getItem(DCR_SECRET_CACHE_KEY)
    if (cachedId && cachedSecret) return { clientId: cachedId, clientSecret: cachedSecret }
  }

  // DCR endpoint doesn't send CORS headers — proxy through our server route.
  const res = await fetch('/api/oauth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_name: 'supabasehire.me',
      redirect_uris: [redirectUri],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      scope:
        'projects:read projects:write organizations:read database:read database:write analytics:read secrets:read edge_functions:read edge_functions:write environment:read environment:write storage:read',
    }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`DCR registration failed (${res.status}): ${text}`)
  }
  const data = await res.json()
  if (!data.client_id) throw new Error('DCR response missing client_id')
  const clientSecret = (data.client_secret as string) ?? ''
  sessionStorage.setItem(DCR_CACHE_KEY, data.client_id as string)
  sessionStorage.setItem(DCR_SECRET_CACHE_KEY, clientSecret)
  return { clientId: data.client_id as string, clientSecret }
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

// ── Token Exchange (proxied — api.supabase.com blocks CORS from browsers) ──────

export async function exchangeCode(
  clientId: string,
  code: string,
  codeVerifier: string,
  redirectUri: string,
  clientSecret?: string
): Promise<{ accessToken: string; refreshToken?: string }> {
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  })
  if (clientSecret) params.set('client_secret', clientSecret)
  const res = await fetch('/api/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error ?? `Token exchange failed (${res.status})`)
  }
  const data = await res.json()
  return { accessToken: data.access_token, refreshToken: data.refresh_token }
}

// ── Token Refresh (proxied) ───────────────────────────────────────────────────

export async function refreshAccessToken(
  clientId: string,
  refreshToken: string,
  clientSecret?: string
): Promise<{ accessToken: string; refreshToken?: string }> {
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: clientId,
    refresh_token: refreshToken,
  })
  if (clientSecret) params.set('client_secret', clientSecret)
  const res = await fetch('/api/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error ?? `Token refresh failed (${res.status})`)
  }
  const data = await res.json()
  return { accessToken: data.access_token, refreshToken: data.refresh_token }
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

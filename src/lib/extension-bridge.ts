/**
 * Bridge to the SupaAgent browser extension's credential vault.
 *
 * The extension runs in an isolated context (chrome.storage.local) that page JS
 * cannot read. This module sends a postMessage request; the extension's content
 * script responds with the stored OAuth credentials. If no response arrives
 * within TIMEOUT_MS the extension is assumed absent and null is returned.
 *
 * The extension only responds to trusted origins (supabasehire.me / localhost)
 * so this is safe to call unconditionally — non-trusted origins get silence.
 */

const CHANNEL_REQ = 'SUPA_DEVTOOL_EXT_REQUEST'
const CHANNEL_RES = 'SUPA_DEVTOOL_EXT_RESPONSE'
const TIMEOUT_MS = 600

let _lastId = 0

export interface ExtensionCredentials {
  accessToken: string | null
  refreshToken: string | null
  clientId: string | null
  clientSecret: string | null
  projectRef: string | null
  anonKey: string | null
  supabaseUrl: string | null
  serviceRoleKey?: string | null
}

export type CredentialType = 'access_token' | 'anon_key' | 'service_role_key'

export interface ProxySpec {
  url: string
  method?: string
  body?: unknown
  credential: CredentialType
}

export interface ProxyResponse {
  status: number
  body: unknown
  error?: string
}

// Session-only credential cache. Keys are connection IDs. Values are never
// persisted to localStorage — they live only as long as the page/tab is open.
// This lets extension connections route through normal /api/* calls without
// needing the extension service worker to stay awake.
const _sessionCredentials = new Map<string, ExtensionCredentials>()

export function setSessionCredentials(connId: string, creds: ExtensionCredentials): void {
  _sessionCredentials.set(connId, creds)
}

export function getSessionCredentials(connId: string): ExtensionCredentials | undefined {
  return _sessionCredentials.get(connId)
}

export function clearSessionCredentials(connId: string): void {
  _sessionCredentials.delete(connId)
}

export function hasSessionCredentials(connId: string): boolean {
  return _sessionCredentials.has(connId)
}

function sendRequest<T>(action: string, payload?: unknown, timeoutMs = TIMEOUT_MS): Promise<T | null> {
  if (typeof window === 'undefined') return Promise.resolve(null)

  return new Promise((resolve) => {
    const id = ++_lastId

    const timer = setTimeout(() => {
      window.removeEventListener('message', handler)
      resolve(null)
    }, timeoutMs)

    function handler(e: MessageEvent) {
      if (e.source !== window) return
      const data = e.data
      if (typeof data !== 'object' || data === null) return
      if (data.channel !== CHANNEL_RES) return
      if (data.id !== id) return
      clearTimeout(timer)
      window.removeEventListener('message', handler)
      resolve((data.payload as T) ?? null)
    }

    window.addEventListener('message', handler)
    window.postMessage({ channel: CHANNEL_REQ, id, action, payload }, window.location.origin)
  })
}

/** Returns true if the SupaAgent extension is present and responding. */
export async function isExtensionPresent(): Promise<boolean> {
  const result = await sendRequest<{ pong: true }>('ping')
  return result !== null
}

/**
 * Request credentials from the extension vault.
 * Returns null if the extension is not installed or has no tokens stored.
 */
export async function getExtensionCredentials(): Promise<ExtensionCredentials | null> {
  return sendRequest<ExtensionCredentials>('get_credentials')
}

/**
 * Route a Supabase API call through the extension.
 * The extension injects credentials and returns only the response — page JS never sees raw tokens.
 *
 * NOTE: This requires the extension's service worker to be awake. For reliable
 * access without keeping the extension open, prefer getExtensionCredentials()
 * and then route through normal /api/* calls using session-only credentials.
 */
export async function proxyRequest(spec: ProxySpec): Promise<ProxyResponse | null> {
  return sendRequest<ProxyResponse>('proxy_request', spec, 8000)
}

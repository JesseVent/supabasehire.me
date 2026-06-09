import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

const MCP_BASE_URL = 'https://mcp.supabase.com/mcp'

export class SupabaseMcpClient {
  private projectRef: string
  private readOnly?: boolean
  private features?: string[]
  private client: Client | null = null
  private transport: StreamableHTTPClientTransport | null = null
  private _token: string
  private _onTokenRefresh?: () => Promise<string | null>
  private _connecting: Promise<void> | null = null
  private _connected = false

  constructor(opts: {
    projectRef?: string
    accessToken: string
    readOnly?: boolean
    features?: string[]
    /**
     * Called on 401 to get a fresh token. Return null if refresh fails.
     * Replaces chrome.runtime.sendMessage from supa-agent's extension context.
     */
    onTokenRefresh?: () => Promise<string | null>
  }) {
    this.projectRef = opts.projectRef ?? ''
    this._token = opts.accessToken
    this.readOnly = opts.readOnly
    this.features = opts.features
    this._onTokenRefresh = opts.onTokenRefresh
  }

  /**
   * Returns a fetch wrapper that injects the Bearer token and auto-refreshes on 401.
   */
  private _createAuthFetch(): typeof fetch {
    return async (input, init?) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : (input as Request).url
      const headers = new Headers(init?.headers)
      headers.set('Authorization', `Bearer ${this._token}`)

      let res = await fetch(url, { ...init, headers })

      if (res.status === 401 && this._onTokenRefresh) {
        const newToken = await this._onTokenRefresh()
        if (newToken) {
          this._token = newToken
          headers.set('Authorization', `Bearer ${this._token}`)
          res = await fetch(url, { ...init, headers })
        }
      }

      return res
    }
  }

  async connect(): Promise<void> {
    if (this._connected) return
    if (this._connecting) return this._connecting

    this._connecting = this._doConnect()
    try {
      await this._connecting
      this._connected = true
    } finally {
      this._connecting = null
    }
  }

  private async _doConnect(): Promise<void> {
    const url = new URL(MCP_BASE_URL)
    if (this.projectRef) url.searchParams.set('project_ref', this.projectRef)
    if (this.readOnly) url.searchParams.set('read_only', 'true')
    if (this.features?.length) url.searchParams.set('features', this.features.join(','))

    this.transport = new StreamableHTTPClientTransport(url, {
      fetch: this._createAuthFetch(),
      reconnectionOptions: {
        initialReconnectionDelay: 1000,
        maxReconnectionDelay: 30000,
        reconnectionDelayGrowFactor: 1.5,
        maxRetries: 2,
      },
    })

    this.client = new Client({ name: 'supabase-devtool', version: '1.0.0' })
    await this.client.connect(this.transport)
  }

  get isConnected(): boolean {
    return this._connected
  }

  async disconnect(): Promise<void> {
    try {
      await this.transport?.close()
    } catch {
      // ignore
    }
    this.transport = null
    this.client = null
    this._connected = false
  }

  async listTools(): Promise<
    {
      name: string
      description?: string
      inputSchema: Record<string, unknown>
    }[]
  > {
    await this.connect()
    const result = await this.client!.listTools()
    return result.tools
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    await this.connect()
    const result = await this.client!.callTool({ name, arguments: args })

    const content = result.content as { type: string; text?: string }[]

    if (result.isError) {
      const text = content
        .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
        .map((c) => c.text)
        .join('\n')
      throw new Error(text || `Tool "${name}" returned an error`)
    }

    return content
      .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
      .map((c) => c.text)
      .join('\n')
  }
}

/**
 * Extract the project ref from a Supabase project URL.
 * e.g. "https://abcdefghijk.supabase.co" → "abcdefghijk"
 */
export function projectRefFromUrl(supabaseUrl: string): string | null {
  try {
    const hostname = new URL(supabaseUrl).hostname
    const ref = hostname.split('.')[0]
    return ref && ref !== 'localhost' ? ref : null
  } catch {
    return null
  }
}

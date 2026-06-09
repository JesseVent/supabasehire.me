// Inlined from @page-agent/skill-router — pure fetch, no runtime deps.
// Source: packages/skill-router/src/client.ts in page-agent-main.

export interface RoutedChunk {
  id: string
  title: string
  content: string
  tags: string[]
  impact: string
  score: number
  rank: number
  relevance_reason: string
}

export interface SkillRouterResult {
  request_id: string
  chunks: RoutedChunk[]
}

export interface SkillRouterAdapter {
  route(task: string): Promise<SkillRouterResult>
  feedback(request_id: string, outcome: 'success' | 'failure'): Promise<void>
}

export class SkillRouterClient {
  constructor(
    private readonly baseUrl: string,
    private readonly anonKey: string
  ) {}

  private async post<T>(fn: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}/functions/v1/${fn}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.anonKey}`,
        apikey: this.anonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }))
      throw new Error(`${fn}: ${(err as { error: string }).error ?? res.statusText}`)
    }
    return res.json() as Promise<T>
  }

  async route(req: { prompt: string; skill_name: string; top_k?: number }) {
    return this.post<SkillRouterResult>('skill-router', req)
  }

  async feedback(req: { request_id: string; outcome: 'success' | 'failure' }) {
    return this.post<{ ok: boolean }>('skill-feedback', req)
  }

  asAdapter(skill_name: string, top_k = 5): SkillRouterAdapter {
    return {
      route: async (task: string) => {
        return this.route({ prompt: task, skill_name, top_k })
      },
      feedback: async (request_id: string, outcome: 'success' | 'failure') => {
        await this.feedback({ request_id, outcome })
      },
    }
  }
}

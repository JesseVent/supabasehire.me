import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { SupabaseConnection } from './supabase-types';

// Client-side JWT cache — Realtime WebSocket and REST both need a real eyJ... JWT.
// New-format keys (sb_publishable_/sb_secret_) are rejected by the gateway.
const jwtCache = new Map<string, { jwt: string; expires: number }>();

async function resolveJwt(supabaseUrl: string, apiKey: string): Promise<string> {
  if (apiKey.startsWith('eyJ')) return apiKey;
  if (!apiKey.startsWith('sb_publishable_') && !apiKey.startsWith('sb_secret_')) return apiKey;

  const cacheKey = `${supabaseUrl}:${apiKey}`;
  const cached = jwtCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.jwt;

  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=anonymous`, {
      method: 'POST',
      headers: { apikey: apiKey, 'Content-Type': 'application/json' },
    });
    if (res.ok) {
      const data = await res.json();
      const jwt: string = data.access_token;
      if (jwt) {
        jwtCache.set(cacheKey, { jwt, expires: Date.now() + 55 * 60 * 1000 });
        return jwt;
      }
    }
  } catch {
    // fall through to raw key
  }
  return apiKey;
}

export async function createSupabaseClient(
  connection: SupabaseConnection,
  useServiceRole = false
): Promise<SupabaseClient> {
  const rawKey =
    useServiceRole && connection.serviceRoleKey
      ? connection.serviceRoleKey
      : connection.anonKey;

  const key = await resolveJwt(connection.supabaseUrl, rawKey);
  return createClient(connection.supabaseUrl, key);
}

export function extractProjectRef(url: string): string {
  const match = url.match(/https?:\/\/([a-zA-Z0-9-]+)\.supabase\.co/);
  return match ? match[1] : '';
}

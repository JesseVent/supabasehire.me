import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { SupabaseConnection } from './supabase-types';

// Client-side JWT cache — Realtime WebSocket requires a real eyJ... JWT.
// New-format keys (sb_publishable_/sb_secret_) are rejected by the Realtime gateway.
// Exchange runs server-side (/api/realtime-token) to avoid CORS issues.
const jwtCache = new Map<string, { jwt: string; expires: number }>();

async function resolveRealtimeJwt(connection: SupabaseConnection): Promise<string> {
  const anonKey = connection.anonKey;
  if (anonKey.startsWith('eyJ')) return anonKey;

  const cacheKey = `${connection.supabaseUrl}:${anonKey}`;
  const cached = jwtCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.jwt;

  try {
    const res = await fetch('/api/realtime-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supabaseUrl: connection.supabaseUrl,
        anonKey,
        accessToken: connection.accessToken,
      }),
    });
    const data = await res.json() as { token?: string; error?: string };
    if (data.token?.startsWith('eyJ')) {
      jwtCache.set(cacheKey, { jwt: data.token, expires: Date.now() + 55 * 60 * 1000 });
      return data.token;
    }
    console.warn('[Realtime] JWT exchange failed:', data.error);
  } catch (err) {
    console.warn('[Realtime] JWT exchange error:', err);
  }
  return anonKey;
}

export async function createSupabaseClient(
  connection: SupabaseConnection,
  useServiceRole = false
): Promise<SupabaseClient> {
  const jwt = await resolveRealtimeJwt(connection);

  const clientKey = useServiceRole && connection.serviceRoleKey
    ? connection.serviceRoleKey
    : (jwt.startsWith('eyJ') ? jwt : connection.anonKey);

  return createClient(connection.supabaseUrl, clientKey, {
    realtime: {
      params: {
        // Always use the JWT for the WebSocket URL regardless of which key the
        // rest of the client uses.
        apikey: jwt,
      },
    },
  });
}

export function extractProjectRef(url: string): string {
  const match = url.match(/https?:\/\/([a-zA-Z0-9-]+)\.supabase\.co/);
  return match ? match[1] : '';
}

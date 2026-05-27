import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { SupabaseConnection } from './supabase-types';

// Client-side JWT cache — Realtime WebSocket and REST both need a real eyJ... JWT.
// New-format keys (sb_publishable_/sb_secret_) are rejected by the Realtime gateway.
// We exchange them server-side via /api/realtime-token to avoid CORS issues.
const jwtCache = new Map<string, { jwt: string; expires: number }>();

async function resolveJwt(supabaseUrl: string, anonKey: string): Promise<string> {
  if (anonKey.startsWith('eyJ')) return anonKey;
  if (!anonKey.startsWith('sb_publishable_') && !anonKey.startsWith('sb_secret_')) return anonKey;

  const cacheKey = `${supabaseUrl}:${anonKey}`;
  const cached = jwtCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.jwt;

  try {
    const res = await fetch('/api/realtime-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ supabaseUrl, anonKey }),
    });
    if (res.ok) {
      const data = await res.json() as { token?: string; error?: string };
      if (data.token?.startsWith('eyJ')) {
        jwtCache.set(cacheKey, { jwt: data.token, expires: Date.now() + 55 * 60 * 1000 });
        return data.token;
      }
      console.warn('[Realtime] JWT exchange failed:', data.error);
    } else {
      const data = await res.json().catch(() => ({})) as { error?: string };
      console.warn('[Realtime] JWT exchange failed:', data.error ?? res.status);
    }
  } catch (err) {
    console.warn('[Realtime] JWT exchange error:', err);
  }
  return anonKey;
}

export async function createSupabaseClient(
  connection: SupabaseConnection,
  useServiceRole = false
): Promise<SupabaseClient> {
  // Always use the anonKey for JWT exchange — it's the correct key for Realtime
  // (service role keys bypass RLS which is unsafe in the browser, and the anon
  // key is what anonymous sign-in authenticates against).
  const jwt = await resolveJwt(connection.supabaseUrl, connection.anonKey);

  // Create the client with the JWT (or fall back to raw key if exchange failed).
  // Pass service role key via options only if explicitly requested and available.
  const clientKey = useServiceRole && connection.serviceRoleKey
    ? connection.serviceRoleKey
    : jwt;

  return createClient(connection.supabaseUrl, clientKey, {
    realtime: {
      params: {
        // Override the apikey param specifically for the WebSocket URL to always
        // use the JWT, regardless of which key the client itself uses for REST.
        apikey: jwt,
      },
    },
  });
}

export function extractProjectRef(url: string): string {
  const match = url.match(/https?:\/\/([a-zA-Z0-9-]+)\.supabase\.co/);
  return match ? match[1] : '';
}

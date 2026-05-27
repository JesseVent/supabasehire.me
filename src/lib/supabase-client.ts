import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { SupabaseConnection } from './supabase-types';

// Supabase Realtime WebSocket requires the *publishable* (anon) key in the apikey param.
// The service role key (sb_secret_) causes HTTP 500 from the Realtime gateway.
// JWT-format keys cause HTTP 401 (gateway no longer accepts legacy JWTs for new projects).
// Solution: always pass anonKey for Realtime regardless of which key the client uses for REST.
export async function createSupabaseClient(
  connection: SupabaseConnection,
  useServiceRole = false
): Promise<SupabaseClient> {
  const clientKey = useServiceRole && connection.serviceRoleKey
    ? connection.serviceRoleKey
    : connection.anonKey;

  return createClient(connection.supabaseUrl, clientKey, {
    realtime: {
      params: {
        // Always use the anon (publishable) key for the WebSocket URL.
        // Using sb_secret_ causes 500; using a JWT causes 401 on new-format projects.
        apikey: connection.anonKey,
      },
    },
  });
}

export function extractProjectRef(url: string): string {
  const match = url.match(/https?:\/\/([a-zA-Z0-9-]+)\.supabase\.co/);
  return match ? match[1] : '';
}

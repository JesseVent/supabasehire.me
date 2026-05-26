import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { SupabaseConnection } from './supabase-types';

export function createSupabaseClient(
  connection: SupabaseConnection,
  useServiceRole = false
): SupabaseClient {
  const key =
    useServiceRole && connection.serviceRoleKey
      ? connection.serviceRoleKey
      : connection.anonKey;
  return createClient(connection.supabaseUrl, key);
}

export function extractProjectRef(url: string): string {
  // Extract project ref from URL like https://xyzproject.supabase.co
  const match = url.match(/https?:\/\/([a-zA-Z0-9-]+)\.supabase\.co/);
  return match ? match[1] : '';
}

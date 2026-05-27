import { NextRequest, NextResponse } from 'next/server';

function extractRef(url: string): string {
  const m = url.match(/https?:\/\/([a-zA-Z0-9-]+)\.supabase\.co/);
  return m ? m[1] : '';
}

// POST /api/realtime-token
// Server-side JWT exchange for Realtime WebSocket authentication.
// The Supabase Realtime gateway requires a JWT in the apikey param — new-format
// sb_publishable_ / sb_secret_ opaque keys are rejected.
//
// Strategy (in order):
//   1. Key is already a JWT → return as-is
//   2. grant_type=anonymous with anon key (works if anonymous auth is enabled)
//   3. Management API /v1/projects/{ref}/api-keys → returns legacy JWT anon key
export async function POST(request: NextRequest) {
  try {
    const { supabaseUrl, anonKey, accessToken } = await request.json() as {
      supabaseUrl: string;
      anonKey: string;
      accessToken?: string;
    };

    if (!supabaseUrl || !anonKey) {
      return NextResponse.json({ error: 'supabaseUrl and anonKey required' }, { status: 400 });
    }

    // 1. Already a JWT
    if (anonKey.startsWith('eyJ')) {
      return NextResponse.json({ token: anonKey });
    }

    // 2. Try grant_type=anonymous (requires anonymous auth to be enabled)
    try {
      const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=anonymous`, {
        method: 'POST',
        headers: { apikey: anonKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const data = await res.json() as { access_token?: string };
        if (data.access_token?.startsWith('eyJ')) {
          return NextResponse.json({ token: data.access_token });
        }
      }
    } catch {
      // fall through to Management API
    }

    // 3. Management API fallback — get legacy JWT-format anon key
    if (accessToken) {
      const ref = extractRef(supabaseUrl);
      if (ref) {
        try {
          const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (res.ok) {
            const keys = await res.json() as Array<{ name: string; api_key: string }>;
            const anonEntry = keys.find((k) => k.name === 'anon');
            if (anonEntry?.api_key?.startsWith('eyJ')) {
              return NextResponse.json({ token: anonEntry.api_key });
            }
            // Also check service_role key as fallback
            const srEntry = keys.find((k) => k.name === 'service_role');
            if (srEntry?.api_key?.startsWith('eyJ')) {
              return NextResponse.json({ token: srEntry.api_key });
            }
          }
        } catch {
          // fall through
        }
      }
    }

    return NextResponse.json(
      {
        error:
          'Could not obtain a JWT for Realtime. Enable Anonymous Authentication in your Supabase project (Authentication → Providers → Anonymous), or ensure a Management API access token is configured.',
      },
      { status: 502 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: `Unexpected error: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}

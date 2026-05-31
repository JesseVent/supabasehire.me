import { NextRequest, NextResponse } from 'next/server';

function extractRef(url: string): string {
  const m = url.match(/https?:\/\/([a-zA-Z0-9-]+)\.supabase\.co/);
  return m ? m[1] : '';
}

// Build a minimal Supabase anon JWT from a raw JWT secret using Web Crypto.
async function buildAnonJwt(ref: string, jwtSecret: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = { iss: 'supabase', ref, role: 'anon', iat: now, exp: now + 3600 };

  const enc = (obj: object) =>
    Buffer.from(JSON.stringify(obj)).toString('base64url');

  const data = `${enc(header)}.${enc(payload)}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(jwtSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return `${data}.${Buffer.from(sig).toString('base64url')}`;
}

// POST /api/realtime-token
// Server-side JWT exchange for Realtime WebSocket authentication.
// The Supabase Realtime gateway requires a JWT in the apikey param — new-format
// sb_publishable_ / sb_secret_ opaque keys are rejected.
//
// Strategy (in order):
//   1. Key is already a JWT → return as-is
//   2. grant_type=anonymous with anon key (works if anonymous auth is enabled)
//   3. Management API /v1/projects/{ref}/api-keys → legacy JWT anon key
//   4. Management API /v1/projects/{ref}/config/postgrest → jwt_secret → generate JWT
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

    // 2. Anonymous sign-in: POST /auth/v1/signup with provider:"anon"
    //    Works when Anonymous Authentication is enabled in the Supabase project.
    try {
      const res = await fetch(`${supabaseUrl}/auth/v1/signup`, {
        method: 'POST',
        headers: { apikey: anonKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: {}, provider: 'anon' }),
      });
      if (res.ok) {
        const data = await res.json() as { access_token?: string; session?: { access_token?: string } };
        const token = data.access_token ?? data.session?.access_token;
        if (token?.startsWith('eyJ')) {
          return NextResponse.json({ token });
        }
      }
    } catch {
      // fall through
    }

    const ref = extractRef(supabaseUrl);

    // 3. Management API: try to get legacy JWT-format anon key from api-keys list
    if (accessToken && ref) {
      try {
        const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (res.ok) {
          const keys = await res.json() as Array<{ name: string; api_key: string }>;
          for (const entry of keys) {
            if (entry.api_key?.startsWith('eyJ')) {
              return NextResponse.json({ token: entry.api_key });
            }
          }
        }
      } catch {
        // fall through
      }

      // 4. Management API: get jwt_secret from PostgREST config, generate JWT ourselves
      try {
        const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/postgrest`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (res.ok) {
          const config = await res.json() as { jwt_secret?: string };
          if (config.jwt_secret) {
            const token = await buildAnonJwt(ref, config.jwt_secret);
            return NextResponse.json({ token });
          }
        }
      } catch {
        // fall through
      }
    }

    return NextResponse.json(
      {
        error:
          'Could not obtain a Realtime JWT. Options: (a) enable Anonymous Authentication in your Supabase project, or (b) add your Management API access token to the connection.',
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

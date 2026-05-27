import { NextRequest, NextResponse } from 'next/server';

// POST /api/realtime-token
// Server-side JWT exchange for Realtime WebSocket authentication.
// The Supabase Realtime gateway requires a JWT in the apikey param — new-format
// sb_publishable_ / sb_secret_ opaque keys are rejected. This route exchanges them
// for a real JWT via the GoTrue anonymous sign-in endpoint, running server-side to
// avoid any client-side CORS issues.
export async function POST(request: NextRequest) {
  try {
    const { supabaseUrl, anonKey } = await request.json() as {
      supabaseUrl: string;
      anonKey: string;
    };

    if (!supabaseUrl || !anonKey) {
      return NextResponse.json({ error: 'supabaseUrl and anonKey required' }, { status: 400 });
    }

    // If it's already a JWT, return it as-is
    if (anonKey.startsWith('eyJ')) {
      return NextResponse.json({ token: anonKey });
    }

    // Try grant_type=anonymous to exchange the publishable key for a real JWT
    const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=anonymous`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    if (res.ok) {
      const data = await res.json() as { access_token?: string };
      if (data.access_token?.startsWith('eyJ')) {
        return NextResponse.json({ token: data.access_token });
      }
    }

    const errText = await res.text().catch(() => '');
    return NextResponse.json(
      { error: `Auth exchange failed (${res.status}): ${errText}` },
      { status: 502 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: `Unexpected error: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}

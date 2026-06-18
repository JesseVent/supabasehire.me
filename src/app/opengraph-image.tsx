import { ImageResponse } from 'next/og'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: '#0a0a0a',
          backgroundImage:
            'radial-gradient(circle at 25% 15%, rgba(62,207,142,0.18), transparent 45%)',
          fontFamily: 'monospace',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 20,
            marginBottom: 28,
          }}
        >
          <div
            style={{
              width: 14,
              height: 14,
              borderRadius: '50%',
              backgroundColor: '#3ECF8E',
              boxShadow: '0 0 24px 4px rgba(62,207,142,0.6)',
            }}
          />
          <span style={{ color: '#3ECF8E', fontSize: 28, letterSpacing: 2 }}>
            supabasehire.me
          </span>
        </div>
        <div
          style={{
            color: '#fafafa',
            fontSize: 72,
            fontWeight: 700,
            letterSpacing: -1,
          }}
        >
          Supabase DevTool
        </div>
        <div
          style={{
            color: '#a1a1aa',
            fontSize: 30,
            marginTop: 24,
            maxWidth: 880,
            textAlign: 'center',
          }}
        >
          RLS simulation, edge function testing, AI SQL, Iceberg & agent observability — one
          Supabase devtool
        </div>
      </div>
    ),
    { ...size }
  )
}

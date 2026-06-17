// PostHog is initialized in instrumentation-client.ts (Next.js 15.3+ pattern).
// This component is kept as a no-op to avoid breaking existing imports in layout.tsx.
export function PostHogInit() {
  return null
}

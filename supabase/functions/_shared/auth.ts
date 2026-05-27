// Shared auth helper for functions deployed with --no-verify-jwt.
// New-format keys (sb_publishable_/sb_secret_) are not JWTs so the platform
// cannot verify them. Each function validates the apikey header manually here.
export function isAuthorized(req: Request): boolean {
  const secretKeys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}');
  const publishableKeys = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}');
  const validKeys = new Set([
    ...Object.values(secretKeys) as string[],
    ...Object.values(publishableKeys) as string[],
  ]);

  const incoming =
    req.headers.get('apikey') ??
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');

  return incoming != null && validKeys.has(incoming);
}

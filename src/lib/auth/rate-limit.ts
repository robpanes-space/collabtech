/**
 * Small in-memory fixed-window limiter for login attempts. Per server instance (best effort on
 * serverless); combined with scrypt cost it makes online guessing slow. Keys are fingerprints,
 * never raw passwords.
 */
export function createRateLimiter(limit: number, windowMs: number) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return {
    /** Returns true when the attempt is allowed (and records it). */
    attempt(key: string, now = Date.now()): boolean {
      if (hits.size > 10_000) {
        for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
      }
      const entry = hits.get(key);
      if (!entry || entry.resetAt <= now) {
        hits.set(key, { count: 1, resetAt: now + windowMs });
        return true;
      }
      entry.count++;
      return entry.count <= limit;
    },
    reset(key: string) {
      hits.delete(key);
    },
  };
}

export const loginLimiter = createRateLimiter(8, 15 * 60 * 1000);

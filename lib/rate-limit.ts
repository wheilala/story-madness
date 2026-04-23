const buckets = new Map<string, { count: number; resetAt: number }>();

export function assertRateLimit(key: string, maxPerMinute = 30) {
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || current.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + 60_000 });
    return;
  }
  current.count += 1;
  if (current.count > maxPerMinute) {
    throw new Error("RATE_LIMITED");
  }
}

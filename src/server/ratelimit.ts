export interface RateRule {
  limit: number;
  windowSeconds: number;
}

export const RULES = {
  login: { limit: 5, windowSeconds: 300 },
  order: { limit: 10, windowSeconds: 600 },
  read: { limit: 120, windowSeconds: 60 },
} satisfies Record<string, RateRule>;

export async function hitRateLimit(db: D1Database, key: string, rule: RateRule, nowMs = Date.now()): Promise<boolean> {
  const now = Math.floor(nowMs / 1000);
  const windowStart = now - (now % rule.windowSeconds);
  const row = await db
    .prepare(
      `INSERT INTO rate_limits (key, window_start, count) VALUES (?1, ?2, 1)
       ON CONFLICT(key) DO UPDATE SET
         count = CASE WHEN rate_limits.window_start = ?2 THEN rate_limits.count + 1 ELSE 1 END,
         window_start = ?2
       RETURNING count`,
    )
    .bind(key, windowStart)
    .first<{ count: number }>();
  return (row?.count ?? 0) > rule.limit;
}

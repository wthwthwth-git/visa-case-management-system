import type { RateLimitAdapter, RateLimitHit, RateLimitIncrementInput } from "./types";

type UpstashEvalClient = {
  eval<TArgs extends unknown[], TData = unknown>(
    script: string,
    keys: string[],
    args: TArgs,
  ): Promise<TData>;
};

const INCREMENT_WITH_TTL_SCRIPT = `
local count = redis.call("INCR", KEYS[1])
if count == 1 then
  redis.call("EXPIRE", KEYS[1], tonumber(ARGV[1]))
end
local ttl = redis.call("TTL", KEYS[1])
if ttl < 0 then
  redis.call("EXPIRE", KEYS[1], tonumber(ARGV[1]))
  ttl = tonumber(ARGV[1])
end
return { count, ttl }
`;

export class UpstashRateLimitAdapter implements RateLimitAdapter {
  constructor(private readonly redis: UpstashEvalClient) {}

  async increment(input: RateLimitIncrementInput): Promise<RateLimitHit> {
    const [count, ttl] = await this.incrementWithTtl(input.key, input.windowSeconds);
    const retryAfterSeconds = Math.max(1, ttl);
    const allowed = count <= input.limit;

    return {
      count,
      limit: input.limit,
      windowSeconds: input.windowSeconds,
      resetAt: new Date(Date.now() + retryAfterSeconds * 1000),
      retryAfterSeconds: allowed ? null : retryAfterSeconds,
      allowed,
    };
  }

  private async incrementWithTtl(key: string, windowSeconds: number): Promise<[number, number]> {
    const result = await this.redis.eval<[string], unknown>(
      INCREMENT_WITH_TTL_SCRIPT,
      [`rate-limit:${key}`],
      [String(windowSeconds)],
    );

    return parseUpstashIncrementResult(result, windowSeconds);
  }
}

function parseUpstashIncrementResult(result: unknown, windowSeconds: number): [number, number] {
  if (!Array.isArray(result) || result.length < 2) {
    throw new Error("Invalid Upstash rate limit response.");
  }

  const count = Number(result[0]);
  const ttl = Number(result[1]);

  if (!Number.isFinite(count) || !Number.isFinite(ttl)) {
    throw new Error("Invalid Upstash rate limit response.");
  }

  return [count, Math.max(1, Math.ceil(ttl || windowSeconds))];
}

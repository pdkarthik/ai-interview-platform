import { NextRequest } from "next/server";

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(
  req: NextRequest,
  limit = 5,
  windowMs = 60 * 1000,
): { allowed: boolean; remaining: number } {
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0].trim() : "127.0.0.1";

  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1 };
  }

  if (entry.count >= limit) {
    return { allowed: false, remaining: 0 };
  }

  entry.count += 1;
  return { allowed: true, remaining: limit - entry.count };
}


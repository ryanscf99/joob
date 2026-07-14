import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

const buckets = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(
  request: NextRequest,
  scope: string,
  limit = 12,
  windowMs = 60_000
) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const key = `${scope}:${forwarded || "local"}`;
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }
  current.count += 1;
  if (current.count > limit) {
    return NextResponse.json(
      { ok: false, error: "Too many requests. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((current.resetAt - now) / 1000)) } }
    );
  }
  return null;
}

/**
 * @param optional - when true, missing session continues in guest/demo mode
 *   (used for Grok smart match so AI works without forced login).
 *   CV upload and sensitive tools should keep optional=false.
 */
export async function requireApiUser(opts?: { optional?: boolean }) {
  if (!isSupabaseConfigured()) {
    return { user: null, demoMode: true, response: null as NextResponse | null };
  }
  try {
    const supabase = await getSupabaseServerClient();
    const result = await Promise.race([
      supabase?.auth.getUser() ?? Promise.resolve({ data: { user: null } }),
      new Promise<{ data: { user: null } }>((resolve) =>
        setTimeout(() => resolve({ data: { user: null } }), 2500)
      ),
    ]);
    const user = result?.data?.user ?? null;
    if (!user) {
      if (opts?.optional) {
        return { user: null, demoMode: true, response: null as NextResponse | null };
      }
      return {
        user: null,
        demoMode: false,
        response: NextResponse.json(
          {
            ok: false,
            error:
              "Sign in is required for this tool. You can still browse jobs without signing in.",
          },
          { status: 401 }
        ),
      };
    }
    return { user, demoMode: false, response: null as NextResponse | null };
  } catch {
    if (opts?.optional) {
      return { user: null, demoMode: true, response: null as NextResponse | null };
    }
    return {
      user: null,
      demoMode: false,
      response: NextResponse.json(
        { ok: false, error: "Auth check failed. Try again or continue as guest for matching." },
        { status: 503 }
      ),
    };
  }
}

export function noStoreJson(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff",
      ...(init?.headers || {}),
    },
  });
}

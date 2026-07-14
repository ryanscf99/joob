import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refresh Supabase session cookies when configured.
 * Must never block the app: failures degrade to passthrough so
 * start/local browsing works even if Supabase is slow or down.
 */
export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return NextResponse.next();
  }

  // Skip session refresh for static-ish assets already excluded by matcher,
  // and never hang API job scrapers on auth.
  const path = request.nextUrl.pathname;
  if (
    path.startsWith("/api/dsal") ||
    path.startsWith("/api/jobscall") ||
    path.startsWith("/api/hellojobs") ||
    path.startsWith("/api/faculty")
  ) {
    return NextResponse.next();
  }

  try {
    let response = NextResponse.next({ request });
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    });

    // Race auth with a short timeout so a dead Supabase cannot freeze the app
    await Promise.race([
      supabase.auth.getUser(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("supabase auth timeout")), 2500)
      ),
    ]).catch(() => null);

    return response;
  } catch {
    return NextResponse.next();
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|mp4|webm)$).*)",
  ],
};

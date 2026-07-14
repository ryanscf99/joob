import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const supabase = await getSupabaseServerClient();
  if (code && supabase) {
    await supabase.auth.exchangeCodeForSession(code);
  }
  return NextResponse.redirect(new URL("/youth", request.url));
}

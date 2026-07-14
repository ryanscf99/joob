/** Normalize env values (trim, strip quotes, first line only). */
function cleanEnv(raw: string | undefined | null): string {
  if (!raw) return "";
  let v = String(raw).trim();
  // If a multi-line paste leaked into the value, keep only the first line
  v = v.split(/\r?\n/)[0].trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1).trim();
  }
  // Guard against accidental "url" + other env contamination
  const urlMatch = v.match(/^(https:\/\/[a-z0-9-]+\.supabase\.co)\/?/i);
  if (urlMatch && v.length > urlMatch[1].length + 5) {
    return urlMatch[1];
  }
  return v;
}

export function isSupabaseConfigured() {
  const url = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = cleanEnv(
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  return Boolean(url && key && url.includes("supabase"));
}

export function getSupabaseConfig() {
  const url = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = cleanEnv(
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  if (!url || !key) {
    throw new Error("Supabase is not configured");
  }
  return { url, key };
}

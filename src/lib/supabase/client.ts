"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseConfig, isSupabaseConfigured } from "./config";

let client: ReturnType<typeof createBrowserClient> | null = null;

export function getSupabaseBrowserClient() {
  if (!isSupabaseConfigured()) return null;
  if (!client) {
    const { url, key } = getSupabaseConfig();
    client = createBrowserClient(url, key);
  }
  return client;
}

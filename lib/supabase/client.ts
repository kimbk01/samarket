"use client";

/**
 * Supabase 브라우저 클라이언트 (@supabase/ssr — 쿠키 동기화, API Route와 세션 공유)
 */
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (typeof window === "undefined") return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) return null;
  if (!client) {
    const secure = window.location.protocol === "https:";
    client = createBrowserClient(url, key, {
      cookieOptions: {
        path: "/",
        sameSite: "lax",
        secure,
      },
    });
  }
  return client;
}

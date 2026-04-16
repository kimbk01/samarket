"use client";

/**
 * Supabase 브라우저 클라이언트 (@supabase/ssr — 쿠키 동기화, API Route와 세션 공유)
 */
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dispatchSamarketRealtimeTokenRefreshed } from "@/lib/supabase/realtime-auth-events";

let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (typeof window === "undefined") return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) return null;
  if (typeof window !== "undefined" && window.location.protocol === "https:" && url.startsWith("http://")) {
    console.warn(
      "[samarket] App is HTTPS but NEXT_PUBLIC_SUPABASE_URL is http — Realtime/WebRTC may fail on deployed Chrome. Use https:// for Supabase."
    );
  }
  if (!client) {
    /** 배포(HTTPS)에서는 secure 쿠키·WSS Realtime — 로컬 http 에서만 secure: false */
    const secure = window.location.protocol === "https:";
    client = createBrowserClient(url, key, {
      cookieOptions: {
        path: "/",
        sameSite: "lax",
        secure,
      },
    });
    const sb = client;
    /**
     * Realtime `postgres_changes` RLS 는 WS 에 붙은 JWT 기준이다.
     * SupabaseClient 내부 `_handleTokenChanged` 는 `SIGNED_IN` / `TOKEN_REFRESHED` 만
     * `realtime.setAuth` 로 넘기고, `@supabase/ssr` 쿠키 복원으로만 세션이 잡히는 경우
     * (`INITIAL_SESSION` 등) 는 빠질 수 있다. 그러면 채널은 SUBSCRIBED 인데 anon JWT 로
     * RLS 가 막혀 메신저 메시지 INSERT 이벤트가 영구히 안 온다.
     */
    void sb.auth.getSession().then(({ data: { session } }) => {
      const t = session?.access_token;
      if (t) void sb.realtime.setAuth(t);
    });
    sb.auth.onAuthStateChange((event, session) => {
      const t = session?.access_token ?? null;
      if (t) {
        void sb.realtime.setAuth(t);
        if (event === "TOKEN_REFRESHED") {
          dispatchSamarketRealtimeTokenRefreshed();
        }
      } else if (event === "SIGNED_OUT") {
        void sb.realtime.setAuth();
      }
    });
  }
  return client;
}

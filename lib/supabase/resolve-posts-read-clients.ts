import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { requireSupabaseEnv } from "@/lib/env/runtime";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

/**
 * `resolveServiceSupabaseForApi` 와 동일 순서 — `SUPABASE_SERVICE_ROLE_KEY` 만 있고
 * `getSupabaseServer()`(엄격 env) 가 실패하는 배포에서도 서비스 롤로 posts 를 읽을 수 있게 한다.
 */
export function tryGetSupabaseServiceClient(): SupabaseClient<any> | null {
  const direct = tryCreateSupabaseServiceClient();
  if (direct) return direct;
  try {
    return getSupabaseServer();
  } catch {
    return null;
  }
}

export function createSupabaseFromRequestForRead(
  request: NextRequest,
  url: string,
  anonKey: string
): SupabaseClient<any> {
  const cookieSecure = process.env.VERCEL === "1" || process.env.NODE_ENV === "production";
  return createServerClient<any>(url, anonKey, {
    cookieOptions: {
      path: "/",
      sameSite: "lax",
      secure: cookieSecure,
    },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(_cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        /* 읽기 전용 라우트 */
      },
    },
  });
}

export type PostsReadClients = {
  readSb: SupabaseClient<any>;
  serviceSb: SupabaseClient<any> | null;
  favoritesSb: SupabaseClient<any>;
};

/** 홈·거래 피드·글 상세 등 posts 읽기 API 공통 */
export function resolvePostsReadClients(request: NextRequest): PostsReadClients | null {
  const serviceSb = tryGetSupabaseServiceClient();
  const env = requireSupabaseEnv({ requireAnonKey: true });
  if (serviceSb) {
    return { readSb: serviceSb, serviceSb, favoritesSb: serviceSb };
  }
  if (!env.ok) return null;
  const readSb = createSupabaseFromRequestForRead(request, env.url, env.anonKey);
  return { readSb, serviceSb: null, favoritesSb: readSb };
}

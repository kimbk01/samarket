import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { requireSupabaseEnv } from "@/lib/env/runtime";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/supabase-server-route";

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

/**
 * App Router 서버 컴포넌트 — `NextRequest` 없이 쿠키 기반 클라이언트로 posts 읽기.
 * API 의 `resolvePostsReadClients(req)` 와 동일 우선순위(서비스 롤 우선).
 */
export async function resolvePostsReadClientsForServerComponent(): Promise<PostsReadClients | null> {
  const serviceSb = tryGetSupabaseServiceClient();
  if (serviceSb) {
    return { readSb: serviceSb, serviceSb, favoritesSb: serviceSb };
  }
  const env = requireSupabaseEnv({ requireAnonKey: true });
  if (!env.ok) return null;
  const readSb = await createSupabaseRouteHandlerClient();
  if (!readSb) return null;
  return { readSb, serviceSb: null, favoritesSb: readSb };
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 내상품 목록 (본인이 올린 글) — 서비스 롤
 * GET /api/my/posts (세션)
 * 조회는 `loadMyPostsServer` 단일 함수(내정보 요약 `salesActiveCount` 와 공유).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { loadMyPostsServer } from "@/lib/my/load-my-posts-server";

export async function GET(_req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const userId = auth.userId;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ error: "서버 설정 필요" }, { status: 500 });
  }
  const sbAny = sb as import("@supabase/supabase-js").SupabaseClient<any>;

  const loaded = await loadMyPostsServer(sbAny, userId);
  if (!loaded.ok) {
    return NextResponse.json({ error: loaded.error }, { status: 500 });
  }

  return NextResponse.json({ posts: loaded.posts });
}

import { POSTS_TABLE_READ, POSTS_TABLE_WRITE } from "@/lib/posts/posts-db-tables";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/favorites/toggle — 찜 토글
 * Body: { postId: string } — 사용자는 세션에서만 결정
 * 성공 시 `favorite_audit_log`에 기록(테이블 없으면 무시) — `/admin/favorites` 감사 로그와 동일 소스
 */
import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAuthenticatedUserIdStrict } from "@/lib/auth/api-session";
import { requirePhoneVerified, validateActiveSession } from "@/lib/auth/server-guards";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { enforceFavoriteToggleQuota } from "@/lib/security/rate-limit-presets";
import { invalidatePostFavoriteServerCachesForViewer } from "@/lib/posts/invalidate-post-favorite-server-caches";

async function appendFavoriteAuditLog(
  sbAny: SupabaseClient,
  userId: string,
  postId: string,
  action: "add" | "remove"
) {
  try {
    const { error } = await sbAny.from("favorite_audit_log").insert({
      user_id: userId,
      post_id: postId,
      action,
      created_at: new Date().toISOString(),
    });
    if (error && process.env.NODE_ENV === "development") {
      console.warn("[favorite_audit_log]", error.message);
    }
  } catch {
    /* 스키마 미적용 등 */
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserIdStrict();
  if (!auth.ok) return auth.response;
  const userId = auth.userId;
  const session = await validateActiveSession(userId);
  if (!session.ok) return session.response;
  const phone = await requirePhoneVerified(userId);
  if (!phone.ok) return phone.response;

  const favRl = await enforceFavoriteToggleQuota(userId);
  if (!favRl.ok) return favRl.response;

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json(
      { ok: false, error: "서버 설정이 필요합니다." },
      { status: 500 }
    );
  }

  let body: { postId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "잘못된 요청" }, { status: 400 });
  }

  const postId = typeof body.postId === "string" ? body.postId.trim() : "";

  if (!postId) {
    return NextResponse.json({ ok: false, error: "postId가 필요합니다." }, { status: 400 });
  }

  const sbAny = sb;

  try {
    const { data: postRow } = await sbAny
      .from(POSTS_TABLE_READ)
      .select("user_id")
      .eq("id", postId)
      .maybeSingle();

    const ownerId =
      postRow && typeof (postRow as { user_id?: string }).user_id === "string"
        ? (postRow as { user_id: string }).user_id
        : null;

    if (ownerId && ownerId === userId) {
      return NextResponse.json(
        { ok: false, error: "본인이 등록한 글에는 찜할 수 없습니다." },
        { status: 400 }
      );
    }

    const { data: existing } = await sbAny
      .from("favorites")
      .select("id")
      .eq("user_id", userId)
      .eq("post_id", postId)
      .maybeSingle();

    if (existing) {
      const { error } = await sbAny
        .from("favorites")
        .delete()
        .eq("user_id", userId)
        .eq("post_id", postId);
      if (error) {
        return NextResponse.json(
          { ok: false, error: error.message ?? "삭제에 실패했습니다." },
          { status: 500 }
        );
      }
      await appendFavoriteAuditLog(sbAny, userId, postId, "remove");
      invalidatePostFavoriteServerCachesForViewer(userId);
      return NextResponse.json({ ok: true, isFavorite: false });
    }

    const { error } = await sbAny.from("favorites").insert({
      user_id: userId,
      post_id: postId,
      created_at: new Date().toISOString(),
    });
    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message ?? "추가에 실패했습니다." },
        { status: 500 }
      );
    }
    await appendFavoriteAuditLog(sbAny, userId, postId, "add");
    invalidatePostFavoriteServerCachesForViewer(userId);
    return NextResponse.json({ ok: true, isFavorite: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error)?.message ?? "처리에 실패했습니다." },
      { status: 500 }
    );
  }
}

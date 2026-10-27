import { POSTS_TABLE_WRITE } from "@/lib/posts/posts-db-tables";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/favorites/toggle — 찜 토글
 * Body: { postId: string, favorite?: boolean } — 사용자는 세션에서만 결정
 * P-3 (F2): `favorite` 를 주면 **원하는 상태로 맞춘다(멱등)** — 두 번 누름·다른 기기 동시 누름에도 뒤집히지 않고 500 이 나지 않는다.
 * `favorite` 가 없으면 예전 클라이언트용 토글(현재 상태 반대로).
 * 성공 시 `favorite_audit_log`에 기록(테이블 없으면 무시) — `/admin/favorites` 감사 로그와 동일 소스
 *
 * CUT G CASE B: the app never writes `posts.favorite_count` — DB trigger `tr_favorites_sync_count` maintains it (확인 2026-10-27, 불일치 0건).
 * Do not UPDATE that column here. Response `favoriteCount` is live `favorites` COUNT only.
 */
import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAuthenticatedUserIdStrict } from "@/lib/auth/api-session";
import { requireSignupCompleteForUser } from "@/lib/auth/require-signup-complete-api";
import { validateActiveSession } from "@/lib/auth/server-guards";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { enforceFavoriteToggleQuota } from "@/lib/security/rate-limit-presets";
import { invalidatePostFavoriteServerCachesForViewer } from "@/lib/posts/invalidate-post-favorite-server-caches";
import { countFavoritesForPostId } from "@/lib/posts/post-favorite-count-server";

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

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json(
      { ok: false, error: "서버 설정이 필요합니다." },
      { status: 500 }
    );
  }

  const signupGate = await requireSignupCompleteForUser(
    sb as import("@supabase/supabase-js").SupabaseClient,
    userId
  );
  if (!signupGate.ok) return signupGate.response;

  /** 거래 H F-3: 찜 토글 횟수 제한(분당 200) — 결과를 실제로 적용한다(예전에는 검사하지 않아 한도가 무력했다) */
  const favRl = await enforceFavoriteToggleQuota(userId);
  if (!favRl.ok) return favRl.response;

  let body: { postId?: string; favorite?: unknown };
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
      .from(POSTS_TABLE_WRITE)
      .select("user_id, status, moderation_state, owner_state, is_deleted")
      .eq("id", postId)
      .maybeSingle();

    /** 거래 H F-3: 없는 글은 404 */
    if (!postRow) {
      return NextResponse.json({ ok: false, error: "글을 찾을 수 없습니다." }, { status: 404 });
    }

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

    let desired: boolean;
    if (typeof body.favorite === "boolean") {
      desired = body.favorite;
    } else {
      const { data: existing } = await sbAny
        .from("favorites")
        .select("id")
        .eq("user_id", userId)
        .eq("post_id", postId)
        .maybeSingle();
      desired = !existing;
    }

    /**
     * 거래 H F-3: 숨김·삭제·관리자 숨김 글은 새로 찜하지 않는다(찜 해제는 언제나 허용 — 내 찜 목록 정리).
     * 판매완료 글은 공개 글이라 찜할 수 있다.
     */
    if (desired) {
      const pr = postRow as {
        status?: string | null;
        moderation_state?: string | null;
        owner_state?: string | null;
        is_deleted?: boolean | null;
      };
      const st = String(pr.status ?? "").toLowerCase();
      const notPublic =
        st === "hidden" ||
        st === "deleted" ||
        st === "blinded" ||
        String(pr.moderation_state ?? "visible") !== "visible" ||
        String(pr.owner_state ?? "none") !== "none" ||
        pr.is_deleted === true;
      if (notPublic) {
        return NextResponse.json(
          { ok: false, error: "찜할 수 없는 글입니다.", code: "post_not_public" },
          { status: 403 }
        );
      }
    }

    if (!desired) {
      const { data: removed, error } = await sbAny
        .from("favorites")
        .delete()
        .eq("user_id", userId)
        .eq("post_id", postId)
        .select("id");
      if (error) {
        return NextResponse.json(
          { ok: false, error: error.message ?? "삭제에 실패했습니다." },
          { status: 500 }
        );
      }
      if ((removed ?? []).length > 0) await appendFavoriteAuditLog(sbAny, userId, postId, "remove");
      invalidatePostFavoriteServerCachesForViewer(userId);
      const favoriteCount = await countFavoritesForPostId(sbAny, postId);
      return NextResponse.json({ ok: true, isFavorite: false, favoriteCount });
    }

    const { data: inserted, error } = await sbAny
      .from("favorites")
      .upsert(
        { user_id: userId, post_id: postId, created_at: new Date().toISOString() },
        { onConflict: "user_id,post_id", ignoreDuplicates: true }
      )
      .select("id");
    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message ?? "추가에 실패했습니다." },
        { status: 500 }
      );
    }
    if ((inserted ?? []).length > 0) await appendFavoriteAuditLog(sbAny, userId, postId, "add");
    invalidatePostFavoriteServerCachesForViewer(userId);
    const favoriteCount = await countFavoritesForPostId(sbAny, postId);
    return NextResponse.json({ ok: true, isFavorite: true, favoriteCount });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error)?.message ?? "처리에 실패했습니다." },
      { status: 500 }
    );
  }
}

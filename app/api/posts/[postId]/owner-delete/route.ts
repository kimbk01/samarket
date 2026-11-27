import { POSTS_TABLE_READ, POSTS_TABLE_WRITE } from "@/lib/posts/posts-db-tables";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/posts/[postId]/owner-delete — 판매자 본인만, 예약 전 단계 글 삭제(soft)
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { allowSoftDelete, deriveTradeLifecycleStatus } from "@/lib/trade/trade-lifecycle-policy";
import { ownerDeleteLockHintKey } from "@/lib/posts/post-list-owner-menu";
import { publishTradeListingVisibility } from "@/lib/trade/listing-visibility/listing-visibility-server";

/** 언어 재감사 2026-11-27: 서버 문장 대신 오류 코드만 보낸다 — 화면은 `resolveOwnerPostApiErrorText` */
function ownerDeleteFail(code: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, ...extra, error: code, code }, { status });
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const userId = auth.userId;

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return ownerDeleteFail("server_unconfigured", 500);
  }

  const { postId } = await params;
  const id = typeof postId === "string" ? postId.trim() : "";
  if (!id) {
    return ownerDeleteFail("post_id_required", 400);
  }

  const sbAny = sb;
  let { data: post, error: postErr } = await sbAny
    .from(POSTS_TABLE_READ)
    .select("id, user_id, status, seller_listing_state, meta")
    .eq("id", id)
    .maybeSingle();

  if (
    postErr &&
    /seller_listing_state/i.test(String(postErr.message)) &&
    /does not exist|unknown|schema cache|Could not find/i.test(String(postErr.message))
  ) {
    const r2 = await sbAny.from(POSTS_TABLE_READ).select("id, user_id, status, meta").eq("id", id).maybeSingle();
    post = r2.data
      ? ({ ...r2.data, seller_listing_state: null } as typeof post)
      : null;
    postErr = r2.error;
  }

  if (postErr) {
    console.error("[owner-delete] post lookup", postErr.message);
    return ownerDeleteFail("post_lookup_failed", 500);
  }
  if (!post) {
    return ownerDeleteFail("post_not_found", 404);
  }

  const row = post as Record<string, unknown>;
  const ownerId = typeof row.user_id === "string" ? row.user_id : "";
  if (!ownerId || ownerId !== userId) {
    return ownerDeleteFail("not_owner", 403);
  }

  const lifecycle = deriveTradeLifecycleStatus({
    status: row.status as string,
    seller_listing_state: row.seller_listing_state as string | undefined,
    meta: row.meta as Record<string, unknown> | null | undefined,
  });
  if (!allowSoftDelete(lifecycle)) {
    /** 재감사 B-12: 화면은 `lockKey` 로 번역한다(`error` 는 코드만 — 2026-11-27). 숨김 글은 관리자 조치인지 1열 확인 */
    let moderationState: string | null = null;
    if (lifecycle === "hidden") {
      const { data: m } = await sbAny.from(POSTS_TABLE_WRITE).select("moderation_state").eq("id", id).maybeSingle();
      moderationState = typeof (m as { moderation_state?: unknown } | null)?.moderation_state === "string"
        ? String((m as { moderation_state: string }).moderation_state)
        : null;
    }
    const lockKey = ownerDeleteLockHintKey({
      status: row.status as string,
      seller_listing_state: row.seller_listing_state as string | undefined,
      meta: row.meta as Record<string, unknown> | null | undefined,
      moderation_state: moderationState,
    });
    return ownerDeleteFail("delete_not_allowed", 403, { lockKey });
  }

  // 판매자 삭제 = 판매자 노출(owner_state)만 바꾼다 (설계 v2 §F-1-1). status 는 트리거가 hidden 으로 계산.
  // 판매 단계·구매자 값은 그대로 보존한다.
  const now = new Date().toISOString();
  const db = sbAny as import("@supabase/supabase-js").SupabaseClient;
  const { error: updErr } = await db
    .from(POSTS_TABLE_WRITE)
    .update({ owner_state: "owner_deleted", updated_at: now })
    .eq("id", id);

  if (updErr) {
    console.error("[owner-delete] update", updErr.message);
    return ownerDeleteFail("delete_failed", 500);
  }

  /** 설계 §1-3: 판매자 삭제 = 안 보임 방송 */
  await publishTradeListingVisibility(id, false, "owner_deleted");
  return NextResponse.json({ ok: true });
}

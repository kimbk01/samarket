/**
 * GET /api/posts/[postId]/owner-edit — 판매자 본인 trade 글 수정 폼용 스냅샷
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { fetchPostRowForOwnerEdit } from "@/lib/posts/owner-edit-select-post-row";
import {
  allowAnyPostUpdate,
  allowEditCoreFields,
  allowEditTradeLocationSnapshot,
  allowSoftDelete,
  deriveTradeLifecycleStatus,
  tradeLifecycleHintKey,
} from "@/lib/trade/trade-lifecycle-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 언어 재감사 2026-11-27: 서버 문장 대신 오류 코드만 보낸다 — 화면은 `resolveOwnerPostApiErrorText` */
function ownerEditFail(code: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, ...extra, error: code, code }, { status });
}

export async function GET(
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
    return ownerEditFail("server_unconfigured", 500);
  }

  const { postId } = await params;
  const id = typeof postId === "string" ? postId.trim() : "";
  if (!id) {
    return ownerEditFail("post_id_required", 400);
  }

  const { row: postRow, errorCode } = await fetchPostRowForOwnerEdit(sb, id);

  if (errorCode) {
    return ownerEditFail(errorCode, 500);
  }
  if (!postRow) {
    return ownerEditFail("post_not_found", 404);
  }

  const owner = typeof postRow.user_id === "string" ? postRow.user_id : "";
  if (owner !== userId) {
    return ownerEditFail("not_owner", 403);
  }

  const lifecycle = deriveTradeLifecycleStatus({
    status: postRow.status as string,
    seller_listing_state: postRow.seller_listing_state as string | undefined,
    meta: postRow.meta as Record<string, unknown> | null | undefined,
  });
  if (!allowAnyPostUpdate(lifecycle)) {
    return ownerEditFail("trade_lifecycle_locked", 403, { locked: true, lifecycleStatus: lifecycle });
  }

  const tid =
    typeof postRow.trade_category_id === "string" ? postRow.trade_category_id.trim() : "";
  if (!tid) {
    return ownerEditFail("category_missing", 422);
  }

  /** 재감사 2026-11-27: 안내 문장 대신 단계 코드 — 화면은 `tradeLifecycleHintKey(lifecycleStatus)` 로 그린다 */
  const hint = tradeLifecycleHintKey(lifecycle) ? `trade_lifecycle_${lifecycle}` : null;
  return NextResponse.json({
    ok: true,
    post: {
      id: postRow.id,
      trade_category_id: tid,
      title: (postRow.title as string) ?? "",
      content: (postRow.content as string) ?? "",
      price: postRow.price != null ? Number(postRow.price) : null,
      region: (postRow.region as string) ?? "",
      city: (postRow.city as string) ?? "",
      trade_lgu_id: (postRow.trade_lgu_id as string) ?? "",
      barangay: (postRow.barangay as string) ?? "",
      images: Array.isArray(postRow.images) ? (postRow.images as string[]) : [],
      meta: postRow.meta && typeof postRow.meta === "object" ? (postRow.meta as Record<string, unknown>) : null,
      is_free_share: postRow.is_free_share === true,
      is_price_offer: postRow.is_price_offer === true,
      work_days: Array.isArray(postRow.work_days) ? (postRow.work_days as string[]) : null,
      headcount: postRow.headcount != null ? Number(postRow.headcount) : null,
      experience_required:
        typeof postRow.experience_required === "string" ? postRow.experience_required : null,
      work_start_date:
        postRow.work_start_date != null ? String(postRow.work_start_date).slice(0, 10) : null,
      work_end_date: postRow.work_end_date != null ? String(postRow.work_end_date).slice(0, 10) : null,
    },
    tradePolicy: {
      lifecycleStatus: lifecycle,
      hint,
      allowEditCore: allowEditCoreFields(lifecycle),
      allowEditTradeLocation: allowEditTradeLocationSnapshot(lifecycle),
      allowAppendOnlyDescription: lifecycle === "negotiating" || lifecycle === "in_progress" || lifecycle === "cancelled",
      canSoftDelete: allowSoftDelete(lifecycle),
    },
  });
}

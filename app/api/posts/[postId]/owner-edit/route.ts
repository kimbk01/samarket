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
  tradeLifecycleHint,
} from "@/lib/trade/trade-lifecycle-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    return NextResponse.json({ ok: false, error: "서버 설정이 필요합니다." }, { status: 500 });
  }

  const { postId } = await params;
  const id = typeof postId === "string" ? postId.trim() : "";
  if (!id) {
    return NextResponse.json({ ok: false, error: "postId 필요" }, { status: 400 });
  }

  const { row: postRow, errorMessage } = await fetchPostRowForOwnerEdit(sb, id);

  if (errorMessage) {
    return NextResponse.json({ ok: false, error: errorMessage }, { status: 500 });
  }
  if (!postRow) {
    return NextResponse.json({ ok: false, error: "글을 찾을 수 없습니다." }, { status: 404 });
  }

  const owner = typeof postRow.user_id === "string" ? postRow.user_id : "";
  if (owner !== userId) {
    return NextResponse.json({ ok: false, error: "본인 글만 수정할 수 있습니다." }, { status: 403 });
  }

  const lifecycle = deriveTradeLifecycleStatus({
    status: postRow.status as string,
    seller_listing_state: postRow.seller_listing_state as string | undefined,
    meta: postRow.meta as Record<string, unknown> | null | undefined,
  });
  if (!allowAnyPostUpdate(lifecycle)) {
    const hint = tradeLifecycleHint(lifecycle) ?? "이 글은 지금 수정할 수 없습니다.";
    return NextResponse.json({ ok: false, error: hint, locked: true }, { status: 403 });
  }

  const tid =
    typeof postRow.trade_category_id === "string" ? postRow.trade_category_id.trim() : "";
  if (!tid) {
    return NextResponse.json({ ok: false, error: "카테고리 정보가 없습니다." }, { status: 422 });
  }

  const hint = tradeLifecycleHint(lifecycle);
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

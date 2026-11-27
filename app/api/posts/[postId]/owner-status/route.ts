import { POSTS_TABLE_WRITE } from "@/lib/posts/posts-db-tables";
import { publishTradeListingVisibility } from "@/lib/trade/listing-visibility/listing-visibility-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/posts/[postId]/owner-status
 * Body: { status: active | hidden } — 판매자 세션
 *
 * - { status: active|hidden } — 판매자 숨김·다시 보이기(owner_state).
 * - { listing: sold } — 판매중 → 판매완료(구매자 지정 없음, Marketplace 방식).
 * 거래 B (Owner 2026-10-28): 판매완료만 — 되돌리기(`listing: selling`)·예약(reserved) 없음.
 */
import { after, NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import type { SellerListingState } from "@/lib/products/seller-listing-state";
import { applySellerListingChangeSideEffectsServer } from "@/lib/trade/insert-seller-listing-change-system-messages";
import { notifyTradeSoldToEligibleCounterparts } from "@/lib/trade/notify-trade-sold-and-rating.server";

/** Member-facing coarse status via this route — reserved/sold rejected (buyer binding). */
const ALLOWED = new Set(["active", "hidden"]);

/** 언어 재감사 2026-11-27: 서버 문장 대신 오류 코드만 보낸다 — 화면은 `resolveOwnerPostApiErrorText` */
function ownerStatusFail(code: string, status: number) {
  return NextResponse.json({ ok: false, error: code, code }, { status });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const userId = auth.userId;

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return ownerStatusFail("server_unconfigured", 500);
  }

  const { postId } = await params;
  let body: { status?: string; listing?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const nextStatus = typeof body.status === "string" ? body.status.trim().toLowerCase() : "";
  if (!postId?.trim()) {
    return ownerStatusFail("post_id_required", 400);
  }

  /**
   * 거래 B (Owner 2026-10-28 · Marketplace 방식): 판매자는 판매중 → 판매완료만 한다.
   * 구매자 지정 없이 판매자가 바로 바꾼다(앱 밖 거래 포함). 판매완료 → 판매중 되돌리기·예약·구매 확정 없음.
   */
  const listing = typeof body.listing === "string" ? body.listing.trim().toLowerCase() : "";
  if (listing === "selling") {
    return ownerStatusFail("sold_is_final", 400);
  }
  if (listing === "sold") {
    return applySellerMarkSold(sb, userId, postId.trim());
  }
  if (nextStatus === "reserved") {
    return ownerStatusFail("reserved_not_supported", 400);
  }
  if (nextStatus === "sold") {
    return ownerStatusFail("sold_requires_seller_complete", 400);
  }
  if (!ALLOWED.has(nextStatus)) {
    return ownerStatusFail("invalid_status", 400);
  }

  const { data: post, error: postErr } = await sb
    .from(POSTS_TABLE_WRITE)
    .select("id, user_id, status, seller_listing_state, moderation_state, owner_state")
    .eq("id", postId.trim())
    .maybeSingle();

  if (postErr) {
    console.error("[owner-status] post lookup", postErr.message);
    return ownerStatusFail("post_lookup_failed", 500);
  }
  if (!post) {
    return ownerStatusFail("post_not_found", 404);
  }
  const row = post as {
    user_id?: string;
    seller_listing_state?: string | null;
    moderation_state?: string | null;
    owner_state?: string | null;
  };
  if (!row.user_id || row.user_id !== userId) {
    return ownerStatusFail("not_owner", 403);
  }

  /**
   * 판매자 숨김·다시 보이기 = 판매자 노출(owner_state)만 바꾼다 (설계 v2 §F-1-1).
   * - 판매 단계·예약 구매자는 그대로 둔다 (숨겼다 다시 보여도 예약·거래완료 유지).
   * - 관리자 숨김·삭제는 판매자가 해제할 수 없다.
   */
  const moderation = String(row.moderation_state ?? "visible");
  if (nextStatus === "active" && (moderation === "admin_hidden" || moderation === "admin_deleted")) {
    return ownerStatusFail("admin_hidden", 403);
  }

  /** 거래 계획 1단계 M-1: 판매자가 삭제한 글은 「다시 보이기」로 공개할 수 없다 */
  if (nextStatus === "active" && String(row.owner_state ?? "") === "owner_deleted") {
    return ownerStatusFail("owner_deleted", 403);
  }

  const now = new Date().toISOString();
  const postUpdate: Record<string, unknown> = { updated_at: now };
  if (nextStatus === "hidden") {
    postUpdate.owner_state = "owner_hidden";
  } else {
    postUpdate.owner_state = "none";
  }

  const { data: updated, error: updErr } = await sb
    .from(POSTS_TABLE_WRITE)
    .update(postUpdate)
    .eq("id", postId.trim())
    .select("status, seller_listing_state")
    .maybeSingle();

  if (updErr) {
    console.error("[owner-status] update", updErr.message);
    return ownerStatusFail("save_failed", 500);
  }

  const u = (updated ?? {}) as { status?: string; seller_listing_state?: string };
  /** 설계 §1-3: 판매자 숨김 = 안 보임 · 다시 보이기 = 다시 보임 */
  await publishTradeListingVisibility(postId.trim(), nextStatus !== "hidden", nextStatus === "hidden" ? "owner_hidden" : "restored");
  return NextResponse.json({
    ok: true,
    status: u.status ?? nextStatus,
    sellerListingState: u.seller_listing_state ?? row.seller_listing_state ?? null,
  });
}

/**
 * 판매중 → 판매완료 — 판매 단계와 공개 상태를 함께 쓴다(트리거 `posts_visibility_gate` 가 숨김이면 hidden 유지).
 * 판매완료는 특정 구매자에 묶지 않는다(sold_buyer_id·reserved_buyer_id 비움). 기존 채팅방은 그대로 둔다.
 * 후속 처리(시스템 메시지·상태 broadcast·메신저 방 요약)는 예약·판매완료와 같은 단일 경로.
 */
async function applySellerMarkSold(
  sb: ReturnType<typeof getSupabaseServer>,
  userId: string,
  postId: string
) {
  const { data: post, error: postErr } = await sb
    .from(POSTS_TABLE_WRITE)
    .select("id, user_id, title, status, seller_listing_state, moderation_state, owner_state")
    .eq("id", postId)
    .maybeSingle();
  if (postErr) {
    console.error("[owner-status] sold lookup", postErr.message);
    return ownerStatusFail("post_lookup_failed", 500);
  }
  if (!post) return ownerStatusFail("post_not_found", 404);
  const row = post as {
    user_id?: string;
    title?: string | null;
    status?: string | null;
    seller_listing_state?: string | null;
    moderation_state?: string | null;
    owner_state?: string | null;
  };
  if (!row.user_id || row.user_id !== userId) {
    return ownerStatusFail("not_owner", 403);
  }
  const moderation = String(row.moderation_state ?? "visible");
  if (moderation === "admin_hidden" || moderation === "admin_deleted") {
    return ownerStatusFail("admin_hidden", 403);
  }

  if (String(row.owner_state ?? "") === "owner_deleted") {
    return ownerStatusFail("owner_deleted", 403);
  }
  /** 이미 판매완료 — 같은 요청 반복은 그대로 성공(시스템 메시지·방송 재발행 없음) */
  if (String(row.status ?? "") === "sold" || String(row.seller_listing_state ?? "") === "completed") {
    return NextResponse.json({ ok: true, status: "sold", sellerListingState: "completed", threadNotices: [] });
  }

  const nextState: SellerListingState = "completed";
  const postStatus = "sold";
  const { data: updated, error: updErr } = await sb
    .from(POSTS_TABLE_WRITE)
    .update({
      status: postStatus,
      seller_listing_state: nextState,
      sold_buyer_id: null,
      reserved_buyer_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", postId)
    .select("status, seller_listing_state")
    .maybeSingle();
  if (updErr) {
    console.error("[owner-status] sold update", updErr.message);
    return ownerStatusFail("save_failed", 500);
  }

  const u = (updated ?? {}) as { status?: string; seller_listing_state?: string };
  const threadNotices = await applySellerListingChangeSideEffectsServer(sb, {
    postId,
    sellerUserId: userId,
    nextState,
    postStatus: u.status ?? postStatus,
    postTitle: typeof row.title === "string" ? row.title : null,
  });
  /** 감사 P3 ①: 평가 자격이 되는 대화 상대에게 판매완료 알림 — 응답 뒤에 보낸다(판매완료 응답을 늦추지 않음) */
  after(() =>
    notifyTradeSoldToEligibleCounterparts(sb, {
      postId,
      sellerUserId: userId,
      postTitle: typeof row.title === "string" ? row.title : null,
    }).catch(() => 0)
  );
  return NextResponse.json({
    ok: true,
    status: u.status ?? postStatus,
    sellerListingState: u.seller_listing_state ?? nextState,
    threadNotices,
  });
}

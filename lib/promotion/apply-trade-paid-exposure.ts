/**
 * Trade「더 알리기」— pending HOLD path for requiresAdminApproval=true only.
 * 승인·반려·중지·재개·종료는 `lib/admin/trade-admin/trade-promotion-admin.ts` (DB 함수, 한 트랜잭션).
 * OWNER POLICY: active catalog uses purchase_member_content_promotion (immediate).
 * LIST projection reads order_status=active only.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getMemberPromotionProduct } from "@/lib/points/promotion-products";
import { assertPromotionTargetOwned } from "@/lib/points/point-promotion-orders-db";
import { isPostEligibleForPromotionBoost } from "@/lib/promotion/trade-promotion-overlay";

export function computeTradePromotionActiveWindow(
  nowMs: number,
  durationDays: number
): { startAt: string; endAt: string } {
  const days = Math.max(1, Math.floor(Number(durationDays) || 7));
  const start = nowMs;
  return {
    startAt: new Date(start).toISOString(),
    endAt: new Date(start + days * 86_400_000).toISOString(),
  };
}

export type ApplyTradePromotionResult =
  | {
      ok: true;
      orderId: string;
      status: "pending_review" | "active";
      endAt: string;
      pointCost: number;
      productId: string;
      holdId?: string;
    }
  | { ok: false; error: string };

export async function applyTradePaidExposurePending(
  sb: SupabaseClient,
  input: {
    userId: string;
    postId: string;
    productId: string;
    targetTitle?: string;
    userNickname?: string;
    idempotencyKey: string;
  }
): Promise<ApplyTradePromotionResult> {
  const product = getMemberPromotionProduct(input.productId);
  if (!product || product.domain !== "trade" || !product.requiresAdminApproval) {
    return { ok: false, error: "invalid_product" };
  }

  const key = input.idempotencyKey.trim();
  if (!key) return { ok: false, error: "invalid_input" };

  const { data: existingKey } = await sb
    .from("point_promotion_orders")
    .select("id, order_status, end_at, point_cost, product_id")
    .eq("user_id", input.userId)
    .eq("idempotency_key", key)
    .maybeSingle();
  if (existingKey?.id) {
    const st = String(existingKey.order_status ?? "pending_review");
    return {
      ok: true,
      orderId: String(existingKey.id),
      status: st === "active" ? "active" : "pending_review",
      endAt: String(existingKey.end_at ?? ""),
      pointCost: Number(existingKey.point_cost ?? product.pointCost),
      productId: String(existingKey.product_id ?? product.id),
    };
  }

  const owned = await assertPromotionTargetOwned(sb, input.userId, "product", input.postId);
  if (!owned.ok) return owned;

  const { data: postRow } = await sb
    .from("posts")
    .select("id, status, seller_listing_state")
    .eq("id", input.postId.trim())
    .maybeSingle();
  if (!postRow?.id) return { ok: false, error: "target_not_found" };
  if (
    !isPostEligibleForPromotionBoost(
      (postRow as { status?: string }).status,
      (postRow as { seller_listing_state?: unknown }).seller_listing_state
    )
  ) {
    return { ok: false, error: "target_unavailable" };
  }

  // 주문 생성 + 포인트 보류(잔액 검사) + 감사 = DB 함수 1번 (거래 Admin 설계 v2 §G-0).
  // 중복 진행 주문·멱등 키·잔액 부족은 함수가 행 잠금 안에서 판단한다.
  const { data, error } = await sb.rpc("request_trade_promotion_review", {
    p_user_id: input.userId,
    p_post_id: input.postId.trim(),
    p_product_id: product.id,
    p_placement: product.placementPolicy,
    p_duration_days: product.durationDays,
    p_point_cost: product.pointCost,
    p_target_title: (input.targetTitle?.trim() || owned.targetTitle).slice(0, 500),
    p_user_nickname: (input.userNickname ?? "").slice(0, 120),
    p_idempotency_key: key,
    p_hold_label: `거래 더 알리기 신청 (${product.durationDays}일)`,
  });
  if (error) return { ok: false, error: error.message || "rpc_failed" };
  const r = (data ?? {}) as Record<string, unknown>;
  if (r.ok !== true) return { ok: false, error: String(r.error ?? "apply_failed") };
  const st = String(r.order_status ?? "pending_review");
  return {
    ok: true,
    orderId: String(r.order_id),
    status: st === "active" ? "active" : "pending_review",
    endAt: String(r.end_at ?? ""),
    pointCost: Number(r.point_cost ?? product.pointCost),
    productId: String(r.product_id ?? product.id),
    holdId: r.hold_id ? String(r.hold_id) : undefined,
  };
}

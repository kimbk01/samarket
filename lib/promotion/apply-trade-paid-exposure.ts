/**
 * Trade「더 알리기」pending HOLD → admin approve/reject.
 * Mirrors community apply-community-paid-exposure pending path.
 * LIST projection reads order_status=active only — pending never appears on /market.
 * DO NOT use purchase_member_content_promotion (immediate active) when approval is required.
 */
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getMemberPromotionProduct } from "@/lib/points/promotion-products";
import { assertPromotionTargetOwned } from "@/lib/points/point-promotion-orders-db";
import { isPostEligibleForPromotionBoost } from "@/lib/promotion/trade-promotion-overlay";
import {
  captureHeldPointsForPromotionOrder,
  holdPointsForPromotionOrder,
  releaseHeldPointsForPromotionOrder,
} from "@/lib/promotion/promotion-point-hold-flow";

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

  const { data: conflict } = await sb
    .from("point_promotion_orders")
    .select("id")
    .eq("target_id", input.postId.trim())
    .eq("domain", "trade")
    .in("order_status", ["pending_review", "active"])
    .limit(1);
  if ((conflict ?? []).length > 0) {
    return { ok: false, error: "already_active_promotion" };
  }

  const orderId = randomUUID();
  const now = new Date();
  const end = new Date(now.getTime() + product.durationDays * 86_400_000);
  const title = input.targetTitle?.trim() || owned.targetTitle;

  const { error: insErr } = await sb.from("point_promotion_orders").insert({
    id: orderId,
    user_id: input.userId,
    user_nickname: (input.userNickname ?? "").slice(0, 120),
    target_type: "product",
    target_id: input.postId.trim(),
    target_title: title.slice(0, 500),
    placement: product.placementPolicy,
    duration_days: product.durationDays,
    point_cost: product.pointCost,
    order_status: "pending_review",
    start_at: now.toISOString(),
    end_at: end.toISOString(),
    product_id: product.id,
    domain: "trade",
    idempotency_key: key,
  });
  if (insErr) {
    return { ok: false, error: insErr.message || "insert_failed" };
  }

  const hold = await holdPointsForPromotionOrder(sb, {
    userId: input.userId,
    orderId,
    pointCost: product.pointCost,
    label: `거래 더 알리기 신청 (${product.durationDays}일)`,
  });
  if (!hold.ok) {
    await sb.from("point_promotion_orders").delete().eq("id", orderId);
    return { ok: false, error: hold.error };
  }

  return {
    ok: true,
    orderId,
    status: "pending_review",
    endAt: end.toISOString(),
    pointCost: product.pointCost,
    productId: product.id,
    holdId: hold.holdId,
  };
}

export async function approveTradePaidExposure(
  sb: SupabaseClient,
  input: { orderId: string; adminUserId: string }
): Promise<{ ok: true; endAt: string } | { ok: false; error: string }> {
  void input.adminUserId;
  const { data: row, error } = await sb
    .from("point_promotion_orders")
    .select("*")
    .eq("id", input.orderId)
    .maybeSingle();
  if (error || !row) return { ok: false, error: "not_found" };
  const r = row as Record<string, unknown>;
  if (String(r.domain) !== "trade") {
    return { ok: false, error: "not_trade" };
  }

  const userId = String(r.user_id);
  const pointCost = Number(r.point_cost ?? 0);
  const durationDays = Math.max(1, Number(r.duration_days ?? 7));
  const now = Date.now();
  const window = computeTradePromotionActiveWindow(now, durationDays);
  const currentStatus = String(r.order_status);

  if (currentStatus === "active") {
    const capturedAgain = await captureHeldPointsForPromotionOrder(sb, {
      orderId: input.orderId,
      userId,
      pointCost,
    });
    if (!capturedAgain.ok && capturedAgain.error !== "hold_missing") {
      return { ok: false, error: capturedAgain.error };
    }
    return { ok: true, endAt: String(r.end_at ?? window.endAt) };
  }
  if (currentStatus !== "pending_review") {
    return { ok: false, error: "not_pending" };
  }

  const { data: updated, error: upd } = await sb
    .from("point_promotion_orders")
    .update({
      order_status: "active",
      start_at: window.startAt,
      end_at: window.endAt,
      review_reason: null,
    })
    .eq("id", input.orderId)
    .eq("order_status", "pending_review")
    .eq("domain", "trade")
    .select("id")
    .maybeSingle();
  if (upd) return { ok: false, error: upd.message };
  if (!updated?.id) {
    const { data: again } = await sb
      .from("point_promotion_orders")
      .select("order_status, end_at")
      .eq("id", input.orderId)
      .maybeSingle();
    const st = String(again?.order_status ?? "");
    if (st === "active") {
      const capturedAgain = await captureHeldPointsForPromotionOrder(sb, {
        orderId: input.orderId,
        userId,
        pointCost,
      });
      if (!capturedAgain.ok && capturedAgain.error !== "hold_missing") {
        return { ok: false, error: capturedAgain.error };
      }
      return { ok: true, endAt: String(again?.end_at ?? window.endAt) };
    }
    return { ok: false, error: "not_pending" };
  }

  const captured = await captureHeldPointsForPromotionOrder(sb, {
    orderId: input.orderId,
    userId,
    pointCost,
  });
  if (!captured.ok) {
    return { ok: false, error: captured.error };
  }

  return { ok: true, endAt: window.endAt };
}

export async function rejectTradePaidExposure(
  sb: SupabaseClient,
  input: { orderId: string; reason: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const reason = input.reason.trim();
  if (!reason) return { ok: false, error: "reason_required" };

  const { data: row, error } = await sb
    .from("point_promotion_orders")
    .select("id, order_status, domain")
    .eq("id", input.orderId)
    .maybeSingle();
  if (error || !row) return { ok: false, error: "not_found" };
  if (String((row as { order_status?: string }).order_status) !== "pending_review") {
    return { ok: false, error: "not_pending" };
  }
  if (String((row as { domain?: string }).domain) !== "trade") {
    return { ok: false, error: "not_trade" };
  }

  const { data: updated, error: upd } = await sb
    .from("point_promotion_orders")
    .update({
      order_status: "rejected",
      review_reason: reason.slice(0, 500),
    })
    .eq("id", input.orderId)
    .eq("order_status", "pending_review")
    .eq("domain", "trade")
    .select("id")
    .maybeSingle();
  if (upd) return { ok: false, error: upd.message };
  if (!updated?.id) return { ok: false, error: "not_pending" };

  const released = await releaseHeldPointsForPromotionOrder(sb, { orderId: input.orderId });
  if (!released.ok) return { ok: false, error: released.error };

  return { ok: true };
}

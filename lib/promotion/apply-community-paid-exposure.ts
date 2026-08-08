/**
 * Community Paid Exposure apply (pending + HOLD).
 * CONTRACT: docs/dibay-paid-exposure-feed-ad-master-contract.md
 * Entitlement: point_promotion_orders. Money: promotion_point_holds.
 * DO NOT insert post_ads.
 */

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveCanonicalCommunityPostIdForAds } from "@/lib/ads/post-ads-supabase";
import {
  getMemberPromotionProduct,
  type MemberPromotionProduct,
} from "@/lib/points/promotion-products";
import {
  captureHeldPointsForPromotionOrder,
  holdPointsForPromotionOrder,
  releaseHeldPointsForPromotionOrder,
} from "@/lib/promotion/promotion-point-hold-flow";

export type ApplyCommunityPromotionResult =
  | {
      ok: true;
      orderId: string;
      status: "pending_review";
      endAt: string;
      pointCost: number;
      productId: string;
      holdId?: string;
    }
  | { ok: false; error: string };

export async function applyCommunityPaidExposurePending(
  sb: SupabaseClient,
  input: {
    userId: string;
    postId: string;
    productId: string;
    targetTitle?: string;
    userNickname?: string;
    idempotencyKey: string;
  }
): Promise<ApplyCommunityPromotionResult> {
  const product = getMemberPromotionProduct(input.productId);
  if (!product || product.domain !== "community" || !product.requiresAdminApproval) {
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
    return {
      ok: true,
      orderId: String(existingKey.id),
      status: "pending_review",
      endAt: String(existingKey.end_at ?? ""),
      pointCost: Number(existingKey.point_cost ?? product.pointCost),
      productId: String(existingKey.product_id ?? product.id),
    };
  }

  const canonicalId = await resolveCanonicalCommunityPostIdForAds(
    sb,
    input.postId,
    input.userId
  );
  if (!canonicalId) return { ok: false, error: "target_not_found" };

  const { data: post } = await sb
    .from("community_posts")
    .select("id, title, user_id, status")
    .eq("id", canonicalId)
    .maybeSingle();
  if (!post?.id) return { ok: false, error: "target_not_found" };
  if (String(post.user_id) !== input.userId) return { ok: false, error: "forbidden" };

  const { data: conflict } = await sb
    .from("point_promotion_orders")
    .select("id")
    .eq("target_id", canonicalId)
    .eq("domain", "community")
    .in("order_status", ["pending_review", "active"])
    .limit(1);
  if ((conflict ?? []).length > 0) {
    return { ok: false, error: "already_active_promotion" };
  }

  const orderId = randomUUID();
  const now = new Date();
  const end = new Date(now.getTime() + product.durationDays * 86_400_000);
  const title =
    input.targetTitle?.trim() || String((post as { title?: string }).title ?? "");

  const { error: insErr } = await sb.from("point_promotion_orders").insert({
    id: orderId,
    user_id: input.userId,
    user_nickname: (input.userNickname ?? "").slice(0, 120),
    target_type: "community_post",
    target_id: canonicalId,
    target_title: title.slice(0, 500),
    placement: product.placementPolicy,
    duration_days: product.durationDays,
    point_cost: product.pointCost,
    order_status: "pending_review",
    start_at: now.toISOString(),
    end_at: end.toISOString(),
    product_id: product.id,
    domain: "community",
    idempotency_key: key,
  });
  if (insErr) {
    return { ok: false, error: insErr.message || "insert_failed" };
  }

  const hold = await holdPointsForPromotionOrder(sb, {
    userId: input.userId,
    orderId,
    pointCost: product.pointCost,
    label: `커뮤니티 게시물 홍보 신청 (${product.durationDays}일)`,
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

export async function approveCommunityPaidExposure(
  sb: SupabaseClient,
  input: { orderId: string; adminUserId: string }
): Promise<{ ok: true; endAt: string } | { ok: false; error: string }> {
  const { data: row, error } = await sb
    .from("point_promotion_orders")
    .select("*")
    .eq("id", input.orderId)
    .maybeSingle();
  if (error || !row) return { ok: false, error: "not_found" };
  const r = row as Record<string, unknown>;
  if (String(r.order_status) !== "pending_review") {
    return { ok: false, error: "not_pending" };
  }
  if (String(r.domain) !== "community") {
    return { ok: false, error: "not_community" };
  }

  const userId = String(r.user_id);
  const pointCost = Number(r.point_cost ?? 0);
  const durationDays = Math.max(1, Number(r.duration_days ?? 7));
  const now = new Date();
  const end = new Date(now.getTime() + durationDays * 86_400_000);

  const { data: updated, error: upd } = await sb
    .from("point_promotion_orders")
    .update({
      order_status: "active",
      start_at: now.toISOString(),
      end_at: end.toISOString(),
      review_reason: null,
    })
    .eq("id", input.orderId)
    .eq("order_status", "pending_review")
    .select("id")
    .maybeSingle();
  if (upd) return { ok: false, error: upd.message };
  if (!updated?.id) {
    const { data: again } = await sb
      .from("point_promotion_orders")
      .select("order_status, end_at")
      .eq("id", input.orderId)
      .maybeSingle();
    if (String(again?.order_status) === "active") {
      return { ok: true, endAt: String(again?.end_at ?? end.toISOString()) };
    }
    return { ok: false, error: "not_pending" };
  }

  const captured = await captureHeldPointsForPromotionOrder(sb, {
    orderId: input.orderId,
    userId,
    pointCost,
  });
  if (!captured.ok) {
    // Keep entitlement active; hold may still be 'held' — retry capture without reverting exposure.
    return { ok: false, error: captured.error };
  }

  return { ok: true, endAt: end.toISOString() };
}

export async function rejectCommunityPaidExposure(
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

  const released = await releaseHeldPointsForPromotionOrder(sb, { orderId: input.orderId });
  if (!released.ok) return { ok: false, error: released.error };

  const { data: updated, error: upd } = await sb
    .from("point_promotion_orders")
    .update({
      order_status: "rejected",
      review_reason: reason.slice(0, 500),
    })
    .eq("id", input.orderId)
    .eq("order_status", "pending_review")
    .select("id")
    .maybeSingle();
  if (upd) return { ok: false, error: upd.message };
  if (!updated?.id) return { ok: false, error: "reject_race" };

  return { ok: true };
}

export function communityProductCatalog(): MemberPromotionProduct[] {
  return [
    getMemberPromotionProduct("community_promote_3"),
    getMemberPromotionProduct("community_promote_7"),
  ].filter((p): p is MemberPromotionProduct => Boolean(p));
}

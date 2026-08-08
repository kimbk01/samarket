/**
 * Paid exposure HOLD / CAPTURE / RELEASE for point_promotion_orders (Community approval path).
 * Mirrors feed_ad / trade_ad hold pattern. Ledger related_type = promotion_order.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  appendUserPointLedgerAudit,
  creditUserPoints,
  spendUserPoints,
} from "@/lib/points/user-point-ledger";

export type PointFlowResult = { ok: true; holdId?: string } | { ok: false; error: string };

function mapErr(error: string, code?: string): string {
  if (code === "insufficient_balance" || error === "insufficient_balance") {
    return "insufficient_balance";
  }
  return error || "point_mutation_failed";
}

export async function holdPointsForPromotionOrder(
  sb: SupabaseClient,
  params: { userId: string; orderId: string; pointCost: number; label?: string }
): Promise<PointFlowResult> {
  const cost = Math.max(0, Math.floor(Number(params.pointCost) || 0));
  if (cost === 0) return { ok: true };

  const spent = await spendUserPoints(sb, {
    userId: params.userId,
    amount: cost,
    entryType: "ad_hold",
    relatedType: "promotion_order",
    relatedId: `hold:${params.orderId}`,
    description: params.label ?? "게시물 홍보 신청 — 포인트 보류",
    actorType: "system",
  });
  if (!spent.ok) return { ok: false, error: mapErr(spent.error, spent.code) };

  const { data: row, error } = await sb
    .from("promotion_point_holds")
    .insert({
      user_id: params.userId,
      promotion_order_id: params.orderId,
      amount: cost,
      status: "held",
    })
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  return { ok: true, holdId: row?.id ? String(row.id) : undefined };
}

export async function releaseHeldPointsForPromotionOrder(
  sb: SupabaseClient,
  params: { orderId: string }
): Promise<PointFlowResult> {
  const { data: holds, error } = await sb
    .from("promotion_point_holds")
    .select("id, user_id, amount")
    .eq("promotion_order_id", params.orderId)
    .eq("status", "held");
  if (error) return { ok: false, error: error.message };
  const rows = Array.isArray(holds) ? holds : [];
  if (rows.length === 0) return { ok: true };

  for (const h of rows as { id: string; user_id: string; amount: number }[]) {
    const uid = String(h.user_id ?? "");
    const amt = Math.max(0, Math.floor(Number(h.amount) || 0));
    if (!uid || amt <= 0) continue;
    const credited = await creditUserPoints(sb, {
      userId: uid,
      amount: amt,
      entryType: "ad_hold_release",
      relatedType: "promotion_order",
      relatedId: `release:${h.id}`,
      description: "게시물 홍보 거절/취소 — 보류 해제",
      actorType: "system",
    });
    if (!credited.ok) return { ok: false, error: mapErr(credited.error, credited.code) };
    const { error: upd } = await sb
      .from("promotion_point_holds")
      .update({ status: "released", updated_at: new Date().toISOString() })
      .eq("id", h.id);
    if (upd) return { ok: false, error: upd.message };
  }
  return { ok: true };
}

export async function captureHeldPointsForPromotionOrder(
  sb: SupabaseClient,
  params: { orderId: string; userId: string; pointCost: number }
): Promise<PointFlowResult> {
  const { data: holds, error } = await sb
    .from("promotion_point_holds")
    .select("id")
    .eq("promotion_order_id", params.orderId)
    .eq("status", "held");
  if (error) return { ok: false, error: error.message };
  if (!holds?.length) return { ok: false, error: "hold_missing" };

  for (const h of holds as { id: string }[]) {
    const { error: upd } = await sb
      .from("promotion_point_holds")
      .update({ status: "captured", updated_at: new Date().toISOString() })
      .eq("id", h.id);
    if (upd) return { ok: false, error: upd.message };
  }

  const cost = Math.max(0, Math.floor(Number(params.pointCost) || 0));
  await appendUserPointLedgerAudit(sb, {
    userId: params.userId,
    amount: 0,
    entryType: "ad_purchase",
    relatedType: "promotion_order",
    relatedId: `capture:${params.orderId}`,
    description: `게시물 홍보 승인 — ${cost}P 확정`,
    actorType: "admin",
  }).catch(() => undefined);

  return { ok: true };
}

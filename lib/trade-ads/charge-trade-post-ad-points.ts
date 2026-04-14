import type { SupabaseClient } from "@supabase/supabase-js";
import { finalizeHeldPointsOnTradePostAdActivation } from "@/lib/trade-ads/trade-post-ad-point-flow";

export type ChargeTradeAdPointsResult = { ok: true } | { ok: false; error: string };

/**
 * 거래 상세 광고를 `active`로 전환할 때 포인트 처리.
 * - 신청 시 보류(hold)가 있으면: 추가 차감 없이 확정 원장만 남김.
 * - 보류 없음(레거시): 즉시 차감 + 원장 + hold 행 charged(감사).
 */
export async function chargePointsOnTradePostAdActivation(
  sb: SupabaseClient,
  params: {
    tradePostAdId: string;
    advertiserUserId: string;
    pointCost: number;
    description?: string;
  }
): Promise<ChargeTradeAdPointsResult> {
  const cost = Math.max(0, Math.floor(Number(params.pointCost) || 0));

  const { data: heldRows } = await sb
    .from("trade_ad_point_holds")
    .select("id, status")
    .eq("trade_post_ad_id", params.tradePostAdId)
    .eq("status", "held");

  if (Array.isArray(heldRows) && heldRows.length > 0) {
    return finalizeHeldPointsOnTradePostAdActivation(sb, {
      tradePostAdId: params.tradePostAdId,
      userId: params.advertiserUserId,
    });
  }

  const { data: charged } = await sb
    .from("trade_ad_point_holds")
    .select("id")
    .eq("trade_post_ad_id", params.tradePostAdId)
    .eq("status", "charged")
    .limit(1);
  if (Array.isArray(charged) && charged.length > 0) {
    return { ok: true };
  }

  if (cost === 0) return { ok: true };

  const { data: profile, error: pe } = await sb
    .from("profiles")
    .select("points")
    .eq("id", params.advertiserUserId)
    .maybeSingle();

  if (pe) return { ok: false, error: pe.message };
  const current = Math.max(0, Number((profile as { points?: number } | null)?.points ?? 0));
  if (current < cost) {
    return { ok: false, error: "포인트가 부족합니다." };
  }

  const balanceAfter = current - cost;

  const { error: ue } = await sb.from("profiles").update({ points: balanceAfter }).eq("id", params.advertiserUserId);

  if (ue) return { ok: false, error: ue.message };

  const relatedId = params.tradePostAdId;
  const { error: le } = await sb.from("point_ledger").insert({
    user_id: params.advertiserUserId,
    entry_type: "ad_charge",
    amount: -cost,
    balance_after: balanceAfter,
    related_type: "trade_post_ad",
    related_id: relatedId,
    description: params.description ?? "거래 상세 광고(보류 없음, 즉시 차감)",
    actor_type: "system",
  });

  if (le) return { ok: false, error: le.message };

  const { error: he } = await sb.from("trade_ad_point_holds").insert({
    user_id: params.advertiserUserId,
    trade_post_ad_id: params.tradePostAdId,
    amount: cost,
    status: "charged",
  });

  if (he) {
    console.warn("[trade-ads] trade_ad_point_holds insert:", he.message);
  }

  return { ok: true };
}

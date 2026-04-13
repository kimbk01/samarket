import type { SupabaseClient } from "@supabase/supabase-js";

export type ChargeTradeAdPointsResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * 거래 상세 광고를 `active`로 전환할 때 포인트 차감 + 원장 기록(+ hold 감사 행).
 * `point_cost`가 0이면 스킵.
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
    entry_type: "spend",
    amount: -cost,
    balance_after: balanceAfter,
    related_type: "ad_application",
    related_id: relatedId,
    description: params.description ?? "거래 상세 광고",
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

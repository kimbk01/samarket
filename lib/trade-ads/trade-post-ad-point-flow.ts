import type { SupabaseClient } from "@supabase/supabase-js";

export type PointFlowResult = { ok: true } | { ok: false; error: string };

/**
 * 광고 신청 시: 포인트 즉시 보류(잔액에서 차감) + 원장 `ad_hold` + hold 행 `held`.
 */
export async function holdPointsForTradePostAdApply(
  sb: SupabaseClient,
  params: { userId: string; tradePostAdId: string; pointCost: number }
): Promise<PointFlowResult> {
  const cost = Math.max(0, Math.floor(Number(params.pointCost) || 0));
  if (cost === 0) return { ok: true };

  const { data: profile, error: pe } = await sb
    .from("profiles")
    .select("points")
    .eq("id", params.userId)
    .maybeSingle();
  if (pe) return { ok: false, error: pe.message };
  const current = Math.max(0, Number((profile as { points?: number } | null)?.points ?? 0));
  if (current < cost) {
    return { ok: false, error: "포인트가 부족합니다." };
  }
  const balanceAfter = current - cost;

  const { error: ue } = await sb.from("profiles").update({ points: balanceAfter }).eq("id", params.userId);
  if (ue) return { ok: false, error: ue.message };

  const { error: le } = await sb.from("point_ledger").insert({
    user_id: params.userId,
    entry_type: "ad_hold",
    amount: -cost,
    balance_after: balanceAfter,
    related_type: "trade_post_ad",
    related_id: params.tradePostAdId,
    description: "거래 광고 신청 — 포인트 보류",
    actor_type: "system",
  });
  if (le) return { ok: false, error: le.message };

  const { error: he } = await sb.from("trade_ad_point_holds").insert({
    user_id: params.userId,
    trade_post_ad_id: params.tradePostAdId,
    amount: cost,
    status: "held",
  });
  if (he) return { ok: false, error: he.message };

  return { ok: true };
}

/**
 * 반려·취소: 보류 해제(잔액 복구) + 원장 `ad_hold_release`.
 */
export async function releaseHeldPointsForTradePostAd(
  sb: SupabaseClient,
  params: { tradePostAdId: string }
): Promise<PointFlowResult> {
  const { data: holds, error: he } = await sb
    .from("trade_ad_point_holds")
    .select("id, user_id, amount, status")
    .eq("trade_post_ad_id", params.tradePostAdId)
    .eq("status", "held");

  if (he) return { ok: false, error: he.message };
  const rows = Array.isArray(holds) ? holds : [];
  if (rows.length === 0) return { ok: true };

  for (const h of rows as { id: string; user_id: string; amount: number }[]) {
    const uid = String(h.user_id ?? "");
    const amt = Math.max(0, Math.floor(Number(h.amount) || 0));
    if (!uid || amt <= 0) continue;

    const { data: profile, error: pe } = await sb.from("profiles").select("points").eq("id", uid).maybeSingle();
    if (pe) return { ok: false, error: pe.message };
    const current = Math.max(0, Number((profile as { points?: number } | null)?.points ?? 0));
    const balanceAfter = current + amt;

    const { error: ue } = await sb.from("profiles").update({ points: balanceAfter }).eq("id", uid);
    if (ue) return { ok: false, error: ue.message };

    const { error: le } = await sb.from("point_ledger").insert({
      user_id: uid,
      entry_type: "ad_hold_release",
      amount: amt,
      balance_after: balanceAfter,
      related_type: "trade_post_ad",
      related_id: params.tradePostAdId,
      description: "거래 광고 반려/취소 — 보류 해제",
      actor_type: "system",
    });
    if (le) return { ok: false, error: le.message };

    const { error: upd } = await sb
      .from("trade_ad_point_holds")
      .update({ status: "released", updated_at: new Date().toISOString() })
      .eq("id", h.id);
    if (upd) return { ok: false, error: upd.message };
  }

  return { ok: true };
}

/**
 * 활성화 시: 보류를 확정(추가 차감 없음) — 원장 `ad_charge` 0원 감사.
 */
export async function finalizeHeldPointsOnTradePostAdActivation(
  sb: SupabaseClient,
  params: { tradePostAdId: string; userId: string }
): Promise<PointFlowResult> {
  const { data: holds, error: he } = await sb
    .from("trade_ad_point_holds")
    .select("id, amount, status")
    .eq("trade_post_ad_id", params.tradePostAdId)
    .eq("status", "held");

  if (he) return { ok: false, error: he.message };
  const rows = Array.isArray(holds) ? holds : [];
  if (rows.length === 0) return { ok: true };

  const { data: profile, error: pe } = await sb
    .from("profiles")
    .select("points")
    .eq("id", params.userId)
    .maybeSingle();
  if (pe) return { ok: false, error: pe.message };
  const balanceAfter = Math.max(0, Number((profile as { points?: number } | null)?.points ?? 0));

  for (const h of rows as { id: string; amount: number }[]) {
    const { error: upd } = await sb
      .from("trade_ad_point_holds")
      .update({ status: "charged", updated_at: new Date().toISOString() })
      .eq("id", h.id);
    if (upd) return { ok: false, error: upd.message };
  }

  const { error: le } = await sb.from("point_ledger").insert({
    user_id: params.userId,
    entry_type: "ad_charge",
    amount: 0,
    balance_after: balanceAfter,
    related_type: "trade_post_ad",
    related_id: params.tradePostAdId,
    description: "거래 광고 활성 — 보류 포인트 확정(추가 차감 없음)",
    actor_type: "system",
  });
  if (le) return { ok: false, error: le.message };

  return { ok: true };
}

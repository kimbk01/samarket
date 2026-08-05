import type { SupabaseClient } from "@supabase/supabase-js";
import {
  appendUserPointLedgerAudit,
  creditUserPoints,
  spendUserPoints,
} from "@/lib/points/user-point-ledger";

export type PointFlowResult = { ok: true } | { ok: false; error: string };

function mapHubError(error: string, code?: string): string {
  if (code === "insufficient_balance" || error === "insufficient_balance") {
    return "포인트가 부족합니다.";
  }
  return error || "point_mutation_failed";
}

/**
 * 광고 신청 시: 포인트 즉시 보류(잔액에서 차감) + 원장 `ad_hold` + hold 행 `held`.
 * 잔액·원장은 user-point-ledger 허브만 사용.
 */
export async function holdPointsForTradePostAdApply(
  sb: SupabaseClient,
  params: { userId: string; tradePostAdId: string; pointCost: number }
): Promise<PointFlowResult> {
  const cost = Math.max(0, Math.floor(Number(params.pointCost) || 0));
  if (cost === 0) return { ok: true };

  const spent = await spendUserPoints(sb, {
    userId: params.userId,
    amount: cost,
    entryType: "ad_hold",
    relatedType: "trade_post_ad",
    relatedId: `hold:${params.tradePostAdId}`,
    description: "거래 광고 신청 — 포인트 보류",
    actorType: "system",
  });
  if (!spent.ok) {
    return { ok: false, error: mapHubError(spent.error, spent.code) };
  }

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

    const credited = await creditUserPoints(sb, {
      userId: uid,
      amount: amt,
      entryType: "ad_hold_release",
      relatedType: "trade_post_ad",
      relatedId: `release:${h.id}`,
      description: "거래 광고 반려/취소 — 보류 해제",
      actorType: "system",
    });
    if (!credited.ok) {
      return { ok: false, error: mapHubError(credited.error, credited.code) };
    }

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

  for (const h of rows as { id: string; amount: number }[]) {
    const { error: upd } = await sb
      .from("trade_ad_point_holds")
      .update({ status: "charged", updated_at: new Date().toISOString() })
      .eq("id", h.id);
    if (upd) return { ok: false, error: upd.message };
  }

  const audit = await appendUserPointLedgerAudit(sb, {
    userId: params.userId,
    entryType: "ad_charge",
    relatedType: "trade_post_ad",
    relatedId: `finalize:${params.tradePostAdId}`,
    description: "거래 광고 활성 — 보류 포인트 확정(추가 차감 없음)",
    actorType: "system",
    amount: 0,
  });
  if (!audit.ok) {
    return { ok: false, error: mapHubError(audit.error, audit.code) };
  }

  return { ok: true };
}

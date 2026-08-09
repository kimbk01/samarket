/**
 * Feed Ad Request D-Point HOLD / CAPTURE / RELEASE.
 * Pattern mirrors trade_ad_point_holds (spend as hold, credit as release, finalize as capture).
 * CONTRACT: docs/dibay-paid-exposure-feed-ad-master-contract.md §2
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  appendUserPointLedgerAudit,
  creditUserPoints,
  spendUserPoints,
} from "@/lib/points/user-point-ledger";

export type PointFlowResult = { ok: true; holdId?: string } | { ok: false; error: string };

function mapHubError(error: string, code?: string): string {
  if (code === "insufficient_balance" || error === "insufficient_balance") {
    return "insufficient_balance";
  }
  return error || "point_mutation_failed";
}

/** APPLY: balance debit as hold + ledger ad_hold + hold row held. */
export async function holdPointsForFeedAdRequest(
  sb: SupabaseClient,
  params: { userId: string; requestId: string; pointCost: number }
): Promise<PointFlowResult> {
  const cost = Math.max(0, Math.floor(Number(params.pointCost) || 0));
  if (cost === 0) return { ok: true };

  const spent = await spendUserPoints(sb, {
    userId: params.userId,
    amount: cost,
    entryType: "ad_hold",
    relatedType: "feed_ad_request",
    relatedId: `hold:${params.requestId}`,
    description: "피드 광고 신청 — 포인트 보류",
    actorType: "system",
  });
  if (!spent.ok) {
    return { ok: false, error: mapHubError(spent.error, spent.code) };
  }

  const { data: row, error: he } = await sb
    .from("feed_ad_point_holds")
    .insert({
      user_id: params.userId,
      request_id: params.requestId,
      amount: cost,
      status: "held",
    })
    .select("id")
    .maybeSingle();

  if (he) return { ok: false, error: he.message };
  return { ok: true, holdId: row?.id ? String(row.id) : undefined };
}

/** REJECT / CANCEL: credit back + hold released. */
export async function releaseHeldPointsForFeedAdRequest(
  sb: SupabaseClient,
  params: { requestId: string }
): Promise<PointFlowResult> {
  const { data: holds, error: he } = await sb
    .from("feed_ad_point_holds")
    .select("id, user_id, amount, status")
    .eq("request_id", params.requestId)
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
      relatedType: "feed_ad_request",
      relatedId: `release:${h.id}`,
      description: "피드 광고 거절/취소 — 보류 해제",
      actorType: "system",
    });
    if (!credited.ok) {
      return { ok: false, error: mapHubError(credited.error, credited.code) };
    }

    const { error: upd } = await sb
      .from("feed_ad_point_holds")
      .update({ status: "released", updated_at: new Date().toISOString() })
      .eq("id", h.id);
    if (upd) return { ok: false, error: upd.message };
  }

  return { ok: true };
}

/** APPROVE: mark hold captured (no second debit) + audit. */
export async function captureHeldPointsForFeedAdRequest(
  sb: SupabaseClient,
  params: { requestId: string; userId: string; pointCost: number }
): Promise<PointFlowResult> {
  const { data: holds, error: he } = await sb
    .from("feed_ad_point_holds")
    .select("id, amount, status")
    .eq("request_id", params.requestId)
    .eq("status", "held");

  if (he) return { ok: false, error: he.message };
  const rows = Array.isArray(holds) ? holds : [];
  if (rows.length === 0) {
    return { ok: false, error: "hold_missing" };
  }

  for (const h of rows as { id: string }[]) {
    const { error: upd } = await sb
      .from("feed_ad_point_holds")
      .update({ status: "captured", updated_at: new Date().toISOString() })
      .eq("id", h.id)
      .eq("status", "held");
    if (upd) return { ok: false, error: upd.message };
  }

  const cost = Math.max(0, Math.floor(Number(params.pointCost) || 0));
  await appendUserPointLedgerAudit(sb, {
    userId: params.userId,
    amount: 0,
    entryType: "ad_purchase",
    relatedType: "feed_ad_request",
    relatedId: `capture:${params.requestId}`,
    description: `피드 광고 승인 — ${cost}P 확정`,
    actorType: "admin",
  }).catch(() => {
    /* audit best-effort */
  });

  return { ok: true };
}

/**
 * PHASE 1 compensation: credit back held OR captured holds after failed activation.
 * DO NOT use for normal reject (use releaseHeldPointsForFeedAdRequest — held only).
 * Makes CAPTURED + NO VALID AD recoverable.
 */
export async function compensateFeedAdPointHold(
  sb: SupabaseClient,
  params: { requestId: string }
): Promise<PointFlowResult> {
  const { data: holds, error: he } = await sb
    .from("feed_ad_point_holds")
    .select("id, user_id, amount, status")
    .eq("request_id", params.requestId)
    .in("status", ["held", "captured"]);

  if (he) return { ok: false, error: he.message };
  const rows = Array.isArray(holds) ? holds : [];
  if (rows.length === 0) return { ok: true };

  for (const h of rows as {
    id: string;
    user_id: string;
    amount: number;
    status: string;
  }[]) {
    const uid = String(h.user_id ?? "");
    const amt = Math.max(0, Math.floor(Number(h.amount) || 0));
    if (!uid || amt <= 0) continue;

    const credited = await creditUserPoints(sb, {
      userId: uid,
      amount: amt,
      entryType: "ad_hold_release",
      relatedType: "feed_ad_request",
      relatedId: `compensate:${h.id}`,
      description:
        h.status === "captured"
          ? "피드 광고 승인 실패 보상 — 확정 포인트 환급"
          : "피드 광고 승인 실패 보상 — 보류 해제",
      actorType: "system",
    });
    if (!credited.ok) {
      return { ok: false, error: mapHubError(credited.error, credited.code) };
    }

    const { error: upd } = await sb
      .from("feed_ad_point_holds")
      .update({ status: "released", updated_at: new Date().toISOString() })
      .eq("id", h.id)
      .in("status", ["held", "captured"]);
    if (upd) return { ok: false, error: upd.message };
  }

  return { ok: true };
}

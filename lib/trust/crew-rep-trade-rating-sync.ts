/**
 * CREW REP 거래 신뢰(T) — 거래 평가 → 원장 동기화 (S5, 설계 §7.4).
 *
 * 공개된 평가만 사건이 된다. 아쉬워요는 이의제기 기간(공개 후 14일)이 지났거나 이의가 기각된 뒤에만.
 * 이의 검토 중(disputed)·인정(reversed)·운영자 숨김이면 되돌린다. 기여 = 기본점 × r(계산기) × w(여기서 계산) × d.
 * v1 원장(trade_review_*)과 겹치지 않도록 새 흐름(trade_happened 있음) 평가만 대상이다.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { CREW_REP_TRADE_RATING as R } from "@/lib/trust/crew-rep-policy";
import {
  applyTrustEventDiff,
  desiredEvent,
  diffTrustEvents,
  fetchAll,
  loadExistingTrustEvents,
  type DesiredTrustEvent,
  type TrustEventSyncResult,
} from "@/lib/trust/crew-rep-sync-core";
import { tradeRatingWeight, type TradeHappened } from "@/lib/trade/trade-rating";

type Sb = SupabaseClient<any>;
const DAY_MS = 86_400_000;

export const TRADE_RATING_EVENT_TYPES = ["trade_rating_good", "trade_rating_normal", "trade_rating_bad"] as const;
const SYNC_REVERSE_REASON = "trade_rating_source_invalid";

export type TradeRatingSource = {
  id: string;
  room_id: string;
  reviewer_id: string;
  reviewee_id: string;
  public_review_type: string;
  trade_happened: TradeHappened | null;
  rating_status: string;
  revealed_at: string | null;
  disputed_at: string | null;
  dispute_decision: string | null;
  is_hidden_by_admin: boolean | null;
};

/** 순수 함수 — 지금 원장에 있어야 할 거래 평가 사건. */
export function planTradeRatingEvents(rows: TradeRatingSource[], asOf: Date): DesiredTrustEvent[] {
  const byRoom = new Map<string, TradeRatingSource[]>();
  for (const r of rows) {
    const list = byRoom.get(r.room_id) ?? [];
    list.push(r);
    byRoom.set(r.room_id, list);
  }
  const out: DesiredTrustEvent[] = [];
  for (const r of rows) {
    if (!r.trade_happened || r.rating_status !== "revealed" || !r.revealed_at || r.is_hidden_by_admin) continue;
    if (r.public_review_type === "bad") {
      const windowOver = asOf.getTime() - new Date(r.revealed_at).getTime() >= R.disputeDays * DAY_MS;
      const ok = r.dispute_decision === "rejected" || (!r.disputed_at && windowOver);
      if (!ok) continue;
    }
    const type =
      r.public_review_type === "good" ? "trade_rating_good" : r.public_review_type === "normal" ? "trade_rating_normal" : r.public_review_type === "bad" ? "trade_rating_bad" : null;
    if (!type) continue;
    const counterpart = (byRoom.get(r.room_id) ?? []).find((x) => x.reviewer_id === r.reviewee_id && x.id !== r.id);
    const w = tradeRatingWeight(r.trade_happened, counterpart?.trade_happened ?? null);
    out.push(
      desiredEvent({
        member_id: r.reviewee_id,
        domain: "trade",
        event_type: type,
        direction: type === "trade_rating_bad" ? "negative" : "positive",
        source_type: "transaction_review",
        source_id: r.id,
        counterparty_id: r.reviewer_id,
        occurred_at: r.revealed_at,
        metadata: { trade_weight: w, room_id: r.room_id, trade_happened: r.trade_happened },
      })
    );
  }
  return out;
}

export async function syncTradeRatingTrustEvents(
  sb: Sb,
  opts: { asOf?: Date; dryRun?: boolean } = {}
): Promise<TrustEventSyncResult> {
  const asOf = opts.asOf ?? new Date();
  const rows = await fetchAll<TradeRatingSource>((a, b) =>
    sb
      .from("transaction_reviews")
      .select(
        "id, room_id, reviewer_id, reviewee_id, public_review_type, trade_happened, rating_status, revealed_at, disputed_at, dispute_decision, is_hidden_by_admin"
      )
      .not("trade_happened", "is", null)
      .order("id")
      .range(a, b)
  );
  const desired = planTradeRatingEvents(rows, asOf);
  const existing = await loadExistingTrustEvents(sb, TRADE_RATING_EVENT_TYPES);
  const diff = diffTrustEvents(desired, existing, SYNC_REVERSE_REASON);
  return applyTrustEventDiff(sb, desired, diff, { asOf, reverseReason: SYNC_REVERSE_REASON, dryRun: opts.dryRun });
}

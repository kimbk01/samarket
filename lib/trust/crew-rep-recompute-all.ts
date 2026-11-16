/**
 * CREW REP 전체 재계산 — 매일 03:00 PHT 예약 작업과 정책 전환 스크립트가 같은 함수를 쓴다.
 * 대상 = 원장 사건이 있거나 스냅샷이 있는 회원(기록 없는 회원은 50 그대로라 계산할 것이 없다).
 * 기간 가중(180일 절반·365일 제외)·깨끗한 활동 월은 시간이 지나면 바뀌므로 매일 다시 계산해야 한다.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { calculateCrewRep } from "@/lib/trust/crew-rep-calculator";
import {
  loadCrewRepRaterContexts,
  recomputeMemberTrustSnapshot,
  type CrewRepRecomputeCause,
} from "@/lib/trust/trust-event-ledger";
import type { CrewRepLedgerEvent } from "@/lib/trust/crew-rep-calculator";

type Sb = SupabaseClient<any>;

export type CrewRepRecomputeRow = {
  memberId: string;
  before: number | null;
  after: number;
  axis: { trade: number; manner: number; participation: number };
};

export type CrewRepRecomputeAllResult = {
  members: number;
  changed: number;
  failed: number;
  rows: CrewRepRecomputeRow[];
};

async function listTargetMemberIds(sb: Sb): Promise<string[]> {
  const ids = new Set<string>();
  const page = 1000;
  for (const table of ["trust_events", "member_trust_snapshots"] as const) {
    for (let from = 0; ; from += page) {
      const { data, error } = await sb
        .from(table)
        .select("member_id")
        .order("member_id", { ascending: true })
        .range(from, from + page - 1);
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as { member_id: string }[];
      for (const r of rows) if (r.member_id) ids.add(r.member_id);
      if (rows.length < page) break;
    }
  }
  return [...ids].sort();
}

export async function recomputeAllCrewRep(
  sb: Sb,
  opts: { cause: CrewRepRecomputeCause; asOf?: Date; dryRun?: boolean }
): Promise<CrewRepRecomputeAllResult> {
  const asOf = opts.asOf ?? new Date();
  const ids = await listTargetMemberIds(sb);
  const rows: CrewRepRecomputeRow[] = [];
  let failed = 0;

  for (const memberId of ids) {
    try {
      const { data: prev } = await sb
        .from("member_trust_snapshots")
        .select("manner_battery_percent")
        .eq("member_id", memberId)
        .maybeSingle();
      const before =
        (prev as { manner_battery_percent?: number | null } | null)?.manner_battery_percent != null
          ? Number((prev as { manner_battery_percent: number }).manner_battery_percent)
          : null;

      let after: number;
      let axis: CrewRepRecomputeRow["axis"];
      if (opts.dryRun) {
        const { data, error } = await sb
          .from("trust_events")
          .select("id, event_type, status, occurred_at, counterparty_id, metadata")
          .eq("member_id", memberId);
        if (error) throw new Error(error.message);
        const events = (data ?? []) as CrewRepLedgerEvent[];
        const raters = await loadCrewRepRaterContexts(sb, memberId, events, asOf);
        const calc = calculateCrewRep({ events, raters, asOf });
        after = calc.score;
        axis = calc.axis;
      } else {
        const calc = await recomputeMemberTrustSnapshot(sb, memberId, asOf, { cause: opts.cause });
        after = calc.score;
        axis = calc.axis;
      }
      rows.push({ memberId, before, after, axis });
    } catch (e) {
      failed += 1;
      console.error("[crew-rep recompute]", memberId.slice(0, 8), e instanceof Error ? e.message : e);
    }
  }

  return {
    members: ids.length,
    changed: rows.filter((r) => r.before == null || Math.abs(r.before - r.after) >= 0.01).length,
    failed,
    rows,
  };
}

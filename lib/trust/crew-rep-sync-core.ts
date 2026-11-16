/**
 * CREW REP 원천 → 원장 동기화 공통부 (S3 참여 · S4 매너·제재).
 * 「지금 인정되어야 하는 사건」 집합과 원장을 비교해 기록·되돌림·재인정한다. 원장은 지우지 않는다.
 * 되돌림 사유(reverseReason)는 동기화기마다 다르며, 그 동기화기가 되돌린 사건만 다시 인정한다.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { CREW_REP_POLICY_VERSION, buildCrewRepEventIdempotencyKey } from "@/lib/trust/crew-rep-policy";
import type { TrustDirection, TrustDomain } from "@/lib/trust/manner-battery-policy-v1";

type Sb = SupabaseClient<any>;

export type DesiredTrustEvent = {
  member_id: string;
  domain: TrustDomain;
  event_type: string;
  direction: TrustDirection;
  source_type: string;
  source_id: string;
  counterparty_id: string | null;
  occurred_at: string;
  idempotency_key: string;
  metadata: Record<string, unknown>;
};

export type ExistingTrustEvent = {
  id: string;
  member_id: string;
  idempotency_key: string;
  status: string;
  metadata: Record<string, unknown> | null;
};

export type TrustEventDiff = {
  insert: DesiredTrustEvent[];
  reverse: ExistingTrustEvent[];
  reconfirm: ExistingTrustEvent[];
};

export function desiredEvent(e: Omit<DesiredTrustEvent, "idempotency_key">): DesiredTrustEvent {
  return { ...e, idempotency_key: buildCrewRepEventIdempotencyKey(e.event_type, e.source_id, e.member_id) };
}

/** 원하는 집합 ↔ 원장 비교 (순수 함수). 다른 사유로 되돌린 사건은 다시 살리지 않는다. */
export function diffTrustEvents(
  desired: DesiredTrustEvent[],
  existing: ExistingTrustEvent[],
  reverseReason: string
): TrustEventDiff {
  const want = new Map(desired.map((d) => [d.idempotency_key, d]));
  const have = new Map(existing.map((e) => [e.idempotency_key, e]));
  return {
    insert: desired.filter((d) => !have.has(d.idempotency_key)),
    reverse: existing.filter((e) => e.status === "confirmed" && !want.has(e.idempotency_key)),
    reconfirm: existing.filter(
      (e) =>
        e.status === "reversed" &&
        want.has(e.idempotency_key) &&
        (e.metadata as { reverse_reason?: unknown } | null)?.reverse_reason === reverseReason
    ),
  };
}

export async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>
): Promise<T[]> {
  const page = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += page) {
    const { data, error } = await build(from, from + page - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < page) break;
  }
  return out;
}

export function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

export async function loadExistingTrustEvents(sb: Sb, eventTypes: readonly string[]): Promise<ExistingTrustEvent[]> {
  return fetchAll<ExistingTrustEvent>((a, b) =>
    sb
      .from("trust_events")
      .select("id, member_id, idempotency_key, status, metadata")
      .in("event_type", [...eventTypes])
      .order("id")
      .range(a, b)
  );
}

export type TrustEventSyncResult = {
  desired: number;
  inserted: number;
  reversed: number;
  reconfirmed: number;
  /** 원장이 바뀐 회원 (재계산 대상) */
  touchedMemberIds: string[];
  byType: Record<string, number>;
};

/** 차이를 원장에 쓴다. dryRun 이면 쓰지 않고 센다. */
export async function applyTrustEventDiff(
  sb: Sb,
  desired: DesiredTrustEvent[],
  diff: TrustEventDiff,
  opts: { asOf: Date; reverseReason: string; dryRun?: boolean }
): Promise<TrustEventSyncResult> {
  const byType: Record<string, number> = {};
  for (const d of desired) byType[d.event_type] = (byType[d.event_type] ?? 0) + 1;
  const touched = new Set<string>([
    ...diff.insert.map((d) => d.member_id),
    ...diff.reverse.map((e) => e.member_id),
    ...diff.reconfirm.map((e) => e.member_id),
  ]);

  if (!opts.dryRun) {
    const nowIso = opts.asOf.toISOString();
    for (const rows of chunk(diff.insert, 200)) {
      const { error } = await sb.from("trust_events").upsert(
        rows.map((d) => ({
          ...d,
          severity: "none",
          status: "confirmed",
          confirmed_at: nowIso,
          policy_version: CREW_REP_POLICY_VERSION,
        })) as never,
        { onConflict: "idempotency_key", ignoreDuplicates: true }
      );
      if (error) throw new Error(error.message);
    }
    for (const e of diff.reverse) {
      const { error } = await sb
        .from("trust_events")
        .update({
          status: "reversed",
          metadata: { ...(e.metadata ?? {}), reversed_at: nowIso, reverse_reason: opts.reverseReason },
        } as never)
        .eq("id", e.id)
        .eq("status", "confirmed");
      if (error) throw new Error(error.message);
    }
    for (const e of diff.reconfirm) {
      const { error } = await sb
        .from("trust_events")
        .update({
          status: "confirmed",
          metadata: { ...(e.metadata ?? {}), reconfirmed_at: nowIso, reverse_reason: null },
        } as never)
        .eq("id", e.id)
        .eq("status", "reversed");
      if (error) throw new Error(error.message);
    }
  }

  return {
    desired: desired.length,
    inserted: diff.insert.length,
    reversed: diff.reverse.length,
    reconfirmed: diff.reconfirm.length,
    touchedMemberIds: [...touched].sort(),
    byType,
  };
}

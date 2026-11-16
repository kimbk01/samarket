/**
 * Canonical trust event ledger writer + snapshot recompute (CREW REP crew_rep_v2).
 * DO NOT: mutate profiles.trust_score via raw deltas (legacy applyTrustScoreDelta).
 * Bridge: after snapshot recompute, profiles.trust_score is set to projection for read-compat.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  calculateCrewRep,
  type CrewRepCalculation,
  type CrewRepLedgerEvent,
  type CrewRepRaterContext,
} from "@/lib/trust/crew-rep-calculator";
import { CREW_REP_POLICY_VERSION, crewRepSanctionEventType } from "@/lib/trust/crew-rep-policy";
import {
  type TrustDirection,
  type TrustDomain,
  type TrustSeverity,
} from "@/lib/trust/manner-battery-policy-v1";

type Sb = SupabaseClient<any>;

export type RecordTrustEventInput = {
  memberId: string;
  domain: TrustDomain;
  /** `CREW_REP_EVENT_RULES` 의 종류(규칙 없는 종류는 기록만, 점수 0) */
  eventType: string;
  sourceType: string;
  sourceId: string;
  idempotencyKey: string;
  direction: TrustDirection;
  severity?: TrustSeverity;
  counterpartyId?: string | null;
  occurredAt?: string;
  confirmedAt?: string | null;
  metadata?: Record<string, unknown>;
};

export type RecordTrustEventResult =
  | { ok: true; inserted: true; eventId: string }
  | { ok: true; inserted: false; eventId: string; duplicate: true }
  | { ok: false; error: string };

/** 점수 이력 원인 (member_trust_score_history.cause) */
export type CrewRepRecomputeCause = "event" | "reversal" | "admin" | "daily_recompute" | "policy_migration";

const DAY_MS = 86_400_000;

async function loadMemberEvents(sb: Sb, memberId: string): Promise<CrewRepLedgerEvent[]> {
  const { data, error } = await sb
    .from("trust_events")
    .select("id, event_type, status, occurred_at, counterparty_id, metadata")
    .eq("member_id", memberId)
    .order("occurred_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as CrewRepLedgerEvent[];
}

/**
 * 평가자(=counterparty) 상태를 모은다 — 가입 기간·전화 인증·현재 점수·같은 기기·차단·정지·준 평가 성향·상호 좋아요.
 * 읽기 실패한 항목은 보수적으로 「모름」 처리한다(r 계산은 계산기 규칙).
 */
export async function loadCrewRepRaterContexts(
  sb: Sb,
  memberId: string,
  events: CrewRepLedgerEvent[],
  asOf: Date
): Promise<Record<string, CrewRepRaterContext>> {
  const ids = [...new Set(events.map((e) => e.counterparty_id).filter((x): x is string => Boolean(x)))];
  if (!ids.length) return {};

  const [profiles, snaps, devices, blocks, sanctions, given, reciprocal] = await Promise.all([
    sb.from("profiles").select("id, created_at, phone_verified").in("id", ids),
    sb.from("member_trust_snapshots").select("member_id, manner_battery_percent").in("member_id", ids),
    sb.from("user_devices").select("user_id, device_id").in("user_id", [memberId, ...ids]),
    sb
      .from("user_blocks")
      .select("user_id")
      .in("user_id", ids)
      .eq("blocked_user_id", memberId)
      .is("released_at", null),
    sb
      .from("sanctions")
      .select("user_id, sanction_type, start_at, end_at, revoked_at")
      .in("user_id", ids)
      .is("revoked_at", null),
    sb.from("transaction_reviews").select("reviewer_id, public_review_type").in("reviewer_id", ids),
    sb
      .from("transaction_reviews")
      .select("reviewee_id")
      .eq("reviewer_id", memberId)
      .eq("public_review_type", "good")
      .in("reviewee_id", ids),
  ]);

  const memberDevices = new Set<string>();
  const raterDevices = new Map<string, Set<string>>();
  for (const row of (devices.data ?? []) as { user_id: string; device_id: string | null }[]) {
    if (!row.device_id) continue;
    if (row.user_id === memberId) memberDevices.add(row.device_id);
    else {
      const set = raterDevices.get(row.user_id) ?? new Set<string>();
      set.add(row.device_id);
      raterDevices.set(row.user_id, set);
    }
  }
  const blocked = new Set(((blocks.data ?? []) as { user_id: string }[]).map((b) => b.user_id));
  const suspended = new Set<string>();
  for (const row of (sanctions.data ?? []) as {
    user_id: string;
    sanction_type: string;
    start_at: string | null;
    end_at: string | null;
  }[]) {
    if (crewRepSanctionEventType(row.sanction_type) !== "sanction_suspension") continue;
    const startOk = !row.start_at || new Date(row.start_at).getTime() <= asOf.getTime();
    const endOk = !row.end_at || new Date(row.end_at).getTime() > asOf.getTime();
    if (startOk && endOk) suspended.add(row.user_id);
  }
  const givenMap = new Map<string, { total: number; bad: number }>();
  for (const row of (given.data ?? []) as { reviewer_id: string; public_review_type: string }[]) {
    const g = givenMap.get(row.reviewer_id) ?? { total: 0, bad: 0 };
    g.total += 1;
    if (row.public_review_type === "bad") g.bad += 1;
    givenMap.set(row.reviewer_id, g);
  }
  const reciprocalMap = new Map<string, number>();
  for (const row of (reciprocal.data ?? []) as { reviewee_id: string }[]) {
    reciprocalMap.set(row.reviewee_id, (reciprocalMap.get(row.reviewee_id) ?? 0) + 1);
  }
  const scoreMap = new Map<string, number>();
  for (const row of (snaps.data ?? []) as { member_id: string; manner_battery_percent: number | null }[]) {
    if (row.manner_battery_percent != null) scoreMap.set(row.member_id, Number(row.manner_battery_percent));
  }

  const out: Record<string, CrewRepRaterContext> = {};
  for (const row of (profiles.data ?? []) as { id: string; created_at: string | null; phone_verified: boolean | null }[]) {
    const created = row.created_at ? new Date(row.created_at).getTime() : null;
    const devs = raterDevices.get(row.id);
    out[row.id] = {
      accountAgeDays: created != null ? (asOf.getTime() - created) / DAY_MS : null,
      phoneVerified: row.phone_verified === true,
      score: scoreMap.get(row.id) ?? null,
      sharedDevice: devs ? [...devs].some((d) => memberDevices.has(d)) : false,
      blockedMember: blocked.has(row.id),
      suspended: suspended.has(row.id),
      givenRatings: givenMap.get(row.id) ?? { total: 0, bad: 0 },
      reciprocalGoodCount: reciprocalMap.get(row.id) ?? 0,
    };
  }
  return out;
}

/** 원장 → CREW REP 계산 → 스냅샷 · 점수 이력 · profiles.trust_score(읽기 호환). */
export async function recomputeMemberTrustSnapshot(
  sb: Sb,
  memberId: string,
  asOf?: Date | string,
  opts?: { cause?: CrewRepRecomputeCause; causeEventId?: string | null }
): Promise<CrewRepCalculation & { manner_battery_percent: number }> {
  const asOfDate = asOf ? new Date(asOf) : new Date();
  const events = await loadMemberEvents(sb, memberId);
  const raters = await loadCrewRepRaterContexts(sb, memberId, events, asOfDate);
  const calc = calculateCrewRep({ events, raters, asOf: asOfDate });

  const { data: prev } = await sb
    .from("member_trust_snapshots")
    .select("manner_battery_percent, policy_version")
    .eq("member_id", memberId)
    .maybeSingle();
  const prevRow = prev as { manner_battery_percent?: number | null; policy_version?: string | null } | null;
  const prevScore = prevRow?.manner_battery_percent != null ? Number(prevRow.manner_battery_percent) : null;

  const row = {
    member_id: memberId,
    manner_battery_percent: calc.score,
    policy_version: calc.policy_version,
    active_domains: ["trade", "community", "delivery", "platform"],
    eligible_event_count: calc.counted_event_count,
    trade_completed_count: calc.counts.trade_completed,
    review_good_count: calc.counts.rating_good,
    review_normal_count: calc.counts.rating_normal,
    review_bad_count: calc.counts.rating_bad,
    unique_counterparty_count: calc.unique_counterparty_count,
    reliability_component: calc.axis.trade,
    feedback_component: calc.axis.manner,
    confidence: null,
    axis_trade: calc.axis.trade,
    axis_manner: calc.axis.manner,
    axis_participation: calc.axis.participation,
    sanction_penalty: calc.sanction_penalty,
    sanction_active: calc.sanction_active,
    window_started_at: calc.window_started_at,
    calculated_as_of: calc.calculated_as_of,
    calculated_at: new Date().toISOString(),
    metadata: {
      manual_adjustment_sum: calc.manual_adjustment_sum,
      evidence: calc.evidence,
      clean_months: calc.counts.clean_months,
      contributions: calc.contributions,
    },
  };

  const { error: upErr } = await sb.from("member_trust_snapshots").upsert(row as never, {
    onConflict: "member_id",
  });
  if (upErr) throw new Error(upErr.message);

  const changed =
    prevScore == null || Math.abs(prevScore - calc.score) >= 0.01 || prevRow?.policy_version !== calc.policy_version;
  if (changed) {
    const { error: hErr } = await sb.from("member_trust_score_history").insert({
      member_id: memberId,
      score_before: prevScore,
      score_after: calc.score,
      axis_trade: calc.axis.trade,
      axis_manner: calc.axis.manner,
      axis_participation: calc.axis.participation,
      sanction_penalty: calc.sanction_penalty,
      cause: opts?.cause ?? "event",
      cause_event_id: opts?.causeEventId ?? null,
      policy_version: calc.policy_version,
      calculated_as_of: calc.calculated_as_of,
    } as never);
    if (hErr) throw new Error(hErr.message);
  }

  // Read-compat bridge only — not authority. Snapshot is read SSOT.
  await sb
    .from("profiles")
    .update({ trust_score: calc.score } as never)
    .eq("id", memberId);

  return { ...calc, manner_battery_percent: calc.score };
}

export async function recordTrustEvent(sb: Sb, input: RecordTrustEventInput): Promise<RecordTrustEventResult> {
  const memberId = input.memberId?.trim();
  const sourceId = input.sourceId?.trim();
  const key = input.idempotencyKey?.trim();
  if (!memberId || !sourceId || !key) {
    return { ok: false, error: "memberId, sourceId, idempotencyKey required" };
  }

  const occurredAt = input.occurredAt ?? new Date().toISOString();
  const insertRow = {
    member_id: memberId,
    domain: input.domain,
    event_type: input.eventType,
    source_type: input.sourceType,
    source_id: sourceId,
    counterparty_id: input.counterpartyId ?? null,
    direction: input.direction,
    severity: input.severity ?? "none",
    status: "confirmed",
    occurred_at: occurredAt,
    confirmed_at: input.confirmedAt ?? occurredAt,
    idempotency_key: key,
    policy_version: CREW_REP_POLICY_VERSION,
    metadata: input.metadata ?? {},
  };

  const { data, error } = await sb.from("trust_events").insert(insertRow as never).select("id").maybeSingle();

  if (error) {
    const code = (error as { code?: string }).code;
    if (code === "23505") {
      const { data: existing } = await sb
        .from("trust_events")
        .select("id")
        .eq("idempotency_key", key)
        .maybeSingle();
      const id = (existing as { id?: string } | null)?.id;
      if (id) {
        await recomputeMemberTrustSnapshot(sb, memberId, undefined, { cause: "event", causeEventId: id });
        return { ok: true, inserted: false, eventId: id, duplicate: true };
      }
      return { ok: false, error: error.message };
    }
    return { ok: false, error: error.message };
  }

  const eventId = (data as { id?: string } | null)?.id;
  if (!eventId) return { ok: false, error: "insert returned no id" };

  await recomputeMemberTrustSnapshot(sb, memberId, undefined, { cause: "event", causeEventId: eventId });
  return { ok: true, inserted: true, eventId };
}

export async function recordTrustEventsForMembers(
  sb: Sb,
  memberIds: string[],
  factory: (memberId: string) => Omit<RecordTrustEventInput, "memberId">
): Promise<void> {
  for (const mid of memberIds) {
    if (!mid?.trim()) continue;
    await recordTrustEvent(sb, { ...factory(mid.trim()), memberId: mid.trim() });
  }
}

/**
 * Reverse a confirmed event (immutable: status flip + audit metadata).
 * Does NOT insert a second score-eligible event.
 */
export async function reverseTrustEvent(
  sb: Sb,
  originalEventId: string,
  reason: string
): Promise<{ ok: boolean; error?: string }> {
  const { data: orig, error } = await sb
    .from("trust_events")
    .select("id, member_id, status, metadata")
    .eq("id", originalEventId)
    .maybeSingle();
  if (error || !orig) return { ok: false, error: error?.message ?? "event not found" };

  const row = orig as {
    id: string;
    member_id: string;
    status: string;
    metadata?: Record<string, unknown> | null;
  };

  if (row.status !== "reversed") {
    const { error: upErr } = await sb
      .from("trust_events")
      .update({
        status: "reversed",
        metadata: {
          ...(row.metadata ?? {}),
          reversed_at: new Date().toISOString(),
          reverse_reason: reason,
        },
      } as never)
      .eq("id", row.id);
    if (upErr) return { ok: false, error: upErr.message };
  }

  await recomputeMemberTrustSnapshot(sb, row.member_id, undefined, { cause: "reversal", causeEventId: row.id });
  return { ok: true };
}

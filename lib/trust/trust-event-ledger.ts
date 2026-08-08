/**
 * Canonical trust event ledger writer + snapshot recompute.
 * DO NOT: mutate profiles.trust_score via raw deltas (legacy applyTrustScoreDelta).
 * Bridge: after snapshot recompute, profiles.trust_score is set to projection for read-compat.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  calculateMannerBattery,
  type CalculatorTrustEvent,
} from "@/lib/trust/manner-battery-calculator";
import {
  MANNER_POLICY_VERSION,
  type TrustDirection,
  type TrustDomain,
  type TrustEventType,
  type TrustSeverity,
} from "@/lib/trust/manner-battery-policy-v1";

type Sb = SupabaseClient<any>;

export type RecordTrustEventInput = {
  memberId: string;
  domain: TrustDomain;
  eventType: TrustEventType;
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

async function loadMemberEvents(sb: Sb, memberId: string): Promise<CalculatorTrustEvent[]> {
  const { data, error } = await sb
    .from("trust_events")
    .select("id, member_id, domain, event_type, direction, status, occurred_at, counterparty_id, metadata")
    .eq("member_id", memberId)
    .order("occurred_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as CalculatorTrustEvent[];
}

export async function recomputeMemberTrustSnapshot(
  sb: Sb,
  memberId: string,
  asOf?: Date | string
): Promise<ReturnType<typeof calculateMannerBattery>> {
  const events = await loadMemberEvents(sb, memberId);
  const calc = calculateMannerBattery({ events, asOf });

  const row = {
    member_id: memberId,
    manner_battery_percent: calc.manner_battery_percent,
    policy_version: calc.policy_version,
    active_domains: calc.active_domains,
    eligible_event_count: calc.eligible_event_count,
    trade_completed_count: calc.trade_completed_count,
    review_good_count: calc.review_good_count,
    review_normal_count: calc.review_normal_count,
    review_bad_count: calc.review_bad_count,
    unique_counterparty_count: calc.unique_counterparty_count,
    reliability_component: calc.reliability_component,
    feedback_component: calc.feedback_component,
    confidence: calc.confidence,
    window_started_at: calc.window_started_at,
    calculated_as_of: calc.calculated_as_of,
    calculated_at: new Date().toISOString(),
    metadata: {
      manual_adjustment_sum: calc.manual_adjustment_sum,
    },
  };

  const { error: upErr } = await sb.from("member_trust_snapshots").upsert(row as never, {
    onConflict: "member_id",
  });
  if (upErr) throw new Error(upErr.message);

  // Read-compat bridge only — not authority. Snapshot is read SSOT.
  await sb
    .from("profiles")
    .update({ trust_score: calc.manner_battery_percent } as never)
    .eq("id", memberId);

  return calc;
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
    policy_version: MANNER_POLICY_VERSION,
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
        await recomputeMemberTrustSnapshot(sb, memberId);
        return { ok: true, inserted: false, eventId: id, duplicate: true };
      }
      return { ok: false, error: error.message };
    }
    return { ok: false, error: error.message };
  }

  const eventId = (data as { id?: string } | null)?.id;
  if (!eventId) return { ok: false, error: "insert returned no id" };

  await recomputeMemberTrustSnapshot(sb, memberId);
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

  await recomputeMemberTrustSnapshot(sb, row.member_id);
  return { ok: true };
}

/**
 * Delivery Ads schedule promoter — SCHEDULED→ACTIVE / overdue→ENDED (ACTIVE·SCHEDULED·PAUSED_*) /
 * period-passed unreviewed application → REJECTED + full refund (ADS-01, D-19).
 * Calls delivery_ad_system_schedule_transition (canonical DB authority).
 * Does NOT invent a second lifecycle; does NOT fan-out CUT3 notifications.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BANNER_AD_CAMPAIGN_TABLE,
  STORE_SPONSORED_CAMPAIGN_TABLE,
} from "@/lib/stores/advertising/delivery-ad-domain";
import type { AdminDeliveryAdProduct } from "@/lib/stores/advertising/admin-delivery-ad-contract";
import { canTransitionDeliveryAdLifecycle } from "@/lib/stores/advertising/delivery-ad-lifecycle";
import type { DeliveryAdLifecycleStatus } from "@/lib/stores/advertising/delivery-ad-lifecycle";

export const DELIVERY_AD_SYSTEM_SCHEDULE_TRANSITION_RPC =
  "delivery_ad_system_schedule_transition" as const;

export const DELIVERY_AD_SCHEDULE_PROMOTER = {
  authority: DELIVERY_AD_SYSTEM_SCHEDULE_TRANSITION_RPC,
  actor: "system" as const,
  notificationFanOut: "none_cut3_preserved" as const,
  defaultBatchSize: 50,
  maxBatchSize: 100,
} as const;

export type DeliveryAdScheduleSystemAction = "activate_due" | "end_due" | "expire_unreviewed";

/**
 * D-5 apply instant (= DB `c_apply_from` in delivery_ad_system_schedule_transition).
 * Paused campaigns ended before it and applications submitted before it are never touched (no data correction).
 */
export const DELIVERY_AD_SCHEDULE_APPLY_FROM_ISO = "2026-10-20T20:30:00.000Z" as const;

const UNREVIEWED_LIFECYCLES = ["SUBMITTED", "UNDER_REVIEW", "CHANGES_REQUESTED"] as const;
const PAUSED_LIFECYCLES = ["PAUSED_OWNER", "PAUSED_ADMIN"] as const;

export type DeliveryAdScheduleCandidate = {
  productKind: AdminDeliveryAdProduct;
  campaignId: string;
  lifecycleStatus: DeliveryAdLifecycleStatus;
  startAt: string;
  endAt: string;
  updatedAt: string;
  action: DeliveryAdScheduleSystemAction;
};

export function isDeliveryAdActivateDueEligible(input: {
  lifecycleStatus: string;
  startAtIso: string;
  endAtIso: string;
  nowMs?: number;
}): boolean {
  if (input.lifecycleStatus !== "SCHEDULED") return false;
  const nowMs = input.nowMs ?? Date.now();
  const startMs = Date.parse(input.startAtIso);
  const endMs = Date.parse(input.endAtIso);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return false;
  if (startMs > nowMs) return false;
  if (endMs <= nowMs) return false;
  return canTransitionDeliveryAdLifecycle("SCHEDULED", "ACTIVE", "system");
}

export function isDeliveryAdEndDueEligible(input: {
  lifecycleStatus: string;
  endAtIso: string;
  nowMs?: number;
}): boolean {
  const status = input.lifecycleStatus;
  const paused = (PAUSED_LIFECYCLES as readonly string[]).includes(status);
  if (status !== "ACTIVE" && status !== "SCHEDULED" && !paused) return false;
  const nowMs = input.nowMs ?? Date.now();
  const endMs = Date.parse(input.endAtIso);
  if (!Number.isFinite(endMs)) return false;
  if (endMs > nowMs) return false;
  // ADS-11 / D-5 — paused rows only when the period ended after the apply instant.
  if (paused && endMs < Date.parse(DELIVERY_AD_SCHEDULE_APPLY_FROM_ISO)) return false;
  return canTransitionDeliveryAdLifecycle(
    status as DeliveryAdLifecycleStatus,
    "ENDED",
    "system"
  );
}

/** ADS-01 (D-19) — unreviewed application whose requested period passed, submitted after the apply instant. */
export function isDeliveryAdExpireUnreviewedEligible(input: {
  lifecycleStatus: string;
  endAtIso: string;
  submittedAtIso: string | null;
  nowMs?: number;
}): boolean {
  if (!(UNREVIEWED_LIFECYCLES as readonly string[]).includes(input.lifecycleStatus)) return false;
  const nowMs = input.nowMs ?? Date.now();
  const endMs = Date.parse(input.endAtIso);
  const submittedMs = Date.parse(String(input.submittedAtIso ?? ""));
  if (!Number.isFinite(endMs) || !Number.isFinite(submittedMs)) return false;
  if (endMs > nowMs) return false;
  if (submittedMs < Date.parse(DELIVERY_AD_SCHEDULE_APPLY_FROM_ISO)) return false;
  return canTransitionDeliveryAdLifecycle(
    input.lifecycleStatus as DeliveryAdLifecycleStatus,
    "REJECTED",
    "system"
  );
}

function tableFor(product: AdminDeliveryAdProduct): string {
  return product === "banner" ? BANNER_AD_CAMPAIGN_TABLE : STORE_SPONSORED_CAMPAIGN_TABLE;
}

async function loadDueCandidates(
  sb: SupabaseClient,
  productKind: AdminDeliveryAdProduct,
  action: DeliveryAdScheduleSystemAction,
  nowIso: string,
  limit: number,
  options: { pausedOnly?: boolean } = {}
): Promise<DeliveryAdScheduleCandidate[]> {
  const table = tableFor(productKind);
  let q = sb
    .from(table)
    .select("id, lifecycle_status, start_at, end_at, updated_at, submitted_at")
    .limit(limit);

  if (action === "activate_due") {
    q = q
      .eq("lifecycle_status", "SCHEDULED")
      .lte("start_at", nowIso)
      .gt("end_at", nowIso)
      .order("start_at", { ascending: true });
  } else if (action === "expire_unreviewed") {
    q = q
      .in("lifecycle_status", [...UNREVIEWED_LIFECYCLES])
      .lte("end_at", nowIso)
      .gte("submitted_at", DELIVERY_AD_SCHEDULE_APPLY_FROM_ISO)
      .order("end_at", { ascending: true });
  } else if (options.pausedOnly) {
    // ADS-11 — paused rows whose period ended after the apply instant (older rows are never scanned).
    q = q
      .in("lifecycle_status", [...PAUSED_LIFECYCLES])
      .lte("end_at", nowIso)
      .gte("end_at", DELIVERY_AD_SCHEDULE_APPLY_FROM_ISO)
      .order("end_at", { ascending: true });
  } else {
    q = q
      .in("lifecycle_status", ["ACTIVE", "SCHEDULED"])
      .lte("end_at", nowIso)
      .order("end_at", { ascending: true });
  }

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const out: DeliveryAdScheduleCandidate[] = [];
  for (const raw of (data ?? []) as Record<string, unknown>[]) {
    const lifecycleStatus = String(raw.lifecycle_status) as DeliveryAdLifecycleStatus;
    const startAt = String(raw.start_at);
    const endAt = String(raw.end_at);
    if (action === "activate_due") {
      if (
        !isDeliveryAdActivateDueEligible({
          lifecycleStatus,
          startAtIso: startAt,
          endAtIso: endAt,
        })
      ) {
        continue;
      }
    } else if (action === "expire_unreviewed") {
      if (
        !isDeliveryAdExpireUnreviewedEligible({
          lifecycleStatus,
          endAtIso: endAt,
          submittedAtIso: raw.submitted_at == null ? null : String(raw.submitted_at),
        })
      ) {
        continue;
      }
    } else if (
      !isDeliveryAdEndDueEligible({
        lifecycleStatus,
        endAtIso: endAt,
      })
    ) {
      continue;
    }
    out.push({
      productKind,
      campaignId: String(raw.id),
      lifecycleStatus,
      startAt,
      endAt,
      updatedAt: String(raw.updated_at),
      action,
    });
  }
  return out;
}

export type DeliveryAdSchedulePromoteItemResult =
  | {
      ok: true;
      campaignId: string;
      productKind: AdminDeliveryAdProduct;
      action: DeliveryAdScheduleSystemAction;
      from: DeliveryAdLifecycleStatus;
      to: DeliveryAdLifecycleStatus;
      auditId: string;
    }
  | {
      ok: false;
      campaignId: string;
      productKind: AdminDeliveryAdProduct;
      action: DeliveryAdScheduleSystemAction;
      error: string;
      detail?: string;
    };

export async function promoteDeliveryAdScheduleCandidate(
  sb: SupabaseClient,
  candidate: DeliveryAdScheduleCandidate
): Promise<DeliveryAdSchedulePromoteItemResult> {
  const { data, error } = await sb.rpc(DELIVERY_AD_SYSTEM_SCHEDULE_TRANSITION_RPC, {
    p_product_kind: candidate.productKind,
    p_campaign_id: candidate.campaignId,
    p_action: candidate.action,
    p_expected_lifecycle: candidate.lifecycleStatus,
    p_expected_updated_at: candidate.updatedAt,
  });

  if (error) {
    return {
      ok: false,
      campaignId: candidate.campaignId,
      productKind: candidate.productKind,
      action: candidate.action,
      error: "rpc_failed",
      detail: error.message,
    };
  }

  const payload = data as Record<string, unknown> | null;
  if (!payload || payload.ok !== true) {
    return {
      ok: false,
      campaignId: candidate.campaignId,
      productKind: candidate.productKind,
      action: candidate.action,
      error: String(payload?.error ?? "rpc_failed"),
      detail: typeof payload?.detail === "string" ? payload.detail : undefined,
    };
  }

  return {
    ok: true,
    campaignId: String(payload.campaign_id ?? candidate.campaignId),
    productKind: candidate.productKind,
    action: candidate.action,
    from: String(payload.from) as DeliveryAdLifecycleStatus,
    to: String(payload.to) as DeliveryAdLifecycleStatus,
    auditId: String(payload.audit_id ?? ""),
  };
}

export type DeliveryAdSchedulePromoterBatchResult = {
  ok: true;
  activated: number;
  ended: number;
  /** ADS-01 — auto-rejected (period passed, unreviewed) with full refund. */
  expired: number;
  failed: number;
  scanned: number;
  results: DeliveryAdSchedulePromoteItemResult[];
};

/**
 * Bounded batch: activate due SCHEDULED, then end overdue ACTIVE|SCHEDULED.
 * Per-campaign failures are isolated.
 */
export async function runDeliveryAdSchedulePromoterBatch(
  sb: SupabaseClient,
  input: { batchSize?: number; nowMs?: number } = {}
): Promise<DeliveryAdSchedulePromoterBatchResult> {
  const batchSize = Math.min(
    Math.max(input.batchSize ?? DELIVERY_AD_SCHEDULE_PROMOTER.defaultBatchSize, 1),
    DELIVERY_AD_SCHEDULE_PROMOTER.maxBatchSize
  );
  const nowMs = input.nowMs ?? Date.now();
  const nowIso = new Date(nowMs).toISOString();

  const perProduct = Math.max(1, Math.floor(batchSize / 2));
  const activateCandidates = [
    ...(await loadDueCandidates(sb, "store_sponsored", "activate_due", nowIso, perProduct)),
    ...(await loadDueCandidates(sb, "banner", "activate_due", nowIso, perProduct)),
  ].slice(0, batchSize);

  const endBudget = Math.max(0, batchSize - activateCandidates.length);
  const endPerProduct = Math.max(1, Math.floor(endBudget / 2) || 1);
  const endCandidates =
    endBudget > 0
      ? [
          ...(await loadDueCandidates(sb, "store_sponsored", "end_due", nowIso, endPerProduct)),
          ...(await loadDueCandidates(sb, "banner", "end_due", nowIso, endPerProduct)),
        ].slice(0, endBudget)
      : [];

  // ADS-11 / ADS-01 — paused end + unreviewed expiry share the remaining budget (same cron, no new job).
  const restBudget = Math.max(0, batchSize - activateCandidates.length - endCandidates.length);
  const restPerKind = Math.max(1, Math.floor(restBudget / 4) || 1);
  const restCandidates =
    restBudget > 0
      ? [
          ...(await loadDueCandidates(sb, "store_sponsored", "end_due", nowIso, restPerKind, { pausedOnly: true })),
          ...(await loadDueCandidates(sb, "banner", "end_due", nowIso, restPerKind, { pausedOnly: true })),
          ...(await loadDueCandidates(sb, "store_sponsored", "expire_unreviewed", nowIso, restPerKind)),
          ...(await loadDueCandidates(sb, "banner", "expire_unreviewed", nowIso, restPerKind)),
        ].slice(0, restBudget)
      : [];

  const all = [...activateCandidates, ...endCandidates, ...restCandidates];
  const results: DeliveryAdSchedulePromoteItemResult[] = [];
  let activated = 0;
  let ended = 0;
  let expired = 0;
  let failed = 0;

  for (const candidate of all) {
    const result = await promoteDeliveryAdScheduleCandidate(sb, candidate);
    results.push(result);
    if (!result.ok) {
      failed += 1;
      continue;
    }
    if (result.action === "activate_due") activated += 1;
    else if (result.action === "expire_unreviewed") expired += 1;
    else ended += 1;
  }

  return {
    ok: true,
    activated,
    ended,
    expired,
    failed,
    scanned: all.length,
    results,
  };
}

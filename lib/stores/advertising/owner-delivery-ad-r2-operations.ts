/**
 * R2 — Owner Delivery Ads operations panel enablement (presentation / capability).
 * Does not mutate lifecycle. Backend availability is probed via messages API / case load.
 */

import type { DeliveryAdLifecycleStatus } from "@/lib/stores/advertising/delivery-ad-lifecycle";
import { OWNER_ADS_R1_OPERATIONS_PANEL_ENABLED } from "@/lib/stores/advertising/owner-delivery-ad-r1-presentation";

/**
 * Code wants Owner ops UI when backend tables/RPCs exist.
 * R1 hard-false gate remains; R2 is the enablement SSOT for mounting.
 */
export const OWNER_ADS_R2_OPERATIONS_PANEL_ENABLED = true as const;

/** Messages/case load probe result (UI-only; no authority). */
export type OwnerAdsOpsBackendCapability = "unknown" | "available" | "unavailable";

/**
 * Classify HTTP/messages load outcome for fail-closed ops UX.
 * Missing CUT3 tables / db_error / 5xx → unavailable (safe muted copy, hide composer).
 */
export function classifyOwnerAdsOpsBackendCapability(input: {
  httpOk: boolean;
  jsonOk?: boolean;
  error?: string | null;
  status?: number;
}): OwnerAdsOpsBackendCapability {
  if (input.httpOk && input.jsonOk) return "available";
  const err = String(input.error ?? "").trim().toLowerCase();
  const status = input.status ?? 0;
  if (
    status === 503 ||
    status === 500 ||
    err === "db_error" ||
    err === "case_failed" ||
    err === "thread_missing" ||
    err === "supabase_unconfigured" ||
    err.includes("schema cache") ||
    err.includes("does not exist")
  ) {
    return "unavailable";
  }
  // Auth/forbidden still means backend exists; treat as unavailable for composer safety.
  if (!input.httpOk || !input.jsonOk) return "unavailable";
  return "unavailable";
}

/** DRAFT stays application-editor only (R1). Ops never on DRAFT. */
export function ownerAdsOperationsAllowedForLifecycle(
  status: DeliveryAdLifecycleStatus
): boolean {
  return status !== "DRAFT";
}

/**
 * Mount gate: R2 on + non-DRAFT. R1 flag must stay false (preserved).
 * Actual composer/timeline still depend on messages API probe.
 */
export function ownerAdsShouldMountOperationsPanel(
  status: DeliveryAdLifecycleStatus
): boolean {
  void OWNER_ADS_R1_OPERATIONS_PANEL_ENABLED;
  return (
    OWNER_ADS_R2_OPERATIONS_PANEL_ENABLED &&
    ownerAdsOperationsAllowedForLifecycle(status)
  );
}

/** Secondary "문의" CTA only when panel mounted AND backend capability available. */
export function ownerAdsShouldShowContactAdminCta(input: {
  lifecycleStatus: DeliveryAdLifecycleStatus;
  opsCapability: OwnerAdsOpsBackendCapability;
}): boolean {
  if (input.lifecycleStatus !== "CHANGES_REQUESTED") return false;
  if (!ownerAdsShouldMountOperationsPanel(input.lifecycleStatus)) return false;
  return input.opsCapability === "available";
}

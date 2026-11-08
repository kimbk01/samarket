
import { catalogPair } from "@/lib/i18n/catalog-pair";/**
 * Shared Ads canonical lifecycle labels — Admin ↔ Customer parity presentation.
 * Domain writers stay separate; this is label mapping only.
 */

export type AdsCanonicalLifecycle =
  | "submitted"
  | "in_review"
  | "changes_requested"
  | "on_hold"
  | "approved"
  | "payment"
  | "scheduled"
  | "exposing"
  | "paused"
  | "hidden"
  | "rejected"
  | "ended"
  | "cancelled";

const LABELS: Record<AdsCanonicalLifecycle, { ko: string; en: string }> = {
  submitted: catalogPair("admin_submitted_3"),
  in_review: catalogPair("admin_in_review"),
  changes_requested: catalogPair("admin_delivery_ads_lifecycle_changes_requested"),
  on_hold: catalogPair("admin_on_hold"),
  approved: catalogPair("admin_approved"),
  payment: catalogPair("admin_payment"),
  scheduled: catalogPair("admin_scheduled"),
  exposing: catalogPair("admin_live"),
  paused: catalogPair("admin_launch_intro_state_paused"),
  hidden: catalogPair("admin_trade_post_status_hidden"),
  rejected: catalogPair("admin_rejected_2"),
  ended: catalogPair("admin_ended"),
  cancelled: catalogPair("admin_trade_flow_status_cancelled"),
};

export function adsCanonicalLifecycleLabel(
  stage: AdsCanonicalLifecycle,
  ko: boolean
): string {
  return ko ? LABELS[stage].ko : LABELS[stage].en;
}

/** Map Feed ops/member display status → canonical stage. */
export function feedDisplayToCanonical(
  display: string
): AdsCanonicalLifecycle {
  const s = String(display ?? "").trim().toLowerCase();
  if (s === "pending_review" || s === "pending" || s === "held") return "in_review";
  if (s === "scheduled") return "scheduled";
  if (s === "active") return "exposing";
  if (s === "paused") return "paused";
  if (s === "rejected") return "rejected";
  if (s === "cancelled") return "cancelled";
  if (s === "ended" || s === "expired") return "ended";
  return "ended";
}

/** Map Delivery lifecycle string → canonical stage (presentation). */
export function deliveryLifecycleToCanonical(lifecycle: string): AdsCanonicalLifecycle {
  const life = String(lifecycle ?? "").trim().toUpperCase();
  if (life.includes("REVIEW") || life === "SUBMITTED" || life === "PENDING") return "in_review";
  if (life.includes("CHANGES") || life.includes("REVISION")) return "changes_requested";
  if (life.includes("HOLD")) return "on_hold";
  if (life === "APPROVED") return "approved";
  if (life === "SCHEDULED") return "scheduled";
  if (life === "ACTIVE") return "exposing";
  if (life.startsWith("PAUSED")) return "paused";
  if (life === "HIDDEN") return "hidden";
  if (life === "REJECTED") return "rejected";
  if (life === "CANCELLED") return "cancelled";
  if (life === "ENDED" || life === "ARCHIVED" || life === "TERMINATED") return "ended";
  return "in_review";
}

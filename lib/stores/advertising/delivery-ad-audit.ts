/**
 * CUT B — Audit log + physical-delete contract foundation.
 */

import type { DeliveryAdProductKey } from "@/lib/stores/advertising/delivery-ad-product-registry";
import type { DeliveryAdActorRole } from "@/lib/stores/advertising/delivery-ad-lifecycle";
import type { DeliveryAdLifecycleStatus } from "@/lib/stores/advertising/delivery-ad-lifecycle";

export const DELIVERY_AD_AUDIT_LOG_TABLE = "delivery_ad_audit_logs" as const;

export type DeliveryAdAuditInsert = {
  productKind: DeliveryAdProductKey;
  campaignId: string;
  actorType: DeliveryAdActorRole;
  actorUserId: string | null;
  action: string;
  beforeJson?: Record<string, unknown> | null;
  afterJson?: Record<string, unknown> | null;
  reason?: string | null;
};

export type DeliveryAdHistoryFlags = {
  hasImpression: boolean;
  hasClick: boolean;
  hasAttribution: boolean;
  hasBilling: boolean;
  hasFinancialHistory: boolean;
  hasAuditHistory: boolean;
};

/**
 * Physical delete allowed only for DRAFT (or never-exposed test) with zero history.
 * Admin UI “삭제” with history must map to ENDED/ARCHIVED — never purge evidence.
 */
export function canPhysicallyDeleteDeliveryAdCampaign(input: {
  lifecycleStatus: DeliveryAdLifecycleStatus;
  history: DeliveryAdHistoryFlags;
}): boolean {
  if (input.lifecycleStatus !== "DRAFT") return false;
  const h = input.history;
  if (
    h.hasImpression ||
    h.hasClick ||
    h.hasAttribution ||
    h.hasBilling ||
    h.hasFinancialHistory ||
    h.hasAuditHistory
  ) {
    return false;
  }
  return true;
}

export const DELIVERY_AD_DELETE_CONTRACT = {
  physicalDelete: "draft_no_history_only",
  withHistory: ["ENDED", "ARCHIVED", "TERMINATED"] as const,
  rule: "admin_ops_permission_is_not_audit_destruction",
} as const;

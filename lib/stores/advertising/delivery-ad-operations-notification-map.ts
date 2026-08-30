/**
 * PRODUCT CUT 3-D — Delivery Ads ops → Owner notification mapping SSOT.
 * Admin direct notification: BLOCKED_NO_CANONICAL_RECIPIENT (Action Queue only).
 * Does not mutate campaign lifecycle.
 */

import type { DeliveryAdOpsLifecycleEventType } from "@/lib/stores/advertising/delivery-ad-operations-message";
import type { MessageKey } from "@/lib/i18n/messages";
import {
  DELIVERY_AD_ADMIN_ROUTES,
  DELIVERY_AD_OWNER_ROUTES,
} from "@/lib/stores/advertising/delivery-ad-routes";
import type { DeliveryAdProductKind } from "@/lib/stores/advertising/delivery-ad-domain";

export type DeliveryAdOpsNotifyRecipientRole = "owner";

export type DeliveryAdOpsLifecycleNotifySpec = {
  notify: true;
  recipientRole: DeliveryAdOpsNotifyRecipientRole;
  metaKind: string;
  titleKey: MessageKey;
  bodyKey: MessageKey;
  dedupeKey: string;
  linkUrl: string;
};

export type DeliveryAdOpsHumanNotifySpec = {
  notify: true;
  recipientRole: DeliveryAdOpsNotifyRecipientRole;
  metaKind: "delivery_ad_admin_message";
  titleKey: MessageKey;
  bodyKey: MessageKey;
  dedupeKey: string;
  linkUrl: string;
};

/** Lifecycle events that create Owner awareness notifications. */
const OWNER_LIFECYCLE_NOTIFY: Partial<
  Record<
    DeliveryAdOpsLifecycleEventType,
    { metaKind: string; titleKey: MessageKey; bodyKey: MessageKey }
  >
> = {
  CHANGES_REQUESTED: {
    metaKind: "delivery_ad_changes_requested",
    titleKey: "notify_delivery_ad_changes_requested_title",
    bodyKey: "notify_delivery_ad_changes_requested_body",
  },
  APPROVED: {
    metaKind: "delivery_ad_approved",
    titleKey: "notify_delivery_ad_approved_title",
    bodyKey: "notify_delivery_ad_approved_body",
  },
  REJECTED: {
    metaKind: "delivery_ad_rejected",
    titleKey: "notify_delivery_ad_rejected_title",
    bodyKey: "notify_delivery_ad_rejected_body",
  },
  PAUSED_ADMIN: {
    metaKind: "delivery_ad_paused_admin",
    titleKey: "notify_delivery_ad_paused_admin_title",
    bodyKey: "notify_delivery_ad_paused_admin_body",
  },
  RESUMED_ADMIN: {
    metaKind: "delivery_ad_resumed",
    titleKey: "notify_delivery_ad_resumed_title",
    bodyKey: "notify_delivery_ad_resumed_body",
  },
  TERMINATED: {
    metaKind: "delivery_ad_terminated",
    titleKey: "notify_delivery_ad_terminated_title",
    bodyKey: "notify_delivery_ad_terminated_body",
  },
  ENDED: {
    metaKind: "delivery_ad_ended",
    titleKey: "notify_delivery_ad_ended_title",
    bodyKey: "notify_delivery_ad_ended_body",
  },
};

export function buildDeliveryAdLifecycleOwnerDedupeKey(auditId: string): string {
  return `delivery-ad:lifecycle:${auditId.trim()}:owner`;
}

export function buildDeliveryAdHumanOwnerDedupeKey(messageId: string): string {
  return `delivery-ad:message:${messageId.trim()}:owner`;
}

export function mapDeliveryAdLifecycleOwnerNotification(input: {
  eventType: DeliveryAdOpsLifecycleEventType;
  auditId: string;
  campaignId: string;
  productKind: DeliveryAdProductKind;
}): DeliveryAdOpsLifecycleNotifySpec | { notify: false } {
  const spec = OWNER_LIFECYCLE_NOTIFY[input.eventType];
  if (!spec) return { notify: false };
  return {
    notify: true,
    recipientRole: "owner",
    metaKind: spec.metaKind,
    titleKey: spec.titleKey,
    bodyKey: spec.bodyKey,
    dedupeKey: buildDeliveryAdLifecycleOwnerDedupeKey(input.auditId),
    linkUrl: DELIVERY_AD_OWNER_ROUTES.detail(input.campaignId),
  };
}

/** Admin → Owner human message only. Owner → Admin uses Action Queue (no Admin personal Bell). */
export function mapDeliveryAdHumanOwnerNotification(input: {
  messageId: string;
  senderRole: "owner" | "admin";
  campaignId: string;
  productKind: DeliveryAdProductKind;
}): DeliveryAdOpsHumanNotifySpec | { notify: false } {
  if (input.senderRole !== "admin") return { notify: false };
  void input.productKind;
  return {
    notify: true,
    recipientRole: "owner",
    metaKind: "delivery_ad_admin_message",
    titleKey: "notify_delivery_ad_admin_message_title",
    bodyKey: "notify_delivery_ad_admin_message_body",
    dedupeKey: buildDeliveryAdHumanOwnerDedupeKey(input.messageId),
    linkUrl: DELIVERY_AD_OWNER_ROUTES.detail(input.campaignId),
  };
}

/** Canonical Owner destination for Delivery Ads ops notifications (deeplink heal). */
export function tryResolveDeliveryAdOpsOwnerDestinationFromMeta(
  meta: unknown
): string | null {
  if (!meta || typeof meta !== "object") return null;
  const m = meta as Record<string, unknown>;
  const kind = typeof m.kind === "string" ? m.kind.trim() : "";
  if (!kind.startsWith("delivery_ad_")) return null;
  const campaignId =
    typeof m.campaign_id === "string" ? m.campaign_id.trim() : "";
  if (!campaignId) return null;
  return DELIVERY_AD_OWNER_ROUTES.detail(campaignId);
}

/** Canonical Admin Action Queue / ops destination (not a personal Bell deep link). */
export function resolveDeliveryAdOpsAdminDestination(campaignId: string): string {
  return DELIVERY_AD_ADMIN_ROUTES.detail(campaignId);
}

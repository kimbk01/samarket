/**
 * PRODUCT CUT 3-D — Safe Owner notification fan-out for Delivery Ads ops.
 * Failure must not roll back lifecycle / message / case status.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { appendUserNotification } from "@/lib/notifications/append-user-notification";
import { loadNotificationUserLanguage } from "@/lib/notifications/notification-user-language";
import { notifySafeT } from "@/lib/notifications/notify-safe-translate";
import type { DeliveryAdProductKind } from "@/lib/stores/advertising/delivery-ad-domain";
import type { DeliveryAdOpsLifecycleEventType } from "@/lib/stores/advertising/delivery-ad-operations-message";
import {
  mapDeliveryAdHumanOwnerNotification,
  mapDeliveryAdLifecycleOwnerNotification,
} from "@/lib/stores/advertising/delivery-ad-operations-notification-map";

export async function safeNotifyDeliveryAdLifecycleOwner(
  sb: SupabaseClient,
  input: {
    ownerUserId: string;
    productKind: DeliveryAdProductKind;
    campaignId: string;
    auditId: string;
    eventType: DeliveryAdOpsLifecycleEventType;
    caseId?: string | null;
    threadId?: string | null;
  }
): Promise<void> {
  try {
    const mapped = mapDeliveryAdLifecycleOwnerNotification({
      eventType: input.eventType,
      auditId: input.auditId,
      campaignId: input.campaignId,
      productKind: input.productKind,
    });
    if (!mapped.notify) return;
    const ownerUserId = String(input.ownerUserId ?? "").trim();
    if (!ownerUserId) return;

    const language = await loadNotificationUserLanguage(sb, ownerUserId);
    await appendUserNotification(sb, {
      user_id: ownerUserId,
      notification_type: "commerce",
      push_kind: "delivery",
      title: notifySafeT(language, mapped.titleKey),
      body: notifySafeT(language, mapped.bodyKey),
      link_url: mapped.linkUrl,
      dedupe_key: mapped.dedupeKey,
      ref_id: input.campaignId,
      meta: {
        kind: mapped.metaKind,
        product_kind: input.productKind,
        campaign_id: input.campaignId,
        case_id: input.caseId ?? null,
        thread_id: input.threadId ?? null,
        source_audit_id: input.auditId,
      },
    });
  } catch (err) {
    console.error("[safeNotifyDeliveryAdLifecycleOwner]", input.auditId, err);
  }
}

export async function safeNotifyDeliveryAdHumanOwner(
  sb: SupabaseClient,
  input: {
    ownerUserId: string;
    productKind: DeliveryAdProductKind;
    campaignId: string;
    messageId: string;
    senderRole: "owner" | "admin";
    caseId?: string | null;
    threadId?: string | null;
  }
): Promise<void> {
  try {
    const mapped = mapDeliveryAdHumanOwnerNotification({
      messageId: input.messageId,
      senderRole: input.senderRole,
      campaignId: input.campaignId,
      productKind: input.productKind,
    });
    if (!mapped.notify) return;
    const ownerUserId = String(input.ownerUserId ?? "").trim();
    if (!ownerUserId) return;

    const language = await loadNotificationUserLanguage(sb, ownerUserId);
    await appendUserNotification(sb, {
      user_id: ownerUserId,
      notification_type: "commerce",
      push_kind: "delivery",
      title: notifySafeT(language, mapped.titleKey),
      body: notifySafeT(language, mapped.bodyKey),
      link_url: mapped.linkUrl,
      dedupe_key: mapped.dedupeKey,
      ref_id: input.campaignId,
      meta: {
        kind: mapped.metaKind,
        product_kind: input.productKind,
        campaign_id: input.campaignId,
        case_id: input.caseId ?? null,
        thread_id: input.threadId ?? null,
        source_message_id: input.messageId,
      },
    });
  } catch (err) {
    console.error("[safeNotifyDeliveryAdHumanOwner]", input.messageId, err);
  }
}

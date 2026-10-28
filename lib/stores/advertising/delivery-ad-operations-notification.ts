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

/** B-04: 오너 알림함(매장 단위)에 보이도록 광고 캠페인의 매장 id 를 싣는다. 조회 실패 시 null(회원 쪽에 남음). */
async function loadDeliveryAdCampaignStoreId(
  sb: SupabaseClient,
  productKind: DeliveryAdProductKind,
  campaignId: string
): Promise<string | null> {
  const cid = String(campaignId ?? "").trim();
  if (!cid) return null;
  const table = productKind === "store_sponsored" ? "store_paid_ad_campaigns" : "store_banner_ad_campaigns";
  try {
    const { data } = await sb.from(table).select("store_id").eq("id", cid).maybeSingle();
    const sid = String((data as { store_id?: unknown } | null)?.store_id ?? "").trim();
    return sid || null;
  } catch {
    // 매장 id 조회 실패가 알림 자체를 막지 않는다.
    return null;
  }
}

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
    const storeId = await loadDeliveryAdCampaignStoreId(sb, input.productKind, input.campaignId);
    await appendUserNotification(sb, {
      user_id: ownerUserId,
      notification_type: "system",
      // SRV-03: business notice to the owner, never marketing (no ad consent / quiet-hours gate).
      push_kind: "notice",
      title: notifySafeT(language, mapped.titleKey),
      body: notifySafeT(language, mapped.bodyKey),
      link_url: mapped.linkUrl,
      dedupe_key: mapped.dedupeKey,
      ref_id: input.campaignId,
      meta: {
        kind: mapped.metaKind,
        product_kind: input.productKind,
        campaign_id: input.campaignId,
        ...(storeId ? { store_id: storeId } : {}),
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
    const storeId = await loadDeliveryAdCampaignStoreId(sb, input.productKind, input.campaignId);
    await appendUserNotification(sb, {
      user_id: ownerUserId,
      notification_type: "system",
      // SRV-03: business notice to the owner, never marketing (no ad consent / quiet-hours gate).
      push_kind: "notice",
      title: notifySafeT(language, mapped.titleKey),
      body: notifySafeT(language, mapped.bodyKey),
      link_url: mapped.linkUrl,
      dedupe_key: mapped.dedupeKey,
      ref_id: input.campaignId,
      meta: {
        kind: mapped.metaKind,
        product_kind: input.productKind,
        campaign_id: input.campaignId,
        ...(storeId ? { store_id: storeId } : {}),
        case_id: input.caseId ?? null,
        thread_id: input.threadId ?? null,
        source_message_id: input.messageId,
      },
    });
  } catch (err) {
    console.error("[safeNotifyDeliveryAdHumanOwner]", input.messageId, err);
  }
}

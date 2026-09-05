/**
 * Notify Owner when Admin completes a Cash charge request.
 * Distinct from CUT3 campaign ops thread.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { appendUserNotification } from "@/lib/notifications/append-user-notification";
import { loadNotificationUserLanguage } from "@/lib/notifications/notification-user-language";
import { notifySafeT } from "@/lib/notifications/notify-safe-translate";
import { formatDeliveryAdPhpMinor } from "@/lib/stores/advertising/delivery-ad-commercial-labels";
import { DELIVERY_AD_OWNER_ROUTES } from "@/lib/stores/advertising/delivery-ad-routes";

export async function safeNotifyOwnerBusinessCashChargeCompleted(
  sb: SupabaseClient,
  input: {
    ownerUserId: string;
    requestId: string;
    amountMinor: number;
  }
): Promise<void> {
  try {
    const ownerUserId = String(input.ownerUserId ?? "").trim();
    const requestId = String(input.requestId ?? "").trim();
    if (!ownerUserId || !requestId) return;
    const language = await loadNotificationUserLanguage(sb, ownerUserId);
    const amount = formatDeliveryAdPhpMinor(input.amountMinor);
    await appendUserNotification(sb, {
      user_id: ownerUserId,
      notification_type: "system",
      push_kind: "marketing",
      title: notifySafeT(language, "notify_delivery_ad_cash_charge_completed_title"),
      body: notifySafeT(language, "notify_delivery_ad_cash_charge_completed_body", {
        vars: { amount },
      }),
      link_url: DELIVERY_AD_OWNER_ROUTES.hub,
      dedupe_key: `delivery_ad_cash_charge_ok:${requestId}`,
      ref_id: requestId,
      meta: {
        kind: "delivery_ad_business_cash_charge_completed",
        request_id: requestId,
        amount_minor: input.amountMinor,
      },
    });
  } catch (err) {
    console.error("[safeNotifyOwnerBusinessCashChargeCompleted]", input.requestId, err);
  }
}

export async function safeNotifyOwnerBusinessCashChargeRejected(
  sb: SupabaseClient,
  input: {
    ownerUserId: string;
    requestId: string;
  }
): Promise<void> {
  try {
    const ownerUserId = String(input.ownerUserId ?? "").trim();
    const requestId = String(input.requestId ?? "").trim();
    if (!ownerUserId || !requestId) return;
    const language = await loadNotificationUserLanguage(sb, ownerUserId);
    await appendUserNotification(sb, {
      user_id: ownerUserId,
      notification_type: "system",
      push_kind: "marketing",
      title: notifySafeT(language, "notify_delivery_ad_cash_charge_rejected_title"),
      body: notifySafeT(language, "notify_delivery_ad_cash_charge_rejected_body"),
      link_url: DELIVERY_AD_OWNER_ROUTES.hub,
      dedupe_key: `delivery_ad_cash_charge_reject:${requestId}`,
      ref_id: requestId,
      meta: {
        kind: "delivery_ad_business_cash_charge_rejected",
        request_id: requestId,
      },
    });
  } catch (err) {
    console.error("[safeNotifyOwnerBusinessCashChargeRejected]", input.requestId, err);
  }
}

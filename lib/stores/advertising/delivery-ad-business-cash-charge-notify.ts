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

/** B-04: 오너 알림함(매장 단위)에 보이도록 충전 요청의 매장 id 를 싣는다. 조회 실패 시 null(회원 쪽에 남음). */
async function loadCashChargeRequestStoreId(sb: SupabaseClient, requestId: string): Promise<string | null> {
  try {
    const { data } = await sb
      .from("business_cash_charge_requests")
      .select("store_id")
      .eq("id", requestId)
      .maybeSingle();
    const sid = String((data as { store_id?: unknown } | null)?.store_id ?? "").trim();
    return sid || null;
  } catch {
    // 매장 id 조회 실패가 알림 자체를 막지 않는다.
    return null;
  }
}

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
    const storeId = await loadCashChargeRequestStoreId(sb, requestId);
    const amount = formatDeliveryAdPhpMinor(input.amountMinor);
    await appendUserNotification(sb, {
      user_id: ownerUserId,
      notification_type: "system",
      // SRV-03: business notice to the owner, never marketing (no ad consent / quiet-hours gate).
      push_kind: "notice",
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
        ...(storeId ? { store_id: storeId } : {}),
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
    const storeId = await loadCashChargeRequestStoreId(sb, requestId);
    await appendUserNotification(sb, {
      user_id: ownerUserId,
      notification_type: "system",
      // SRV-03: business notice to the owner, never marketing (no ad consent / quiet-hours gate).
      push_kind: "notice",
      title: notifySafeT(language, "notify_delivery_ad_cash_charge_rejected_title"),
      body: notifySafeT(language, "notify_delivery_ad_cash_charge_rejected_body"),
      link_url: DELIVERY_AD_OWNER_ROUTES.hub,
      dedupe_key: `delivery_ad_cash_charge_reject:${requestId}`,
      ref_id: requestId,
      meta: {
        kind: "delivery_ad_business_cash_charge_rejected",
        ...(storeId ? { store_id: storeId } : {}),
        request_id: requestId,
      },
    });
  } catch (err) {
    console.error("[safeNotifyOwnerBusinessCashChargeRejected]", input.requestId, err);
  }
}

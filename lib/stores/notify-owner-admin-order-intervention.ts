/**
 * 관리자 주문 개입 → 사장님 알림 (DEF-67).
 * 구매자 알림은 applyStoreOrderStatusTransition 이 담당 — 여기서는 매장(사장님)만.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { MessageKey } from "@/lib/i18n/messages";
import { appendUserNotification } from "@/lib/notifications/append-user-notification";
import { loadNotificationUserLanguage } from "@/lib/notifications/notification-user-language";
import { notifySafeT } from "@/lib/notifications/notify-safe-translate";
import { OwnerRoutes } from "@/lib/business/owner-routes";

const ACTION_LABEL_KEY: Record<string, MessageKey> = {
  cancel_request_approve: "admin_store_order_intervention_cancel_request_approve",
  cancel_request_reject: "admin_store_order_intervention_cancel_request_reject",
  refund_approve: "admin_store_order_intervention_refund_approve",
  refund_reject: "admin_store_order_intervention_refund_reject",
  force_cancel: "admin_store_order_intervention_force_cancel",
  refund_request_create: "admin_store_order_intervention_refund_request_create",
};

export async function safeNotifyOwnerAdminOrderIntervention(
  sb: SupabaseClient,
  input: { orderId: string; action: string; reason: string | null }
): Promise<void> {
  try {
    const { data: order } = await sb
      .from("store_orders")
      .select("id, order_no, store_id, updated_at")
      .eq("id", input.orderId)
      .maybeSingle();
    const storeId = String((order as { store_id?: unknown } | null)?.store_id ?? "").trim();
    if (!storeId) return;
    const { data: store } = await sb
      .from("stores")
      .select("owner_user_id")
      .eq("id", storeId)
      .maybeSingle();
    const ownerUserId = String((store as { owner_user_id?: unknown } | null)?.owner_user_id ?? "").trim();
    if (!ownerUserId) return;
    const language = await loadNotificationUserLanguage(sb, ownerUserId);
    const orderNo =
      String((order as { order_no?: unknown } | null)?.order_no ?? "").trim() || input.orderId.slice(0, 8);
    const labelKey = ACTION_LABEL_KEY[input.action];
    const action = labelKey ? notifySafeT(language, labelKey) : input.action;
    await appendUserNotification(sb, {
      user_id: ownerUserId,
      notification_type: "system",
      push_kind: "notice",
      domain: "store",
      ref_id: input.orderId,
      title: notifySafeT(language, "notify_store_order_admin_intervention_title"),
      body: notifySafeT(language, "notify_store_order_admin_intervention_body", {
        vars: { order: orderNo, action, reason: String(input.reason ?? "").trim() || "-" },
      }),
      link_url: OwnerRoutes.orders(storeId),
      // D-7 — 키 = 이 개입으로 바뀐 주문 행의 갱신 시각 (같은 전이 재시도는 CAS 에서 막히고, 알림 재호출은 같은 키).
      dedupe_key: `admin_order_intervention:${input.orderId}:${input.action}:${String(
        (order as { updated_at?: unknown } | null)?.updated_at ?? ""
      )}`,
      meta: {
        kind: "admin_store_order_intervention",
        order_id: input.orderId,
        store_id: storeId,
        action: input.action,
      },
    });
  } catch (err) {
    console.error("[safeNotifyOwnerAdminOrderIntervention]", input.orderId, input.action, err);
  }
}

/**
 * Map notification insert → notification_targets bump (badge SSOT).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  OWNER_STORE_COMMERCE_NOTIFICATION_META_KINDS,
  BUYER_STORE_COMMERCE_NOTIFICATION_META_KINDS,
} from "@/lib/notifications/owner-store-commerce-notification-meta";
import { bumpNotificationTarget } from "@/lib/notifications/notification-targets";
import { buildTradeTargetId } from "@/lib/notifications/badge-target-policy";
import type { AppNotificationType } from "@/lib/notifications/append-user-notification";

export async function bumpNotificationTargetFromInboxRow(
  sb: SupabaseClient<any>,
  row: {
    user_id: string;
    notification_type: AppNotificationType;
    ref_id?: string | null;
    meta?: Record<string, unknown> | null;
  }
): Promise<void> {
  const uid = row.user_id.trim();
  if (!uid) return;

  const meta = row.meta ?? {};
  const kind = typeof meta.kind === "string" ? meta.kind.trim() : "";
  const orderId =
    (typeof meta.order_id === "string" ? meta.order_id.trim() : "") ||
    (typeof row.ref_id === "string" ? row.ref_id.trim() : "");

  if (row.notification_type === "chat") {
    return;
  }

  if (row.notification_type === "commerce" && orderId) {
    const storeId = typeof meta.store_id === "string" ? meta.store_id.trim() : null;
    if (OWNER_STORE_COMMERCE_NOTIFICATION_META_KINDS.has(kind)) {
      await bumpNotificationTarget(sb, {
        userId: uid,
        targetType: "owner_order",
        targetId: orderId,
        scope: "owner_store",
        storeId,
      });
      return;
    }
    if (BUYER_STORE_COMMERCE_NOTIFICATION_META_KINDS.has(kind)) {
      await bumpNotificationTarget(sb, {
        userId: uid,
        targetType: "buyer_order",
        targetId: orderId,
        scope: "consumer",
      });
      return;
    }
  }

  if (row.notification_type === "review") {
    const reviewId =
      (typeof meta.review_id === "string" ? meta.review_id.trim() : "") ||
      (typeof row.ref_id === "string" ? row.ref_id.trim() : "");
    const storeId = typeof meta.store_id === "string" ? meta.store_id.trim() : null;
    if (reviewId) {
      await bumpNotificationTarget(sb, {
        userId: uid,
        targetType: "store_review",
        targetId: reviewId,
        scope: "owner_store",
        storeId,
      });
    }
    return;
  }

  if (row.notification_type === "status" && kind === "trade_offer") {
    const productId = typeof meta.product_id === "string" ? meta.product_id.trim() : "";
    const sellerId = typeof meta.seller_id === "string" ? meta.seller_id.trim() : "";
    const buyerId = typeof meta.buyer_id === "string" ? meta.buyer_id.trim() : "";
    if (productId && sellerId && buyerId) {
      await bumpNotificationTarget(sb, {
        userId: uid,
        targetType: "trade",
        targetId: buildTradeTargetId(productId, sellerId, buyerId),
        scope: "consumer",
      });
    }
  }
}

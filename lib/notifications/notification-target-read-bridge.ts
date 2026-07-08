/**
 * notification_events read success -> notification_targets clear bridge.
 *
 * Phase 1-1 scope: keep badge source/authority unchanged; only clear stale targets
 * after an already-successful read so visible badges do not linger.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BUYER_STORE_COMMERCE_NOTIFICATION_META_KINDS,
  OWNER_STORE_COMMERCE_NOTIFICATION_META_KINDS,
} from "@/lib/notifications/owner-store-commerce-notification-meta";
import { buildTradeTargetId } from "@/lib/notifications/badge-target-policy";
import { clearMessengerRoomNotificationTargetAfterRead } from "@/lib/notifications/notification-target-messenger-bridge";
import { clearNotificationTarget } from "@/lib/notifications/notification-targets";

type ThreadReadTargetInput = {
  threadId: string;
  threadType?: string;
  readReason?: string;
};

async function clearOrderTargets(sb: SupabaseClient<any>, userId: string, orderId: string): Promise<void> {
  await Promise.all([
    clearNotificationTarget(sb, { userId, targetType: "buyer_order", targetId: orderId }),
    clearNotificationTarget(sb, { userId, targetType: "owner_order", targetId: orderId }),
  ]);
}

async function clearTradeTargetsForProduct(
  sb: SupabaseClient<any>,
  userId: string,
  productId: string
): Promise<void> {
  const uid = userId.trim();
  const pid = productId.trim();
  if (!uid || !pid) return;

  const { data, error } = await sb
    .from("notification_targets")
    .select("target_id")
    .eq("user_id", uid)
    .eq("target_type", "trade")
    .eq("is_unread", true)
    .like("target_id", `${pid}:%`);

  if (error || !Array.isArray(data) || data.length === 0) return;

  const targetIds = [
    ...new Set(
      data
        .map((row) => (typeof row?.target_id === "string" ? row.target_id.trim() : ""))
        .filter(Boolean)
    ),
  ];

  await Promise.all(
    targetIds.map((targetId) =>
      clearNotificationTarget(sb, {
        userId: uid,
        targetType: "trade",
        targetId,
      })
    )
  );
}

/** Legacy `notifications` inbox row → inverse of bumpNotificationTargetFromInboxRow. */
export async function clearNotificationTargetsForLegacyInboxRow(
  sb: SupabaseClient<any>,
  userId: string,
  row: {
    notification_type: string;
    ref_id?: string | null;
    meta?: Record<string, unknown> | null;
    link_url?: string | null;
    domain?: string | null;
    push_kind?: string | null;
  }
): Promise<void> {
  const uid = userId.trim();
  if (!uid) return;

  const meta = row.meta ?? {};
  const kind = typeof meta.kind === "string" ? meta.kind.trim() : "";
  const orderId =
    (typeof meta.order_id === "string" ? meta.order_id.trim() : "") ||
    (typeof row.ref_id === "string" ? row.ref_id.trim() : "");
  const postId =
    (typeof meta.post_id === "string" ? meta.post_id.trim() : "") ||
    (typeof meta.community_post_id === "string" ? meta.community_post_id.trim() : "");
  const productId = typeof meta.product_id === "string" ? meta.product_id.trim() : "";
  const sellerId = typeof meta.seller_id === "string" ? meta.seller_id.trim() : "";
  const buyerId = typeof meta.buyer_id === "string" ? meta.buyer_id.trim() : "";
  const storeId = typeof meta.store_id === "string" ? meta.store_id.trim() : null;

  if (postId) {
    await clearNotificationTarget(sb, {
      userId: uid,
      targetType: "community_post",
      targetId: postId,
    });
  }

  if (row.notification_type === "commerce" && orderId) {
    if (OWNER_STORE_COMMERCE_NOTIFICATION_META_KINDS.has(kind)) {
      await clearNotificationTarget(sb, {
        userId: uid,
        targetType: "owner_order",
        targetId: orderId,
        storeId,
      });
      return;
    }
    if (BUYER_STORE_COMMERCE_NOTIFICATION_META_KINDS.has(kind)) {
      await clearNotificationTarget(sb, {
        userId: uid,
        targetType: "buyer_order",
        targetId: orderId,
      });
      return;
    }
    await clearOrderTargets(sb, uid, orderId);
    return;
  }

  if (row.notification_type === "review") {
    const reviewId =
      (typeof meta.review_id === "string" ? meta.review_id.trim() : "") ||
      (typeof row.ref_id === "string" ? row.ref_id.trim() : "");
    if (reviewId) {
      await clearNotificationTarget(sb, {
        userId: uid,
        targetType: "store_review",
        targetId: reviewId,
        storeId,
      });
    }
    return;
  }

  if (row.notification_type === "status" && kind === "trade_offer" && productId && sellerId && buyerId) {
    await clearNotificationTarget(sb, {
      userId: uid,
      targetType: "trade",
      targetId: buildTradeTargetId(productId, sellerId, buyerId),
    });
  }
}

export async function clearNotificationTargetsAfterRoomRead(
  sb: SupabaseClient<any>,
  userId: string,
  roomId: string
): Promise<void> {
  const uid = userId.trim();
  const rid = roomId.trim();
  if (!uid || !rid) return;

  // CONTRACT (P0): bottom_nav_chat counts consumer chat_room targets keyed by room id.
  // Always clear on room read — messenger bridge trade/delivery branches must not skip this.
  await clearNotificationTarget(sb, {
    userId: uid,
    targetType: "chat_room",
    targetId: rid,
  });

  await clearMessengerRoomNotificationTargetAfterRead(sb, uid, rid);
}

export async function clearNotificationTargetsAfterThreadRead(
  sb: SupabaseClient<any>,
  userId: string,
  input: ThreadReadTargetInput
): Promise<void> {
  const uid = userId.trim();
  const threadId = input.threadId.trim();
  const threadType = String(input.threadType ?? "").trim();
  const readReason = String(input.readReason ?? "").trim();
  if (!uid || !threadId) return;

  if (threadType === "order") {
    await clearOrderTargets(sb, uid, threadId);
    return;
  }
  if (threadType === "community_post") {
    await clearNotificationTarget(sb, {
      userId: uid,
      targetType: "community_post",
      targetId: threadId,
    });
    return;
  }
  if (threadType === "chat_room") {
    await clearNotificationTargetsAfterRoomRead(sb, uid, threadId);
    return;
  }
  if (threadType === "trade_room") {
    if (readReason === "trade_detail_opened") {
      await clearTradeTargetsForProduct(sb, uid, threadId);
      return;
    }
    await clearNotificationTargetsAfterRoomRead(sb, uid, threadId);
  }
}

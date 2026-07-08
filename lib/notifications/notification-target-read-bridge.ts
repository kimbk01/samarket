/**
 * notification_events read success -> notification_targets clear bridge.
 *
 * Phase 1-1 scope: keep badge source/authority unchanged; only clear stale targets
 * after an already-successful read so visible badges do not linger.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
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

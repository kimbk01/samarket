/**
 * notification_targets — badge SSOT write/read helpers.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  BadgeTargetSurface,
  NotificationTargetScope,
  NotificationTargetType,
} from "@/lib/notifications/badge-target-policy";
import { invalidateNotificationUnreadCountCache } from "@/lib/notifications/notification-unread-count-cache";
import { invalidateUserChatUnreadCache } from "@/lib/chat/user-chat-unread-parts";
import { invalidateCommunityMessengerUnreadTotalCache } from "@/lib/community-messenger/community-messenger-unread-total";
import { invalidateOwnerHubBadgeCache } from "@/lib/chats/owner-hub-badge-cache";
import { getBlockedRelation } from "@/lib/community-messenger/social-relations";
import { isNotificationSuppressedForActor } from "@/lib/social/user-block-ssot";

export const UPSERT_NOTIFICATION_TARGET_RPC = "upsert_notification_target_unread";
export const CLEAR_NOTIFICATION_TARGET_RPC = "clear_notification_target";
export const COUNT_NOTIFICATION_TARGETS_RPC = "count_notification_targets";
export const COUNT_NOTIFICATION_TARGETS_HUB_BUNDLE_RPC = "count_notification_targets_hub_bundle";
export const BACKFILL_NOTIFICATION_TARGETS_RPC = "backfill_notification_targets";

export type NotificationTargetHubBundle = {
  bottom_nav_chat: number;
  bottom_nav_community: number;
  bottom_nav_delivery: number;
  fab_owner_orders: number;
  fab_owner_store: number;
  fab_owner_order_chat: number;
  owner_commerce_inbox: number;
};

const EMPTY_HUB_BUNDLE: NotificationTargetHubBundle = {
  bottom_nav_chat: 0,
  bottom_nav_community: 0,
  bottom_nav_delivery: 0,
  fab_owner_orders: 0,
  fab_owner_store: 0,
  fab_owner_order_chat: 0,
  owner_commerce_inbox: 0,
};

function isTargetRpcMissing(err: { message?: string } | null): boolean {
  return /notification_target|schema cache|function|does not exist/i.test(String(err?.message ?? ""));
}

export function invalidateBadgeTargetCaches(userId: string, storeId?: string | null): void {
  const uid = userId.trim();
  if (!uid) return;
  invalidateNotificationUnreadCountCache(uid, storeId ?? null);
  invalidateUserChatUnreadCache(uid);
  invalidateCommunityMessengerUnreadTotalCache(uid);
  invalidateOwnerHubBadgeCache(uid);
}

export async function bumpNotificationTarget(
  sb: SupabaseClient<any>,
  opts: {
    userId: string;
    targetType: NotificationTargetType;
    targetId: string;
    scope?: NotificationTargetScope;
    storeId?: string | null;
    meta?: Record<string, unknown> | null;
    /** 차단 관계면 badge bump 생략 */
    actorUserId?: string | null;
  }
): Promise<void> {
  const uid = opts.userId.trim();
  const tid = opts.targetId.trim();
  if (!uid || !tid) return;

  const actor = opts.actorUserId?.trim() ?? "";
  if (actor && actor !== uid) {
    const relation = await getBlockedRelation(uid, actor);
    if (isNotificationSuppressedForActor(relation)) return;
  }

  const { error } = await sb.rpc(UPSERT_NOTIFICATION_TARGET_RPC, {
    p_user_id: uid,
    p_target_type: opts.targetType,
    p_target_id: tid,
    p_scope: opts.scope ?? "consumer",
    p_store_id: opts.storeId?.trim() || null,
    p_meta: opts.meta ?? null,
  });

  if (error && !isTargetRpcMissing(error)) {
    console.warn("[bumpNotificationTarget]", error.message);
    return;
  }
  if (!error) {
    invalidateBadgeTargetCaches(uid, opts.storeId);
  }
}

export async function clearNotificationTarget(
  sb: SupabaseClient<any>,
  opts: {
    userId: string;
    targetType: NotificationTargetType;
    targetId: string;
    storeId?: string | null;
  }
): Promise<void> {
  const uid = opts.userId.trim();
  const tid = opts.targetId.trim();
  if (!uid || !tid) return;

  const { error } = await sb.rpc(CLEAR_NOTIFICATION_TARGET_RPC, {
    p_user_id: uid,
    p_target_type: opts.targetType,
    p_target_id: tid,
  });

  if (error && !isTargetRpcMissing(error)) {
    console.warn("[clearNotificationTarget]", error.message);
    return;
  }
  if (!error) {
    invalidateBadgeTargetCaches(uid, opts.storeId);
  }
}

export async function countNotificationTargets(
  sb: SupabaseClient<any>,
  userId: string,
  surface: BadgeTargetSurface,
  storeId?: string | null
): Promise<number> {
  const uid = userId.trim();
  if (!uid) return 0;

  const { data, error } = await sb.rpc(COUNT_NOTIFICATION_TARGETS_RPC, {
    p_user_id: uid,
    p_surface: surface,
    p_store_id: storeId?.trim() || null,
  });

  if (!error) {
    return Math.max(0, Math.floor(Number(data) || 0));
  }
  if (!isTargetRpcMissing(error)) {
    throw error;
  }
  return 0;
}

export async function countNotificationTargetsHubBundle(
  sb: SupabaseClient<any>,
  userId: string,
  storeId?: string | null
): Promise<NotificationTargetHubBundle> {
  const uid = userId.trim();
  if (!uid) return { ...EMPTY_HUB_BUNDLE };

  const { data, error } = await sb.rpc(COUNT_NOTIFICATION_TARGETS_HUB_BUNDLE_RPC, {
    p_user_id: uid,
    p_store_id: storeId?.trim() || null,
  });

  if (error) {
    if (!isTargetRpcMissing(error)) {
      console.warn("[countNotificationTargetsHubBundle]", error.message);
    }
    return { ...EMPTY_HUB_BUNDLE };
  }

  const d = (data ?? {}) as Record<string, unknown>;
  return {
    bottom_nav_chat: Math.max(0, Math.floor(Number(d.bottom_nav_chat) || 0)),
    bottom_nav_community: Math.max(0, Math.floor(Number(d.bottom_nav_community) || 0)),
    bottom_nav_delivery: Math.max(0, Math.floor(Number(d.bottom_nav_delivery) || 0)),
    fab_owner_orders: Math.max(0, Math.floor(Number(d.fab_owner_orders) || 0)),
    fab_owner_store: Math.max(0, Math.floor(Number(d.fab_owner_store) || 0)),
    fab_owner_order_chat: Math.max(0, Math.floor(Number(d.fab_owner_order_chat) || 0)),
    owner_commerce_inbox: Math.max(0, Math.floor(Number(d.owner_commerce_inbox) || 0)),
  };
}

export async function backfillNotificationTargets(
  sb: SupabaseClient<any>,
  userId?: string | null
): Promise<number> {
  const { data, error } = await sb.rpc(BACKFILL_NOTIFICATION_TARGETS_RPC, {
    p_user_id: userId?.trim() || null,
  });
  if (error && !isTargetRpcMissing(error)) {
    console.warn("[backfillNotificationTargets]", error.message);
    return 0;
  }
  return Math.max(0, Math.floor(Number(data) || 0));
}

/** CM participant unread bump — chat_room vs owner_order_chat */
export async function bumpChatRoomTargetFromMessengerParticipant(
  sb: SupabaseClient<any>,
  opts: {
    userId: string;
    roomId: string;
    isOwnerOrderChat?: boolean;
    storeId?: string | null;
  }
): Promise<void> {
  await bumpNotificationTarget(sb, {
    userId: opts.userId,
    targetType: opts.isOwnerOrderChat ? "owner_order_chat" : "chat_room",
    targetId: opts.roomId,
    scope: opts.isOwnerOrderChat ? "owner_store" : "consumer",
    storeId: opts.storeId,
  });
}

export async function clearChatRoomTargetFromMessengerRead(
  sb: SupabaseClient<any>,
  opts: {
    userId: string;
    roomId: string;
    isOwnerOrderChat?: boolean;
    storeId?: string | null;
  }
): Promise<void> {
  await clearNotificationTarget(sb, {
    userId: opts.userId,
    targetType: opts.isOwnerOrderChat ? "owner_order_chat" : "chat_room",
    targetId: opts.roomId,
    storeId: opts.storeId,
  });
}

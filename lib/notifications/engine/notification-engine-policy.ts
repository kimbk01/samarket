/**
 * Phase 2 — Policy → Decision (read-only; does not execute consumers or mutate Messaging Domain).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createNotificationDecision, type NotificationDecision } from "@/lib/notifications/engine/notification-decision";
import type { NotificationEngineIngress } from "@/lib/notifications/engine/notification-engine-ingress";
import { isRoomMutedForUser } from "@/lib/notifications/policy/notification-mute-policy";
import {
  loadRecipientPresenceSnapshot,
  resolvePresenceSuppressDecision,
} from "@/lib/notifications/policy/notification-presence-policy";

export type NotificationEnginePolicyContext = {
  sb?: SupabaseClient<any> | null;
};

export async function evaluateNotificationEngineDecision(
  ingress: NotificationEngineIngress,
  ctx: NotificationEnginePolicyContext = {}
): Promise<NotificationDecision> {
  if (ingress.kind === "room_read") {
    return createNotificationDecision({
      playSound: false,
      showBottomBadge: true,
      showListBadge: true,
      push: false,
      persist: true,
    });
  }

  // T0 Legacy Decision Snapshot — no mute/presence re-evaluation.
  if (ingress.decisionSnapshot) {
    return ingress.decisionSnapshot;
  }

  const roomId = ingress.roomId.trim();
  const recipientUserId = ingress.recipientUserId.trim();
  const suppressReasons: string[] = [];

  let muted = false;
  if (ctx.sb && roomId && recipientUserId) {
    muted = await isRoomMutedForUser(ctx.sb, recipientUserId, roomId);
    if (muted) suppressReasons.push("room_muted");
  }

  let presenceSuppress = {
    suppressPush: false,
    suppressSound: false,
    suppressBadge: false,
    autoRead: false,
    reason: null as string | null,
  };
  if (ctx.sb && roomId && recipientUserId) {
    const presence = await loadRecipientPresenceSnapshot(ctx.sb, recipientUserId);
    presenceSuppress = resolvePresenceSuppressDecision(presence, roomId);
    if (presenceSuppress.reason) suppressReasons.push(presenceSuppress.reason);
    if (presenceSuppress.autoRead) suppressReasons.push("auto_read_same_room");
  }

  const playSound = !muted && !presenceSuppress.suppressSound;
  const showBottomBadge = !presenceSuppress.suppressBadge;
  const showListBadge = !presenceSuppress.suppressBadge;
  const push = !muted && !presenceSuppress.suppressPush;

  return createNotificationDecision({
    playSound,
    showBottomBadge,
    showListBadge,
    push,
    persist: true,
    suppressReasons,
  });
}

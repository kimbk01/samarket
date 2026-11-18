/**
 * Phase 2 — Policy → Decision (read-only; does not execute consumers or mutate Messaging Domain).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createNotificationDecision, type NotificationDecision } from "@/lib/notifications/engine/notification-decision";
import type { NotificationEngineIngress } from "@/lib/notifications/engine/notification-engine-ingress";
import { isRoomMutedForUser } from "@/lib/notifications/policy/notification-mute-policy";

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

  /** D1 1단계 — presence 추측 없음(레거시 파이프라인과 같은 판정 · 수신자당 DB 읽기 1회 제거). */
  const playSound = !muted;
  const showBottomBadge = true;
  const showListBadge = true;
  const push = !muted;

  return createNotificationDecision({
    playSound,
    showBottomBadge,
    showListBadge,
    push,
    persist: true,
    suppressReasons,
  });
}
